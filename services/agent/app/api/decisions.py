from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from services.agent.app.api.investment_scope import InvestmentScopeInput, build_scoped_decision_response
from services.agent.app.api.portfolio import current_portfolio
from services.agent.app.core.status_codes import DataStatusCode, ExecutionStatusCode
from services.agent.app.core.settings import get_settings
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
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.repositories.db.models import InvestmentPlanRecord, TradeProposalRecord
from services.agent.repositories.db.session import create_session, init_db
from services.agent.risk.engine import RiskEngine
from services.agent.modules.quotes import get_quote_service
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


def _save_proposal_record(proposal: TradeProposal, calldata: str) -> None:
    try:
        init_db()
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
        with create_session() as session:
            session.merge(record)
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
    decision, actions = compute_rebalance(
        context.portfolio,
        context.risk_snapshot,
        context.profile_name,
        target_weights_override=context.target_weights,
    )
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


@router.post("/proposals/{proposal_id}/approve", response_model=ProposalMutationResponse)
async def approve_proposal(proposal_id: str) -> ProposalMutationResponse:
    init_db()
    with create_session() as session:
        from sqlalchemy import select

        record = session.scalar(select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id))
        if not record:
            raise HTTPException(status_code=404, detail=f"Proposal not found: {proposal_id}")
    cached_plan = InvestmentPlanRepository().get_plan_for_proposal(proposal_id)
    if cached_plan is not None and (not cached_plan.approval_enabled or cached_plan.approval_blockers):
        blockers = cached_plan.approval_blockers or [cached_plan.status_reason]
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve: {'; '.join(blockers)}",
        )
    with create_session() as session:
        from sqlalchemy import select

        record = session.scalar(select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id))
        if not record:
            raise HTTPException(status_code=404, detail=f"Proposal not found: {proposal_id}")
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


@router.post("/proposals/{proposal_id}/reject", response_model=ProposalMutationResponse)
async def reject_proposal(proposal_id: str) -> ProposalMutationResponse:
    init_db()
    with create_session() as session:
        from sqlalchemy import select

        record = session.scalar(select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id))
        if not record:
            raise HTTPException(status_code=404, detail=f"Proposal not found: {proposal_id}")
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
    init_db()
    with create_session() as session:
        from sqlalchemy import select

        query = select(TradeProposalRecord).order_by(TradeProposalRecord.created_at.desc())
        if status:
            query = query.where(TradeProposalRecord.status_code == status)
        records = session.scalars(query).all()
        plan_records = session.scalars(select(InvestmentPlanRecord)).all()
        plan_json_by_proposal_id = {record.proposal_id: record.plan_json for record in plan_records}

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
            approval_enabled=(plan_json_by_proposal_id.get(record.proposal_id) or {}).get("approval_enabled"),
            approval_blockers=list((plan_json_by_proposal_id.get(record.proposal_id) or {}).get("approval_blockers") or []),
            created_at=record.created_at,
            updated_at=record.updated_at,
        )
        for record in records
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
    settings = get_settings()
    init_db()
    logger.info("Proposal execution requested: proposal_id=%s", proposal_id)

    with create_session() as session:
        from sqlalchemy import select

        record = session.scalar(select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id))
        if not record:
            raise HTTPException(status_code=404, detail=f"Proposal not found: {proposal_id}")
        if record.status_code != "PROPOSAL_APPROVED":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot execute: proposal status is {record.status_code}, must be PROPOSAL_APPROVED",
            )
        if not record.calldata:
            raise HTTPException(status_code=500, detail="Proposal calldata is missing from the record.")

    cached_plan = InvestmentPlanRepository().get_plan_for_proposal(proposal_id)
    if cached_plan is not None and (not cached_plan.approval_enabled or cached_plan.approval_blockers):
        blockers = cached_plan.approval_blockers or [cached_plan.status_reason]
        logger.warning(
            "Proposal execution blocked by cached plan approval state: proposal_id=%s reasons=%s",
            proposal_id,
            blockers,
        )
        raise HTTPException(
            status_code=400,
            detail=f"Execution blocked: {'; '.join(blockers)}.",
        )

    portfolio = await current_portfolio(wallet_address=record.wallet_or_vault)
    quote_service = get_quote_service()
    address_to_symbol = _address_to_symbol_map(settings)
    token_in_symbol = address_to_symbol.get(str(record.token_in).lower())
    token_out_symbol = address_to_symbol.get(str(record.token_out).lower())
    if not token_in_symbol or not token_out_symbol:
        logger.warning(
            "Proposal execution token symbol resolution failed: proposal_id=%s token_in=%s token_out=%s resolved_in=%s resolved_out=%s",
            proposal_id,
            record.token_in,
            record.token_out,
            token_in_symbol,
            token_out_symbol,
        )
    quote = (
        quote_service.best_quote_for_pair(token_in_symbol, token_out_symbol)
        if token_in_symbol and token_out_symbol
        else None
    )
    try:
        repo = MarketDataRepository()
        prices = repo.latest_normalized_prices()
        quotes = repo.latest_normalized_quotes()
    except Exception as exc:
        logger.warning("Proposal execution market context lookup failed: %s", exc)
        prices = None
        quotes = None
    quote_validation_status = (
        quote.status_code
        if quote is not None and quote.amount_out is not None and quote.protocol is not None
        else DataStatusCode.DATA_MISSING.value
    )
    risk = RiskEngine().evaluate(
        portfolio=portfolio,
        runtime_mode=settings.runtime_mode,
        target_chain=settings.target_chain.value,
        quote_validation_status=quote_validation_status,
        prices=prices,
        quotes=quotes,
    )
    data_status = (portfolio.status_code or "").upper()

    is_testnet = risk.target_chain in {"mantle-sepolia", "sepolia", "mantle_sepolia"}
    block_reasons: list[str] = []
    if risk.hard_veto_status == "active" and not is_testnet:
        block_reasons.append(f"risk hard veto is active ({risk.hard_veto_status})")
    if risk.risk_band in ("RISK_VETO", "RISK_PAUSE_REQUIRED") and not is_testnet:
        block_reasons.append(f"risk band is {risk.risk_band}")
    if data_status in ("DATA_PARTIAL", "DATA_MISSING"):
        block_reasons.append(f"portfolio data status is {data_status}")
    if quote is None or quote.amount_out is None or quote.protocol is None:
        block_reasons.append("no swap route available for the required pair")
    elif quote.status_code != DataStatusCode.QUOTE_FRESH.value:
        block_reasons.append(f"live quote for {token_in_symbol}->{token_out_symbol} is stale or unverified: {quote.status_reason}")

    if block_reasons:
        logger.warning(
            "Proposal execution blocked: proposal_id=%s reasons=%s",
            proposal_id,
            block_reasons,
        )
        raise HTTPException(
            status_code=400,
            detail=f"Execution blocked: {'; '.join(block_reasons)}.",
        )

    logger.info(
        "Proposal execution payload ready: proposal_id=%s router=%s selector=%s token_in=%s token_out=%s chain_id=%s",
        record.proposal_id,
        record.router,
        record.selector,
        record.token_in,
        record.token_out,
        settings.effective_chain_id,
    )
    return ProposalExecuteResponse(
        status="ok",
        status_code=ExecutionStatusCode.EXECUTION_READY.value,
        proposal_id=record.proposal_id,
        router=record.router,
        selector=record.selector,
        calldata=record.calldata,
        calldata_hash=record.calldata_hash,
        token_in=record.token_in,
        token_out=record.token_out,
        recipient=record.recipient,
        max_amount_in=record.max_amount_in,
        min_amount_out=record.min_amount_out,
        native_value=record.native_value,
        deadline=record.deadline,
        nonce=record.nonce,
        chain_id=settings.effective_chain_id,
    )
