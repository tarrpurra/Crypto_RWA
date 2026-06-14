from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import APIRouter, HTTPException

from services.agent.app.api.investment_scope import InvestmentScopeInput, build_scoped_decision_response
from services.agent.app.api.vault import get_vault_balance_snapshot
from services.agent.app.core.status_codes import ExecutionStatusCode
from services.agent.app.schemas.proposals import (
    InvestmentPlanRequest,
    InvestmentPlanResponse,
    ProposalExecuteResponse,
    ProposalListItem,
    ProposalListResponse,
    ProposalMutationResponse,
    TradeProposal,
)
from services.agent.app.schemas.recommendations import RecommendationResponse
from services.agent.modules.oracle.freshness import utc_now
# circular-safe: lazy import inside endpoint function
# from services.agent.modules.decisions import build_decision_context
from services.agent.modules.proposals.investment_planner import build_investment_plan, get_cached_plan_for_proposal
from services.agent.repositories.db.investment_plan_repository import InvestmentPlanRepository
from services.agent.repositories.db.models import InvestmentPlanRecord, TradeProposalRecord
from services.agent.repositories.db.session import create_session, init_db
from services.agent.strategies.allocation.rebalance import compute_rebalance
from services.agent.strategies.decision_templates.parser import generate_recommendation_reasoning


logger = logging.getLogger("services.agent.decisions.api")
router = APIRouter(tags=["decisions"])


def _ai_debug_value(payload: Any, field: str) -> Any:
    if payload is None:
        return None
    if isinstance(payload, dict):
        return payload.get(field)
    return getattr(payload, field, None)


def _address_to_symbol_map(settings) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for asset in settings.asset_registry.values():
        address = asset.get("address")
        symbol = asset.get("symbol")
        if not address or not symbol:
            continue
        mapping[str(address).lower()] = str(symbol)
    return mapping


def _safe_decimal(value: str | None) -> Decimal:
    try:
        return Decimal(str(value or "0"))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def _save_proposal_record(proposal: TradeProposal, calldata: str) -> None:
    """Persist a new TradeProposalRecord. Refuses to overwrite an existing row
    (Bug 3 fix: replaced session.merge() silent-upsert with an explicit
    SELECT-then-INSERT guard so that re-submissions do not corrupt state).
    """
    try:
        init_db()
        with create_session() as session:
            from sqlalchemy import select

            # Bug 3: check for an existing row before inserting so we never
            # silently overwrite an already-persisted proposal.
            existing = session.scalar(
                select(TradeProposalRecord).where(
                    TradeProposalRecord.proposal_id == proposal.proposal_id
                )
            )
            if existing is not None:
                logger.warning(
                    "_save_proposal_record: proposal_id=%s already exists, skipping overwrite",
                    proposal.proposal_id,
                )
                return

            record = TradeProposalRecord(
                proposal_id=proposal.proposal_id,
                plan_hash=proposal.plan_hash,
                wallet_or_vault=proposal.wallet_or_vault,
                router=proposal.payload.router,
                selector=proposal.payload.selector,
                calldata_hash=proposal.payload.calldataHash,
                token_in=proposal.payload.tokenIn,
                token_out=proposal.payload.tokenOut,
                recipient=proposal.payload.recipient,
                max_amount_in=str(proposal.payload.maxAmountIn),
                min_amount_out=str(proposal.payload.minAmountOut),
                native_value=str(proposal.payload.nativeValue),
                deadline=proposal.payload.deadline,
                proposal_expiry=proposal.payload.proposalExpiry,
                nonce=proposal.payload.nonce,
                status_code=proposal.status_code,
                risk_snapshot_id=proposal.risk_snapshot_id,
                calldata=calldata,
                created_at=proposal.created_at,
                updated_at=proposal.updated_at,
            )
            session.add(record)
            session.commit()
    except Exception as exc:
        logger.warning("Failed to persist proposal snapshot: %s", exc)


@router.get("/decisions", response_model=RecommendationResponse)
async def get_latest_decisions(
    wallet_address: str | None = None,
    deposit_asset_symbol: str | None = None,
    deposit_amount: float | None = None,
    risk_profile: str | None = None,
    allocation_mode: str | None = None,
) -> RecommendationResponse:
    logger.info(
        "Decision recommendation requested: wallet=%s deposit_asset=%s deposit_amount=%s risk_profile=%s allocation_mode=%s",
        wallet_address,
        deposit_asset_symbol,
        deposit_amount,
        risk_profile,
        allocation_mode,
    )
    if deposit_asset_symbol and deposit_amount and risk_profile:
        response = await build_scoped_decision_response(
            InvestmentScopeInput(
                wallet_address=wallet_address,
                deposit_asset_symbol=deposit_asset_symbol,
                deposit_amount=deposit_amount,
                risk_profile=risk_profile,
                allocation_mode=allocation_mode or "AI Suggested",
            )
        )
        logger.info(
            "Decision recommendation completed (scoped): status=%s status_code=%s recommended_action=%s confidence=%s ai_mode=%s used_fallback=%s",
            response.status,
            response.status_code,
            response.recommended_action,
            response.confidence,
            _ai_debug_value(response.ai_debug, "mode"),
            _ai_debug_value(response.ai_debug, "used_fallback"),
        )
        return response
    from services.agent.modules.decisions import build_decision_context
    context = await build_decision_context(wallet_address=wallet_address)
    try:
        decision, actions = compute_rebalance(
            context.portfolio,
            context.risk_snapshot,
            context.profile_name,
            target_weights_override=context.target_weights,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    reasoning_portfolio = context.actual_portfolio or context.portfolio
    response = await generate_recommendation_reasoning(reasoning_portfolio, context.risk_snapshot, decision, actions)
    logger.info(
        "Decision recommendation completed: status=%s status_code=%s recommended_action=%s confidence=%s ai_mode=%s used_fallback=%s",
        response.status,
        response.status_code,
        response.recommended_action,
        response.confidence,
        _ai_debug_value(response.ai_debug, "mode"),
        _ai_debug_value(response.ai_debug, "used_fallback"),
    )
    return response


@router.post("/proposals/create", response_model=InvestmentPlanResponse)
async def create_investment_plan(request: InvestmentPlanRequest) -> InvestmentPlanResponse:
    settings = get_settings()
    logger.info(
        "Investment plan requested: wallet=%s deposit_asset=%s deposit_amount=%s risk_profile=%s allocation_mode=%s manual_target_weights=%s",
        request.wallet_address,
        request.deposit_asset_symbol,
        request.deposit_amount,
        request.risk_profile,
        request.allocation_mode,
        request.manual_target_weights,
    )
    if not request.wallet_address:
        raise HTTPException(status_code=400, detail="wallet_address is required to create a trade proposal.")

    vault_snapshot = await get_vault_balance_snapshot(request.wallet_address)
    if not vault_snapshot.balances or _safe_decimal(vault_snapshot.total_value_usd) <= 0:
        raise HTTPException(
            status_code=400,
            detail="Deposit funds into the vault before AI can create trade proposals.",
        )

    execution_symbol = "WMNT" if request.deposit_asset_symbol.upper() == "MNT" else request.deposit_asset_symbol.upper()
    matching_balance = next(
        (balance for balance in vault_snapshot.balances if balance.asset_symbol.upper() == execution_symbol),
        None,
    )
    available_balance = _safe_decimal(matching_balance.balance if matching_balance is not None else "0")
    requested_amount = Decimal(str(request.deposit_amount))
    if available_balance < requested_amount:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Vault balance for {execution_symbol} is {available_balance.normalize():f}. "
                f"Deposit funds into the vault before creating a proposal for {requested_amount.normalize():f} {request.deposit_asset_symbol}."
            ),
        )

    from services.agent.modules.decisions import build_decision_context

    context = await build_decision_context(
        wallet_address=request.wallet_address,
        deposit_asset_symbol=request.deposit_asset_symbol,
        deposit_amount=request.deposit_amount,
        risk_profile=request.risk_profile,
        allocation_mode=request.allocation_mode,
    )
    plan_response, proposal_pairs = build_investment_plan(
        settings=settings,
        request=request,
        portfolio=context.portfolio_response,
        actual_portfolio=context.actual_portfolio_response,
        risk=context.risk_assessment,
    )
    logger.info(
        "Investment plan generated: status=%s status_code=%s linked_proposals=%d approval_enabled=%s",
        plan_response.status,
        plan_response.status_code,
        len(plan_response.linked_proposals),
        plan_response.approval_enabled,
    )
    for proposal, calldata in proposal_pairs:
        _save_proposal_record(proposal, calldata)
    if plan_response.linked_proposals:
        try:
            InvestmentPlanRepository().save_plan_for_proposals(plan_response)
        except Exception as exc:
            logger.warning("Failed to persist investment plan detail: %s", exc)
    return plan_response


@router.get("/proposals/{proposal_id}", response_model=InvestmentPlanResponse)
async def get_investment_plan_for_proposal(proposal_id: str) -> InvestmentPlanResponse:
    persisted = InvestmentPlanRepository().get_plan_for_proposal(proposal_id)
    if persisted is not None:
        return persisted
    cached = get_cached_plan_for_proposal(proposal_id)
    if cached is None:
        raise HTTPException(status_code=404, detail=f"No cached investment plan details are available for proposal {proposal_id}.")
    return cached


# Terminal states that can never be re-approved.
_APPROVE_TERMINAL_STATES = frozenset({
    "PROPOSAL_APPROVED",
    "PROPOSAL_EXECUTED",
    "PROPOSAL_REJECTED",
})


@router.post("/proposals/{proposal_id}/approve", response_model=ProposalMutationResponse)
async def approve_proposal(proposal_id: str) -> ProposalMutationResponse:
    """Approve a pending proposal.

    Bug 1 fix: validates the current status_code before overwriting it so that
    already-terminal proposals (APPROVED, EXECUTED, REJECTED) cannot be
    transitioned again.

    Bug 2 fix: performs the existence check and the status update inside a
    single DB session, eliminating the TOCTOU window that previously existed
    between two separate sessions.
    """
    init_db()
    # Cached plan blocker check (no DB session required).
    cached_plan = InvestmentPlanRepository().get_plan_for_proposal(proposal_id)
    if cached_plan is not None and (not cached_plan.approval_enabled or cached_plan.approval_blockers):
        blockers = cached_plan.approval_blockers or [cached_plan.status_reason]
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve: {'; '.join(blockers)}",
        )
    # Bug 1 & 2: single session — fetch, validate state, then update atomically.
    with create_session() as session:
        from sqlalchemy import select

        record = session.scalar(select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id))
        if not record:
            raise HTTPException(status_code=404, detail=f"Proposal not found: {proposal_id}")
        if record.status_code in _APPROVE_TERMINAL_STATES:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Cannot approve proposal {proposal_id}: "
                    f"current status is {record.status_code} which is a terminal state."
                ),
            )
        record.status_code = "PROPOSAL_APPROVED"
        record.updated_at = utc_now()
        session.commit()
    return ProposalMutationResponse(
        status="ok",
        status_code="PROPOSAL_APPROVED",
        status_label="PROPOSAL_APPROVED",
        status_reason="Proposal approved by operator.",
        proposal_id=proposal_id,
        message=f"Proposal {proposal_id} successfully approved by operator.",
    )


# Terminal states that can never be re-rejected.
_REJECT_TERMINAL_STATES = frozenset({
    "PROPOSAL_EXECUTED",
    "PROPOSAL_REJECTED",
})


@router.post("/proposals/{proposal_id}/reject", response_model=ProposalMutationResponse)
async def reject_proposal(proposal_id: str) -> ProposalMutationResponse:
    """Reject a pending or approved proposal.

    Bug 1 fix: validates the current status_code before overwriting it — an
    already-executed or already-rejected proposal cannot be re-rejected.

    Bug 2 fix: the existence check and the status update now run inside a
    single DB session, closing the TOCTOU window.
    """
    init_db()
    # Bug 1 & 2: single session — fetch, validate state, then update atomically.
    with create_session() as session:
        from sqlalchemy import select

        record = session.scalar(select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id))
        if not record:
            raise HTTPException(status_code=404, detail=f"Proposal not found: {proposal_id}")
        if record.status_code in _REJECT_TERMINAL_STATES:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Cannot reject proposal {proposal_id}: "
                    f"current status is {record.status_code} which is a terminal state."
                ),
            )
        record.status_code = "PROPOSAL_REJECTED"
        record.updated_at = utc_now()
        session.commit()
    return ProposalMutationResponse(
        status="ok",
        status_code="PROPOSAL_REJECTED",
        status_label="PROPOSAL_REJECTED",
        status_reason="Proposal rejected by operator.",
        proposal_id=proposal_id,
        message=f"Proposal {proposal_id} successfully rejected.",
    )


@router.get("/proposals", response_model=ProposalListResponse)
async def list_proposals(status: str | None = None) -> ProposalListResponse:
    """Return the trade proposal queue.

    Bug 4 fix: the previous implementation loaded *all* InvestmentPlanRecord
    rows in a second query and then joined them in Python, which is an N+1
    pattern at scale. The query now uses a LEFT OUTER JOIN so both tables are
    fetched in a single round-trip, and the status filter is applied to the
    joined result set before any data is transferred.
    """
    init_db()
    with create_session() as session:
        from sqlalchemy import select, outerjoin

        # Bug 4: single joined query instead of two separate queries +
        # in-Python merge.
        joined = outerjoin(
            TradeProposalRecord,
            InvestmentPlanRecord,
            TradeProposalRecord.proposal_id == InvestmentPlanRecord.proposal_id,
        )
        query = (
            select(TradeProposalRecord, InvestmentPlanRecord.plan_json)
            .select_from(joined)
            .order_by(TradeProposalRecord.created_at.desc())
        )
        if status:
            query = query.where(TradeProposalRecord.status_code == status)
        rows = session.execute(query).all()

    items = [
        ProposalListItem(
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
            approval_enabled=(plan_json or {}).get("approval_enabled"),
            approval_blockers=list((plan_json or {}).get("approval_blockers") or []),
            created_at=record.created_at,
            updated_at=record.updated_at,
        )
        for record, plan_json in rows
    ]
    return ProposalListResponse(
        status="ok",
        status_code="DATA_FRESH",
        status_label="DATA_FRESH",
        status_reason="Trade proposal queue loaded.",
        proposals=items,
    )


@router.post("/proposals/{proposal_id}/execute", response_model=ProposalExecuteResponse)
async def execute_proposal(proposal_id: str) -> ProposalExecuteResponse:
    logger.warning(
        "Direct wallet execution endpoint blocked for proposal_id=%s because approved trades must execute from the ExecutorVault path.",
        proposal_id,
    )
    raise HTTPException(
        status_code=409,
        detail=(
            "Direct connected-wallet execution is disabled. "
            "Deposit funds into the vault and execute approved trades through the ExecutorVault path only."
        ),
    )
