from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import APIRouter, HTTPException

from services.agent.app.core.cache import decision_cache, get_cache, set_cache
from services.agent.app.api.investment_scope import InvestmentScopeInput, build_scoped_decision_response
from services.agent.app.api.vault import get_vault_balance_snapshot
from services.agent.app.core.settings import RuntimeMode, Settings, get_settings
from services.agent.app.core.status_codes import ExecutionTrigger, ProposalStatusCode
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
from services.agent.modules.execution.execution_service import (
    AutoExecutionResult,
    execute_approved_proposal_if_allowed,
    is_auto_execute_on_approval_enabled,
)
from services.agent.modules.execution.vault_executor import submit_executor_vault_trade
from services.agent.modules.proposals.investment_planner import build_investment_plan, get_cached_plan_for_proposal
from services.agent.repositories.db.decision_repository import DecisionRecommendationRepository
from services.agent.repositories.db.investment_plan_repository import InvestmentPlanRepository
from services.agent.repositories.db.models import InvestmentPlanRecord, TradeExecutionRecord, TradeProposalRecord
from services.agent.repositories.db.session import create_session, init_db
from services.agent.strategies.allocation.rebalance import compute_rebalance
from services.agent.strategies.decision_templates.parser import generate_recommendation_reasoning


logger = logging.getLogger("services.agent.decisions.api")
router = APIRouter(tags=["decisions"])
_DECISION_CACHE_PREFIX = "decisions:latest"


def _ai_debug_value(payload: Any, field: str) -> Any:
    if payload is None:
        return None
    if isinstance(payload, dict):
        return payload.get(field)
    return getattr(payload, field, None)


def _safe_decimal(value: str | None) -> Decimal:
    try:
        return Decimal(str(value or "0"))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def _linked_summary_for_proposal(plan_json: dict[str, Any] | None, proposal_id: str) -> dict[str, Any]:
    if not isinstance(plan_json, dict):
        return {}
    linked = plan_json.get("linked_proposals")
    if not isinstance(linked, list):
        return {}
    for item in linked:
        if isinstance(item, dict) and item.get("proposal_id") == proposal_id:
            return item
    return {}


def _risk_summary_for_proposal(plan_json: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(plan_json, dict):
        return {}
    risk_assessment = plan_json.get("risk_assessment")
    if isinstance(risk_assessment, dict):
        return risk_assessment
    return {}


def _token_decimals_by_address(settings: Settings) -> dict[str, int]:
    decimals_by_address: dict[str, int] = {}
    for asset in settings.asset_registry.values():
        address = str(asset.get("address") or "").strip().lower()
        if not address:
            continue
        try:
            decimals_by_address[address] = int(asset.get("decimals") or 18)
        except Exception:
            decimals_by_address[address] = 18
    return decimals_by_address


def _proposal_amount_for_list_item(
    *,
    record: TradeProposalRecord,
    linked_summary: dict[str, Any],
    token_decimals_by_address: dict[str, int],
) -> float | None:
    linked_amount = linked_summary.get("amount")
    if isinstance(linked_amount, (int, float)) and linked_amount > 0:
        return float(linked_amount)

    raw_amount = _safe_decimal(record.max_amount_in)
    if raw_amount <= 0:
        return None

    decimals = token_decimals_by_address.get(str(record.token_in or "").lower(), 18)
    try:
        human_amount = raw_amount / (Decimal(10) ** decimals)
    except Exception:
        return None
    return float(human_amount) if human_amount > 0 else None


def _select_ai_winner_proposal_id(linked_proposals: list[Any]) -> str | None:
    if not linked_proposals:
        return None
    winner = max(
        linked_proposals,
        key=lambda item: (
            float(getattr(item, "amount", 0.0) or 0.0),
            str(getattr(item, "token_out_symbol", "") or ""),
            str(getattr(item, "proposal_id", "") or ""),
        ),
    )
    return getattr(winner, "proposal_id", None)


def _ai_auto_execution_enabled() -> bool:
    settings = get_settings()
    return (
        settings.ai_decision_maker_enabled
        and settings.runtime_mode == RuntimeMode.LIVE
    )


def _save_recommendation_snapshot(
    response: RecommendationResponse,
    *,
    wallet_address: str | None,
    scope_type: str,
    deposit_asset_symbol: str | None = None,
    deposit_amount: float | None = None,
    risk_profile: str | None = None,
    allocation_mode: str | None = None,
) -> None:
    try:
        DecisionRecommendationRepository().save_recommendation(
            response,
            wallet_address=wallet_address,
            scope_type=scope_type,
            deposit_asset_symbol=deposit_asset_symbol,
            deposit_amount=deposit_amount,
            risk_profile=risk_profile,
            allocation_mode=allocation_mode,
        )
    except Exception as exc:
        logger.warning("Failed to persist decision recommendation snapshot: %s", exc)


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


def _execute_proposal_submission(
    proposal_id: str,
    *,
    trigger: str = ExecutionTrigger.MANUAL_EXECUTE,
    settings: Settings | None = None,
) -> ProposalExecuteResponse:
    settings = settings or get_settings()
    result: AutoExecutionResult = execute_approved_proposal_if_allowed(
        proposal_id=proposal_id,
        trigger=trigger,
        settings=settings,
    )
    if result.status == "SKIPPED" and result.reason and "not found" in result.reason.lower():
        raise HTTPException(status_code=404, detail=result.reason)
    if result.status in ("BLOCKED", "SKIPPED"):
        raise HTTPException(
            status_code=409,
            detail=result.reason or f"Execution blocked: {result.status}",
        )
    if result.status == "ALREADY_EXECUTED":
        raise HTTPException(
            status_code=409,
            detail=f"Proposal {proposal_id} has already been executed (tx={result.tx_hash}).",
        )
    init_db()
    with create_session() as session:
        from sqlalchemy import select

        record = session.scalar(
            select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id)
        )
    chain_id = settings.effective_chain_id
    return ProposalExecuteResponse(
        status="ok",
        status_code=result.status,
        status_label=result.status,
        status_reason=result.reason or "",
        proposal_id=proposal_id,
        tx_hash=result.tx_hash,
        chain_id=chain_id,
        router=record.router if record else None,
        selector=record.selector if record else None,
        calldata=record.calldata if record else None,
        calldata_hash=record.calldata_hash if record else None,
        token_in=record.token_in if record else None,
        token_out=record.token_out if record else None,
        recipient=record.recipient if record else None,
        max_amount_in=record.max_amount_in if record else None,
        min_amount_out=record.min_amount_out if record else None,
        native_value=record.native_value if record else None,
        deadline=int(record.deadline) if record else None,
        nonce=int(record.nonce) if record else None,
    )


def _fetch_proposal_record(proposal_id: str) -> TradeProposalRecord | None:
    with create_session() as session:
        from sqlalchemy import select

        return session.scalar(select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id))


def _update_proposal_status(proposal_id: str, status_code: str) -> TradeProposalRecord:
    with create_session() as session:
        from sqlalchemy import select

        record = session.scalar(select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id))
        if record is None:
            raise HTTPException(status_code=404, detail=f"Proposal not found: {proposal_id}")
        record.status_code = status_code
        record.updated_at = utc_now()
        session.commit()
        session.refresh(record)
        return record


def _transition_proposal_status(
    proposal_id: str,
    *,
    next_status: str,
    forbidden_statuses: frozenset[str],
) -> TradeProposalRecord:
    with create_session() as session:
        from sqlalchemy import select

        record = session.scalar(
            select(TradeProposalRecord).where(
                TradeProposalRecord.proposal_id == proposal_id
            )
        )
        if record is None:
            raise HTTPException(status_code=404, detail=f"Proposal not found: {proposal_id}")
        if record.status_code in forbidden_statuses:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Cannot transition proposal {proposal_id} to {next_status}: "
                    f"current status is {record.status_code}."
                ),
            )
        record.status_code = next_status
        record.updated_at = utc_now()
        session.commit()
        session.refresh(record)
        return record


@router.get("/decisions", response_model=RecommendationResponse)
async def get_latest_decisions(
    wallet_address: str | None = None,
    deposit_asset_symbol: str | None = None,
    deposit_amount: float | None = None,
    risk_profile: str | None = None,
    allocation_mode: str | None = None,
    force_refresh: bool = False,
) -> RecommendationResponse:
    from services.agent.modules.decisions import build_decision_context

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
        _save_recommendation_snapshot(
            response,
            wallet_address=wallet_address,
            scope_type="deposit",
            deposit_asset_symbol=deposit_asset_symbol,
            deposit_amount=deposit_amount,
            risk_profile=risk_profile,
            allocation_mode=allocation_mode,
        )
        return response
    cache_key = f"{_DECISION_CACHE_PREFIX}:{(wallet_address or '').lower()}"
    if not force_refresh:
        cached = get_cache(decision_cache, cache_key)
        if cached is not None:
            return cached
        latest = DecisionRecommendationRepository().latest_recommendation(
            wallet_address=wallet_address,
            scope_type="wallet",
        )
        if latest is not None:
            set_cache(decision_cache, cache_key, latest)
            return latest
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
    _save_recommendation_snapshot(response, wallet_address=wallet_address, scope_type="wallet")
    set_cache(decision_cache, cache_key, response)
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
        "Investment plan generated: status=%s status_code=%s linked_proposals=%d approval_enabled=%s ai_decision_maker_enabled=%s",
        plan_response.status,
        plan_response.status_code,
        len(plan_response.linked_proposals),
        plan_response.approval_enabled,
        settings.ai_decision_maker_enabled,
    )
    ai_auto_execution_enabled = _ai_auto_execution_enabled()
    if plan_response.linked_proposals:
        logger.info(
            "Investment plan approval mode: %s",
            "AI auto-approval enabled"
            if ai_auto_execution_enabled
            else "Human approval required",
        )
    ai_winner_proposal_id = None
    if ai_auto_execution_enabled and len(plan_response.linked_proposals) > 1:
        ai_winner_proposal_id = _select_ai_winner_proposal_id(plan_response.linked_proposals)
        if ai_winner_proposal_id:
            logger.info(
                "AI access selected proposal %s as the best deal and will reject %d competing proposal(s).",
                ai_winner_proposal_id,
                len(plan_response.linked_proposals) - 1,
            )
            proposal_by_id = {proposal.proposal_id: proposal for proposal, _ in proposal_pairs}
            linked_by_id = {linked.proposal_id: linked for linked in plan_response.linked_proposals}
            for proposal_id, proposal in proposal_by_id.items():
                if proposal_id == ai_winner_proposal_id:
                    proposal.status_code = "PROPOSAL_APPROVED"
                    if proposal_id in linked_by_id:
                        linked_by_id[proposal_id].status_code = "PROPOSAL_APPROVED"
                else:
                    proposal.status_code = "PROPOSAL_REJECTED"
                    if proposal_id in linked_by_id:
                        linked_by_id[proposal_id].status_code = "PROPOSAL_REJECTED"
    elif ai_auto_execution_enabled and plan_response.linked_proposals:
        ai_winner_proposal_id = plan_response.linked_proposals[0].proposal_id
        plan_response.linked_proposals[0].status_code = "PROPOSAL_APPROVED"
        if proposal_pairs:
            proposal_pairs[0][0].status_code = "PROPOSAL_APPROVED"
        logger.info("AI access selected the only available proposal %s.", ai_winner_proposal_id)
    for proposal, calldata in proposal_pairs:
        _save_proposal_record(proposal, calldata)
    if ai_auto_execution_enabled and ai_winner_proposal_id:
        execution_result = execute_approved_proposal_if_allowed(
            proposal_id=ai_winner_proposal_id,
            trigger=ExecutionTrigger.AI_CREATE,
            settings=settings,
        )
        linked_by_id = {linked.proposal_id: linked for linked in plan_response.linked_proposals}
        proposal_by_id = {proposal.proposal_id: proposal for proposal, _ in proposal_pairs}
        if execution_result.status == "ALREADY_EXECUTED":
            executed_status = "PROPOSAL_EXECUTED"
        elif execution_result.status == "EXECUTION_CONFIRMED":
            executed_status = "PROPOSAL_EXECUTED"
        elif execution_result.status == "EXECUTION_SUBMITTED":
            executed_status = "PROPOSAL_EXECUTING"
        elif execution_result.status == "FAILED":
            executed_status = "PROPOSAL_EXECUTION_FAILED_RETRYABLE" if execution_result.retryable else "PROPOSAL_FAILED"
        elif execution_result.status == "BLOCKED":
            executed_status = "PROPOSAL_APPROVED"
        else:
            executed_status = "PROPOSAL_FAILED"
        if ai_winner_proposal_id in linked_by_id:
            linked_by_id[ai_winner_proposal_id].status_code = executed_status
        if ai_winner_proposal_id in proposal_by_id:
            proposal_by_id[ai_winner_proposal_id].status_code = executed_status
        plan_response.metadata["ai_auto_execution_active"] = True
        plan_response.metadata["ai_execution_status"] = execution_result.status
        plan_response.metadata["ai_execution_tx_hash"] = execution_result.tx_hash
        plan_response.metadata["ai_winner_proposal_id"] = ai_winner_proposal_id
        plan_response.status_reason = execution_result.reason or plan_response.status_reason
        if execution_result.status == "FAILED":
            plan_response.status = "degraded"
            plan_response.status_code = "EXECUTION_FAILED"
            plan_response.status_label = "EXECUTION_FAILED"
            plan_response.status_reason = f"AI auto-approved the trade proposal, but execution failed: {execution_result.error}"
            plan_response.metadata["ai_execution_error"] = execution_result.error
        elif execution_result.status == "BLOCKED":
            plan_response.status = "degraded"
            plan_response.status_code = "EXECUTION_BLOCKED"
            plan_response.status_label = "EXECUTION_BLOCKED"
            plan_response.status_reason = execution_result.reason or "Execution blocked by guard checks"
        logger.info(
            "AI auto-execution result for proposal %s: status=%s tx_hash=%s",
            ai_winner_proposal_id,
            execution_result.status,
            execution_result.tx_hash,
        )
    elif ai_auto_execution_enabled:
        plan_response.metadata["ai_auto_execution_active"] = True

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

    If AUTO_EXECUTE_ON_HUMAN_APPROVAL is enabled and all safety checks pass,
    the approved proposal will be automatically executed.

    Approval is independent of execution — approval succeeds even if execution
    fails, allowing manual retry via /execute.
    """
    init_db()
    settings = get_settings()
    # Cached plan blocker check (no DB session required).
    cached_plan = InvestmentPlanRepository().get_plan_for_proposal(proposal_id)
    if cached_plan is not None and (not cached_plan.approval_enabled or cached_plan.approval_blockers):
        blockers = cached_plan.approval_blockers or [cached_plan.status_reason]
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve: {'; '.join(blockers)}",
        )
    logger.info("Human approval requested for proposal %s", proposal_id)
    _transition_proposal_status(
        proposal_id,
        next_status="PROPOSAL_APPROVED",
        forbidden_statuses=_APPROVE_TERMINAL_STATES,
    )
    logger.info("Human approval recorded for proposal %s", proposal_id)
    # Record approved_by
    init_db()
    with create_session() as session:
        from sqlalchemy import select

        record = session.scalar(
            select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id)
        )
        if record is not None:
            record.approved_by = "operator"
            record.approved_at = utc_now()
            session.commit()

    auto_execution_result: AutoExecutionResult | None = None
    if is_auto_execute_on_approval_enabled(settings):
        logger.info(
            "Auto-execution triggered for proposal %s after human approval.",
            proposal_id,
        )
        auto_execution_result = execute_approved_proposal_if_allowed(
            proposal_id=proposal_id,
            trigger=ExecutionTrigger.HUMAN_APPROVAL,
            settings=settings,
        )
        logger.info(
            "Auto-execution result for proposal %s: attempted=%s status=%s",
            proposal_id,
            auto_execution_result.attempted,
            auto_execution_result.status,
        )
    # Build response — approval always succeeds, execution result is advisory.
    message = f"Proposal {proposal_id} successfully approved by operator."
    resp_status_code = "PROPOSAL_APPROVED"
    resp_status_reason = "Proposal approved by operator."
    auto_exec_info = None
    if auto_execution_result is not None:
        from services.agent.app.schemas.proposals import AutoExecutionInfo as AEI
        auto_exec_info = AEI(
            attempted=auto_execution_result.attempted,
            status=auto_execution_result.status,
            tx_hash=auto_execution_result.tx_hash,
            error=auto_execution_result.error,
            retryable=auto_execution_result.retryable,
        )
        if auto_execution_result.attempted:
            resp_status_reason = f"Proposal approved. Auto-execution: {auto_execution_result.status}."
            if auto_execution_result.status == "EXECUTION_CONFIRMED":
                message = f"Proposal {proposal_id} approved and executed (tx={auto_execution_result.tx_hash})."
                resp_status_code = "PROPOSAL_EXECUTED"
            elif auto_execution_result.status == "FAILED":
                message = (
                    f"Proposal {proposal_id} approved but execution failed: "
                    f"{auto_execution_result.error}. "
                    f"You can retry via POST /proposals/{proposal_id}/execute."
                )
                resp_status_reason = f"Proposal approved. Auto-execution failed: {auto_execution_result.error}."
        elif auto_execution_result.status == "BLOCKED":
            resp_status_reason = f"Proposal approved but execution blocked: {auto_execution_result.reason}."
    return ProposalMutationResponse(
        status="ok",
        status_code=resp_status_code,
        status_label=resp_status_code,
        status_reason=resp_status_reason,
        proposal_id=proposal_id,
        message=message,
        auto_execution=auto_exec_info,
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
    _transition_proposal_status(
        proposal_id,
        next_status="PROPOSAL_REJECTED",
        forbidden_statuses=_REJECT_TERMINAL_STATES,
    )
    return ProposalMutationResponse(
        status="ok",
        status_code="PROPOSAL_REJECTED",
        status_label="PROPOSAL_REJECTED",
        status_reason="Proposal rejected by operator.",
        proposal_id=proposal_id,
        message=f"Proposal {proposal_id} successfully rejected.",
    )


@router.get("/proposals", response_model=ProposalListResponse)
async def list_proposals(status: str | None = None, wallet_address: str | None = None) -> ProposalListResponse:
    """Return the trade proposal queue.

    Bug 4 fix: the previous implementation loaded *all* InvestmentPlanRecord
    rows in a second query and then joined them in Python, which is an N+1
    pattern at scale. The query now uses a LEFT OUTER JOIN so both tables are
    fetched in a single round-trip, and the status filter is applied to the
    joined result set before any data is transferred.
    """
    init_db()
    with create_session() as session:
        from sqlalchemy import func, outerjoin, select

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
        if wallet_address:
            query = query.where(func.lower(TradeProposalRecord.wallet_or_vault) == wallet_address.lower())
        rows = session.execute(query).all()

    token_decimals_by_address = _token_decimals_by_address(get_settings())
    items: list[ProposalListItem] = []
    for record, plan_json in rows:
        linked_summary = _linked_summary_for_proposal(plan_json, record.proposal_id)
        risk_summary = _risk_summary_for_proposal(plan_json)
        items.append(
            ProposalListItem(
                proposal_id=record.proposal_id,
                plan_hash=record.plan_hash,
                wallet_or_vault=record.wallet_or_vault,
                router=record.router,
                selector=record.selector,
                token_in=record.token_in,
                token_out=record.token_out,
                token_in_symbol=linked_summary.get("token_in_symbol"),
                token_out_symbol=linked_summary.get("token_out_symbol"),
                recipient=record.recipient,
                max_amount_in=record.max_amount_in,
                min_amount_out=record.min_amount_out,
                native_value=record.native_value,
                deadline=record.deadline,
                proposal_expiry=record.proposal_expiry,
                nonce=record.nonce,
                status_code=record.status_code,
                risk_snapshot_id=record.risk_snapshot_id,
                proposal_amount=_proposal_amount_for_list_item(
                    record=record,
                    linked_summary=linked_summary,
                    token_decimals_by_address=token_decimals_by_address,
                ),
                deposit_asset_symbol=(plan_json or {}).get("deposit_asset_symbol"),
                deposit_amount=(plan_json or {}).get("deposit_amount"),
                risk_profile=(plan_json or {}).get("risk_profile"),
                allocation_mode=(plan_json or {}).get("allocation_mode"),
                recommended_action=risk_summary.get("recommended_action"),
                confidence=risk_summary.get("confidence"),
                reasoning_summary=risk_summary.get("reasoning_summary"),
                approval_enabled=(plan_json or {}).get("approval_enabled"),
                approval_blockers=list((plan_json or {}).get("approval_blockers") or []),
                created_at=record.created_at,
                updated_at=record.updated_at,
            )
        )
    return ProposalListResponse(
        status="ok",
        status_code="DATA_FRESH",
        status_label="DATA_FRESH",
        status_reason="Trade proposal queue loaded." if not wallet_address else "Wallet-scoped trade proposal queue loaded.",
        proposals=items,
    )


@router.post("/proposals/{proposal_id}/execute", response_model=ProposalExecuteResponse)
async def execute_proposal(proposal_id: str) -> ProposalExecuteResponse:
    """Submit an approved proposal to the ExecutorVault execution path.

    The endpoint submits the on-chain transaction, then records whether receipt
    polling resolved to submitted, confirmed, or reverted before returning.
    """
    logger.info(
        "Submitting proposal_id=%s through the ExecutorVault execution path.",
        proposal_id,
    )
    return _execute_proposal_submission(proposal_id)


