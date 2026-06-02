from __future__ import annotations

import logging
import uuid
import time
from fastapi import APIRouter, HTTPException
from eth_hash.auto import keccak
from web3 import Web3

from services.agent.app.schemas.recommendations import RecommendationResponse
from services.agent.app.schemas.proposals import TradeProposalResponse, TradeProposal, ExecutionPayloadSchema, ProposalListItem, ProposalListResponse, ProposalExecuteResponse
from services.agent.app.schemas.allocation import RebalanceAction
from services.agent.modules.market_data.balances import fetch_portfolio_snapshot, internal_snapshot_from_response
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.risk.scoring.score_engine import RiskScoreEngine
from services.agent.risk.guards.trade_guard import PolicyGuard
from services.agent.strategies.allocation.rebalance import compute_rebalance
from services.agent.strategies.allocation import profiles
from services.agent.strategies.allocation.profiles import normalize_profile_name
from services.agent.strategies.decision_templates.parser import generate_recommendation_reasoning
from services.agent.repositories.db.models import TradeProposalRecord, TradeExecutionRecord
from services.agent.repositories.db.session import create_session, init_db
from services.agent.app.core.settings import get_settings
from services.agent.modules.oracle.freshness import utc_now

logger = logging.getLogger("services.agent.decisions.api")
router = APIRouter(tags=["decisions"])


def _save_proposal_record(proposal: TradeProposal, calldata: str | None = None) -> None:
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
            calldata=calldata or proposal.payload.calldataHash,
            created_at=proposal.created_at,
            updated_at=proposal.updated_at,
        )
        with create_session() as session:
            session.merge(record)
            session.commit()
    except Exception as exc:
        logger.warning("Failed to persist proposal snapshot: %s", exc)


def _active_profile_name() -> str:
    configured_name = profiles.ACTIVE_PROFILE_NAME or get_settings().allocation_profile_name
    try:
        return normalize_profile_name(configured_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/decisions", response_model=RecommendationResponse)
async def get_latest_decisions(wallet_address: str | None = None) -> RecommendationResponse:
    # 1. Gather context
    portfolio_response = await current_portfolio(wallet_address=wallet_address)
    portfolio = internal_snapshot_from_response(portfolio_response)
    risk_engine = RiskScoreEngine()
    risk = risk_engine.compute_risk_snapshot(portfolio)
    
    decision, actions = compute_rebalance(portfolio, risk, _active_profile_name())
    
    # 2. Feed to AI parser (which queries Ollama or falls back to template reasons)
    rec = await generate_recommendation_reasoning(portfolio, risk, decision, actions)
    return rec


@router.post("/proposals/create", response_model=TradeProposalResponse)
async def create_trade_proposal(action: RebalanceAction) -> TradeProposalResponse:
    settings = get_settings()
    portfolio = fetch_portfolio_snapshot()
    risk_engine = RiskScoreEngine()
    risk = risk_engine.compute_risk_snapshot(portfolio)

    if risk.risk_band in ("RISK_VETO", "RISK_PAUSE_REQUIRED"):
        raise HTTPException(status_code=400, detail=f"Cannot create proposal: risk band is {risk.risk_band}")

    decision, allowed_actions = compute_rebalance(portfolio, risk, _active_profile_name())
    matching_action = next(
        (
            candidate
            for candidate in allowed_actions
            if candidate.asset_symbol == action.asset_symbol
            and candidate.action == action.action
        ),
        None,
    )
    if decision.recommended_action != "REBALANCE" or matching_action is None:
        raise HTTPException(status_code=400, detail="Requested action is not part of the current deterministic rebalance plan.")

    plan = matching_action

    # Determine token addresses from the rebalance action
    sepolia = settings.target_chain.value == "mantle_sepolia"
    token_in: str
    token_out: str
    decimals_in: int
    decimals_out: int
    price_symbol_in: str
    price_symbol_out: str

    if sepolia:
        meth_addr = settings.effective_sepolia_meth_address
        usdy_addr = settings.sepolia_usdy_address
        if not meth_addr or not usdy_addr:
            raise HTTPException(status_code=400, detail="Sepolia mETH/USDY addresses not configured.")
        if plan.asset_symbol == "mETH":
            token_in = usdy_addr if plan.action == "BUY" else meth_addr
            token_out = meth_addr if plan.action == "BUY" else usdy_addr
            price_symbol_in = "USDY" if plan.action == "BUY" else "mETH"
            price_symbol_out = "mETH" if plan.action == "BUY" else "USDY"
        elif plan.asset_symbol == "USDY":
            token_in = meth_addr if plan.action == "BUY" else usdy_addr
            token_out = usdy_addr if plan.action == "BUY" else meth_addr
            price_symbol_in = "mETH" if plan.action == "BUY" else "USDY"
            price_symbol_out = "USDY" if plan.action == "BUY" else "mETH"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported asset for Sepolia: {plan.asset_symbol}")
        decimals_in = 18
        decimals_out = 18
    else:
        usdc_addr = settings.usdc_mainnet_address
        meth_addr = settings.meth_mainnet_address
        if not meth_addr:
            raise HTTPException(status_code=400, detail="mETH address is not configured for proposal creation.")
        if not usdc_addr:
            raise HTTPException(status_code=400, detail="USDC address is not configured for proposal creation.")
        token_in = usdc_addr if plan.action == "BUY" else meth_addr
        token_out = meth_addr if plan.action == "BUY" else usdc_addr
        decimals_in = 6 if plan.action == "BUY" else 18
        decimals_out = 18 if plan.action == "BUY" else 6
        price_symbol_in = "USDC" if plan.action == "BUY" else "mETH"
        price_symbol_out = "mETH" if plan.action == "BUY" else "USDC"

    max_amount_in = int(plan.amount * (10 ** decimals_in))

    # Compute minAmountOut based on current price with 1% slippage buffer
    repo = MarketDataRepository()
    prices = {p.asset_symbol: float(p.price_usd) for p in repo.latest_normalized_prices() if p.price_usd}
    price_in = prices.get(price_symbol_in)
    price_out = prices.get(price_symbol_out)
    if price_in is None or price_out is None:
        raise HTTPException(status_code=400, detail=f"Required price snapshots missing for {price_symbol_in}/{price_symbol_out}.")

    # Implied swap rate
    if plan.action == "BUY":
        expected_out = plan.amount * price_in / price_out
    else:
        expected_out = plan.amount * price_out / price_in

    min_amount_out = int(expected_out * 0.99 * (10 ** decimals_out))

    # Router addresses
    router_address = settings.effective_agni_swap_router_address
    if not router_address:
        raise HTTPException(status_code=400, detail="AGNI swap router address is not configured.")

    # AGNI exactInputSingle function selector = 0x414bf389
    # Selector bytes4: 0x414bf389
    selector = "0x414bf389"
    recipient = settings.executor_vault_address
    if not recipient:
        raise HTTPException(status_code=400, detail="Executor vault address is not configured.")

    now = int(time.time())
    deadline = now + 900  # 15 mins
    proposal_expiry = now + 7200  # 2 hours
    nonce = int(uuid.uuid4().int & 0xFFFFFFFF)

    # Encode calldata that mirrors AGNI ExactInputSingleParams struct:
    # struct ExactInputSingleParams {
    #     address tokenIn;
    #     address tokenOut;
    #     uint24 fee;
    #     address recipient;
    #     uint256 deadline;
    #     uint256 amountIn;
    #     uint256 amountOutMinimum;
    #     uint160 sqrtPriceLimitX96;
    # }
    try:
        from eth_abi import encode
        params = (
            Web3.to_checksum_address(token_in),
            Web3.to_checksum_address(token_out),
            500,  # 0.05% fee tier — matches deployed AGNI pool
            Web3.to_checksum_address(recipient),
            deadline,
            max_amount_in,
            min_amount_out,
            0  # sqrtPriceLimitX96
        )
        # The exactInputSingle expects a single tuple parameter (the struct)
        # So we encode the tuple
        encoded_struct = encode(
            ['(address,address,uint24,address,uint256,uint256,uint256,uint160)'],
            [params]
        )
        # Function call is selector + encoded parameters
        calldata = Web3.to_bytes(hexstr=selector) + encoded_struct
        calldata_hash_bytes = keccak(calldata)
        calldata_hash = Web3.to_hex(calldata_hash_bytes)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to encode router calldata: {exc}") from exc

    # Generate proposalId and planHash
    proposal_id_bytes = keccak(f"proposal_{uuid.uuid4()}_{now}".encode("utf-8"))
    proposal_id = Web3.to_hex(proposal_id_bytes)
    
    plan_hash_bytes = keccak(f"rebalance_{plan.asset_symbol}_{plan.action}".encode("utf-8"))
    plan_hash = Web3.to_hex(plan_hash_bytes)

    payload = ExecutionPayloadSchema(
        proposalId=proposal_id,
        planHash=plan_hash,
        router=Web3.to_checksum_address(router_address),
        selector=selector,
        calldataHash=calldata_hash,
        tokenIn=Web3.to_checksum_address(token_in),
        tokenOut=Web3.to_checksum_address(token_out),
        recipient=Web3.to_checksum_address(recipient),
        maxAmountIn=max_amount_in,
        minAmountOut=min_amount_out,
        nativeValue=0,
        deadline=deadline,
        proposalExpiry=proposal_expiry,
        nonce=nonce,
    )

    policy_ok, policy_reason = PolicyGuard().validate_proposal(payload, risk)
    if not policy_ok:
        raise HTTPException(status_code=400, detail=policy_reason)

    t_now = utc_now()
    proposal = TradeProposal(
        proposal_id=proposal_id,
        plan_hash=plan_hash,
        wallet_or_vault=recipient,
        payload=payload,
        status_code="PROPOSAL_PENDING_APPROVAL",
        risk_snapshot_id=risk.snapshot_id,
        created_at=t_now,
        updated_at=t_now,
    )

    _save_proposal_record(proposal, calldata=Web3.to_hex(calldata))

    return TradeProposalResponse(
        status="ok",
        status_code="PROPOSAL_PENDING_APPROVAL",
        proposal=proposal,
    )


@router.post("/proposals/{proposal_id}/approve", response_model=dict[str, str])
async def approve_proposal(proposal_id: str) -> dict[str, str]:
    # Update status to PROPOSAL_APPROVED
    init_db()
    with create_session() as session:
        from sqlalchemy import select
        record = session.scalar(
            select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id)
        )
        if not record:
            raise HTTPException(status_code=404, detail=f"Proposal not found: {proposal_id}")
        
        record.status_code = "PROPOSAL_APPROVED"
        record.updated_at = utc_now()
        session.commit()
        
    return {"status": "ok", "message": f"Proposal {proposal_id} successfully approved by operator."}


@router.post("/proposals/{proposal_id}/reject", response_model=dict[str, str])
async def reject_proposal(proposal_id: str) -> dict[str, str]:
    # Update status to PROPOSAL_REJECTED
    init_db()
    with create_session() as session:
        from sqlalchemy import select
        record = session.scalar(
            select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id)
        )
        if not record:
            raise HTTPException(status_code=404, detail=f"Proposal not found: {proposal_id}")
        
        record.status_code = "PROPOSAL_REJECTED"
        record.updated_at = utc_now()
        session.commit()
        
    return {"status": "ok", "message": f"Proposal {proposal_id} successfully rejected."}


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
            proposal_id=r.proposal_id,
            plan_hash=r.plan_hash,
            wallet_or_vault=r.wallet_or_vault,
            router=r.router,
            selector=r.selector,
            token_in=r.token_in,
            token_out=r.token_out,
            recipient=r.recipient,
            max_amount_in=r.max_amount_in,
            min_amount_out=r.min_amount_out,
            native_value=r.native_value,
            deadline=r.deadline,
            proposal_expiry=r.proposal_expiry,
            nonce=r.nonce,
            status_code=r.status_code,
            risk_snapshot_id=r.risk_snapshot_id,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in records
    ]

    return ProposalListResponse(status="ok", proposals=items)


@router.post("/proposals/{proposal_id}/execute", response_model=ProposalExecuteResponse)
async def execute_proposal(proposal_id: str) -> ProposalExecuteResponse:
    settings = get_settings()
    init_db()
    with create_session() as session:
        from sqlalchemy import select
        record = session.scalar(
            select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id)
        )
        if not record:
            raise HTTPException(status_code=404, detail=f"Proposal not found: {proposal_id}")

        if record.status_code != "PROPOSAL_APPROVED":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot execute: proposal status is {record.status_code}, must be PROPOSAL_APPROVED",
            )

        calldata_hex = record.calldata
        if not calldata_hex:
            raise HTTPException(status_code=500, detail="Proposal calldata is missing from the record.")

        # Return tx params for the user's wallet to sign and submit
        return ProposalExecuteResponse(
            status="ok",
            status_code="PROPOSAL_APPROVED",
            proposal_id=record.proposal_id,
            router=record.router,
            selector=record.selector,
            calldata=calldata_hex,
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

from services.agent.app.api.portfolio import current_portfolio
