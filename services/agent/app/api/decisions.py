from __future__ import annotations

import logging
import uuid
import time
from fastapi import APIRouter, HTTPException
from eth_hash.auto import keccak
from web3 import Web3

from services.agent.app.schemas.recommendations import RecommendationResponse
from services.agent.app.schemas.proposals import TradeProposalResponse, TradeProposal, ExecutionPayloadSchema
from services.agent.app.schemas.allocation import RebalanceAction
from services.agent.modules.market_data.balances import fetch_portfolio_snapshot
from services.agent.risk.scoring.score_engine import RiskScoreEngine
from services.agent.strategies.allocation.rebalance import compute_rebalance
from services.agent.strategies.allocation import profiles
from services.agent.strategies.decision_templates.parser import generate_recommendation_reasoning
from services.agent.repositories.db.models import TradeProposalRecord, TradeExecutionRecord
from services.agent.repositories.db.session import create_session
from services.agent.app.core.settings import get_settings
from services.agent.modules.oracle.freshness import utc_now

logger = logging.getLogger("services.agent.decisions.api")
router = APIRouter(tags=["decisions"])


def _save_proposal_record(proposal: TradeProposal) -> None:
    try:
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
            created_at=proposal.created_at,
            updated_at=proposal.updated_at,
        )
        with create_session() as session:
            session.merge(record)
            session.commit()
    except Exception as exc:
        logger.warning("Failed to persist proposal snapshot: %s", exc)


@router.get("/decisions", response_model=RecommendationResponse)
async def get_latest_decisions() -> RecommendationResponse:
    # 1. Gather context
    portfolio = fetch_portfolio_snapshot()
    risk_engine = RiskScoreEngine()
    risk = risk_engine.compute_risk_snapshot(portfolio)
    
    decision, actions = compute_rebalance(portfolio, risk, profiles.ACTIVE_PROFILE_NAME)
    
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

    # Determine token addresses
    # Default to USDC and mETH mainnet/sepolia addresses from settings
    usdc_addr = settings.usdc_mainnet_address or "0x0A712B2524242424242424242424242424242424"
    meth_addr = settings.meth_sepolia_address if settings.target_chain.value == "Mantle Sepolia" else settings.meth_mainnet_address
    if not meth_addr:
        meth_addr = settings.meth_mainnet_address or "0xcDA86A272531e8640cD7F1a92c01839911B90bb0"

    token_in = usdc_addr if action.action == "BUY" else meth_addr
    token_out = meth_addr if action.action == "BUY" else usdc_addr

    # Check decimals (mETH: 18, USDC: 6)
    decimals_in = 6 if token_in == usdc_addr else 18
    decimals_out = 18 if token_out == meth_addr else 6

    # Convert amounts
    max_amount_in = int(action.amount * (10 ** decimals_in))
    
    # Compute minAmountOut based on current price with 1% slippage buffer
    repo = MarketDataRepository()
    prices = {p.asset_symbol: float(p.price_usd) for p in repo.latest_normalized_prices() if p.price_usd}
    usdc_price = prices.get("USDC", 1.0)
    meth_price = prices.get("mETH", 3500.0)

    # Implied swap rate
    if action.action == "BUY":
        # Spending USDC to buy mETH
        # expected mETH out = usdc_amount / meth_price
        expected_out = action.amount / meth_price
    else:
        # Selling mETH to get USDC
        # expected USDC out = meth_amount * meth_price
        expected_out = action.amount * meth_price

    # 1% slippage tolerance
    min_amount_out = int(expected_out * 0.99 * (10 ** decimals_out))

    # Router addresses
    router_address = settings.effective_agni_swap_router_address or "0xe38cfa32cCd918d94E2e20230dFaD1A4Fd8aEF16"

    # AGNI exactInputSingle function selector = 0x414bf389
    # Selector bytes4: 0x414bf389
    selector = "0x414bf389"
    recipient = settings.executor_vault_address or "0x0000000000000000000000000000000000000000"

    now = int(time.time())
    deadline = now + 900  # 15 mins
    proposal_expiry = now + 7200  # 2 hours
    nonce = int(uuid.uuid4().int & 0xFFFFFFFF)

    # Encode mock calldata that mirrors AGNI ExactInputSingleParams struct:
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
            3000,  # 0.3% fee tier
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
        logger.warning("Failed to encode router calldata using eth_abi: %s. Using fallback hash.", exc)
        calldata_hash = Web3.to_hex(keccak(b"fallback_calldata"))

    # Generate proposalId and planHash
    proposal_id_bytes = keccak(f"proposal_{uuid.uuid4()}_{now}".encode("utf-8"))
    proposal_id = Web3.to_hex(proposal_id_bytes)
    
    plan_hash_bytes = keccak(f"rebalance_{action.asset_symbol}_{action.action}".encode("utf-8"))
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

    _save_proposal_record(proposal)

    return TradeProposalResponse(
        status="ok",
        status_code="PROPOSAL_PENDING_APPROVAL",
        proposal=proposal,
    )


@router.post("/proposals/{proposal_id}/approve", response_model=dict[str, str])
async def approve_proposal(proposal_id: str) -> dict[str, str]:
    # Update status to PROPOSAL_APPROVED
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
