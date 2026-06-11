from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select

from services.agent.app.schemas.allocation import AllocationDecision, AllocationDecisionResponse
from services.agent.app.schemas.dashboard import DashboardFreshnessPayload
from services.agent.app.schemas.proposals import ProposalListItem
from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.models import AllocationDecisionRecord, TradeProposalRecord
from services.agent.repositories.db.portfolio_repository import PortfolioSnapshotRepository
from services.agent.repositories.db.risk_repository import RiskAssessmentRepository
from services.agent.repositories.db.session import create_session, init_db


MAX_FRESH_AGE_SECONDS = 60


def _as_aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _latest_pending_proposal(wallet_address: str | None) -> ProposalListItem | None:
    init_db()
    statement = select(TradeProposalRecord).order_by(TradeProposalRecord.created_at.desc())
    if wallet_address:
        statement = statement.where(TradeProposalRecord.wallet_or_vault == wallet_address)

    with create_session() as session:
        records = session.scalars(statement).all()

    active_statuses = {"EXECUTION_READY", "PROPOSAL_APPROVED", "PROPOSAL_PENDING_APPROVAL"}
    record = next((item for item in records if item.status_code in active_statuses), None)
    if record is None:
        return None

    return ProposalListItem(
        proposal_id=record.proposal_id,
        plan_hash=record.plan_hash,
        wallet_or_vault=record.wallet_or_vault,
        router=record.router,
        selector=record.selector,
        token_in=record.token_in,
        token_out=record.token_out,
        recipient=record.recipient,
        max_amount_in=record.max_amount_in,
        min_amount_out=record.min_amount_out,
        native_value=record.native_value,
        deadline=record.deadline,
        proposal_expiry=record.proposal_expiry,
        nonce=record.nonce,
        status_code=record.status_code,
        risk_snapshot_id=record.risk_snapshot_id,
        approval_enabled=None,
        approval_blockers=[],
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _latest_allocation_recommendation(wallet_address: str | None) -> AllocationDecisionResponse | None:
    init_db()
    statement = select(AllocationDecisionRecord).order_by(AllocationDecisionRecord.created_at.desc())
    if wallet_address:
        statement = statement.where(AllocationDecisionRecord.wallet_or_vault == wallet_address)

    with create_session() as session:
        record = session.scalars(statement).first()

    if record is None:
        return None

    decision = AllocationDecision(
        decision_id=record.decision_id,
        wallet_or_vault=record.wallet_or_vault,
        profile_name=record.profile_name,
        current_weights=record.current_weights_json,
        target_weights=record.target_weights_json,
        recommended_action=record.recommended_action,
        confidence=record.confidence,
        reasoning=record.reasoning,
        risk_snapshot_id=record.risk_snapshot_id,
        status_code=record.status_code,
        created_at=record.created_at,
    )
    return AllocationDecisionResponse(
        status="degraded" if decision.recommended_action == "PAUSE" else "ok",
        status_code=decision.status_code,
        status_label=decision.status_code,
        status_reason=decision.reasoning,
        generated_at=record.created_at,
        decision=decision,
        rebalance_actions=[],
    )


def _freshness_payload(*, timestamps: list[datetime | None]) -> DashboardFreshnessPayload:
    normalized = [_as_aware_utc(value) for value in timestamps if value is not None]
    latest_updated_at = max(normalized) if normalized else None
    now = utc_now()
    age_seconds = int((now - latest_updated_at).total_seconds()) if latest_updated_at else None
    freshness_status = (
        "empty"
        if latest_updated_at is None
        else "fresh"
        if age_seconds is not None and age_seconds <= MAX_FRESH_AGE_SECONDS
        else "stale"
    )
    return DashboardFreshnessPayload(
        updated_at=latest_updated_at.isoformat() if latest_updated_at else None,
        age_seconds=age_seconds,
        status=freshness_status,
    )


def get_dashboard_summary(wallet_address: str | None):
    portfolio = PortfolioSnapshotRepository().latest_snapshot(portfolio_address=wallet_address)
    risk = RiskAssessmentRepository().latest_assessment()
    allocation = _latest_allocation_recommendation(wallet_address)
    pending_proposal = _latest_pending_proposal(wallet_address)

    freshness = _freshness_payload(
        timestamps=[
            portfolio.generated_at if portfolio is not None else None,
            risk.generated_at if risk is not None else None,
            allocation.generated_at if allocation is not None else None,
            pending_proposal.updated_at if pending_proposal is not None else None,
        ]
    )

    return {
        "portfolio": portfolio,
        "risk": risk,
        "allocation": allocation,
        "latest_decision": None,
        "pending_proposal": pending_proposal,
        "alerts": [],
        "freshness": freshness,
        "mode": "live",
    }
