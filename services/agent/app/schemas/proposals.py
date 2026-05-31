from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class ExecutionPayloadSchema(BaseModel):
    proposalId: str  # 32-byte hex string (with 0x prefix)
    planHash: str  # 32-byte hex string (with 0x prefix)
    router: str  # 20-byte checksum address
    selector: str  # 4-byte hex selector (with 0x prefix)
    calldataHash: str  # 32-byte hex string (with 0x prefix)
    tokenIn: str  # token address
    tokenOut: str  # token address
    recipient: str  # recipient address
    maxAmountIn: int
    minAmountOut: int
    nativeValue: int
    deadline: int
    proposalExpiry: int
    nonce: int


class TradeProposal(BaseModel):
    proposal_id: str
    plan_hash: str
    wallet_or_vault: str
    payload: ExecutionPayloadSchema
    status_code: str
    risk_snapshot_id: str | None = None
    created_at: datetime
    updated_at: datetime


class TradeProposalResponse(BaseModel):
    status: str
    status_code: str
    proposal: TradeProposal


class TradeExecution(BaseModel):
    proposal_id: str
    tx_hash: str
    quoted_amount_out: str | None = None
    actual_amount_out: str | None = None
    gas_used: int | None = None
    realized_slippage_bps: int | None = None
    status_code: str
    failure_reason: str | None = None
    executed_at: datetime


class TradeExecutionResponse(BaseModel):
    status: str
    status_code: str
    execution: TradeExecution


class ProposalListItem(BaseModel):
    proposal_id: str
    plan_hash: str
    wallet_or_vault: str
    router: str
    selector: str
    token_in: str
    token_out: str
    recipient: str
    max_amount_in: str
    min_amount_out: str
    native_value: str
    deadline: int
    proposal_expiry: int
    nonce: int
    status_code: str
    risk_snapshot_id: str | None = None
    created_at: datetime
    updated_at: datetime


class ProposalListResponse(BaseModel):
    status: str
    proposals: list[ProposalListItem]


class ProposalExecuteResponse(BaseModel):
    status: str
    status_code: str
    proposal_id: str
    router: str
    selector: str
    calldata: str
    calldata_hash: str
    token_in: str
    token_out: str
    recipient: str
    max_amount_in: str
    min_amount_out: str
    native_value: str
    deadline: int
    nonce: int
    chain_id: int
