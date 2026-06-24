from __future__ import annotations

from sqlalchemy import select

from services.agent.app.schemas.allocation import AllocationDecision, AllocationDecisionResponse
from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.models import AllocationDecisionRecord
from services.agent.repositories.db.session import create_session, init_db


class AllocationDecisionRepository:
    def __init__(self) -> None:
        init_db()

    def save_decision(self, response: AllocationDecisionResponse) -> None:
        decision = response.decision
        with create_session() as session:
            session.merge(
                AllocationDecisionRecord(
                    decision_id=decision.decision_id,
                    wallet_or_vault=decision.wallet_or_vault,
                    profile_name=decision.profile_name,
                    current_weights_json=decision.current_weights,
                    target_weights_json=decision.target_weights,
                    recommended_action=decision.recommended_action,
                    confidence=decision.confidence,
                    reasoning=decision.reasoning,
                    risk_snapshot_id=decision.risk_snapshot_id,
                    status_code=decision.status_code,
                    created_at=decision.created_at,
                )
            )
            session.commit()

    def latest_decision(self, wallet_address: str | None = None) -> AllocationDecisionResponse | None:
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
            generated_at=record.created_at or utc_now(),
            decision=decision,
            rebalance_actions=[],
        )
