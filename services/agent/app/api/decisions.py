from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from services.agent.app.api.investment_scope import InvestmentScopeInput, build_scoped_decision_response
from services.agent.app.api.portfolio import current_portfolio
from services.agent.app.core.settings import TargetChain, get_settings
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
from services.agent.modules.market_data.balances import fetch_portfolio_snapshot
from services.agent.modules.proposals.investment_planner import build_investment_plan, get_cached_plan_for_proposal
from services.agent.repositories.db.investment_plan_repository import InvestmentPlanRepository
from services.agent.repositories.db.models import TradeProposalRecord
from services.agent.repositories.db.session import create_session, init_db
from services.agent.risk.engine import RiskEngine
from services.agent.risk.scoring.score_engine import RiskScoreEngine
from services.agent.strategies.allocation import profiles
from services.agent.strategies.allocation.rebalance import compute_rebalance
from services.agent.strategies.allocation.profiles import normalize_profile_name
from services.agent.strategies.decision_templates.parser import generate_recommendation_reasoning


logger = logging.getLogger("services.agent.decisions.api")
router = APIRouter(tags=["decisions"])


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
    if deposit_asset_symbol and deposit_amount and risk_profile:
        return await build_scoped_decision_response(
            InvestmentScopeInput(
                wallet_address=wallet_address,
                deposit_asset_symbol=deposit_asset_symbol,
                deposit_amount=deposit_amount,
                risk_profile=risk_profile,
                allocation_mode=allocation_mode or "AI Suggested",
            )
        )
    portfolio = fetch_portfolio_snapshot(wallet_address=wallet_address, allow_env_fallback=False)
    risk = RiskScoreEngine().compute_risk_snapshot(portfolio)
    settings = get_settings()
    profile_name = profiles.ACTIVE_PROFILE_NAME or settings.allocation_profile_name
    if settings.target_chain == TargetChain.MANTLE_SEPOLIA:
        profile_name = "Sepolia Test"
    decision, actions = compute_rebalance(portfolio, risk, normalize_profile_name(profile_name))
    return await generate_recommendation_reasoning(portfolio, risk, decision, actions)


@router.post("/proposals/create", response_model=InvestmentPlanResponse)
async def create_investment_plan(request: InvestmentPlanRequest) -> InvestmentPlanResponse:
    settings = get_settings()
    portfolio_response = await current_portfolio(wallet_address=request.wallet_address)
    risk = RiskEngine().evaluate(
        portfolio=portfolio_response,
        runtime_mode=settings.runtime_mode,
        target_chain=settings.target_chain.value,
    )
    plan_response, proposal_pairs = build_investment_plan(
        settings=settings,
        request=request,
        portfolio=portfolio_response,
        risk=risk,
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
        return ProposalExecuteResponse(
            status="ok",
            status_code="PROPOSAL_APPROVED",
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
