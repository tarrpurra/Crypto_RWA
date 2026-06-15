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
    token_in_symbol: str | None = None
    token_out_symbol: str | None = None
    recipient: str
    max_amount_in: str
    min_amount_out: str
    native_value: str
    deadline: int
    proposal_expiry: int
    nonce: int
    status_code: str
    risk_snapshot_id: str | None = None
    deposit_asset_symbol: str | None = None
    deposit_amount: float | None = None
    risk_profile: str | None = None
    allocation_mode: str | None = None
    recommended_action: str | None = None
    confidence: float | None = None
    reasoning_summary: str | None = None
    approval_enabled: bool | None = None
    approval_blockers: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ProposalListResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    proposals: list[ProposalListItem]


class ProposalMutationResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    proposal_id: str
    message: str


class ProposalExecuteResponse(BaseModel):
    status: str
    status_code: str
    status_label: str | None = None
    status_reason: str | None = None
    proposal_id: str
    tx_hash: str | None = None
    router: str | None = None
    selector: str | None = None
    calldata: str | None = None
    calldata_hash: str | None = None
    token_in: str | None = None
    token_out: str | None = None
    recipient: str | None = None
    max_amount_in: str | None = None
    min_amount_out: str | None = None
    native_value: str | None = None
    deadline: int | None = None
    nonce: int | None = None
    chain_id: int | None = None


class InvestmentPlanRequest(BaseModel):
    wallet_address: str | None = None
    deposit_asset_symbol: str
    deposit_amount: float
    risk_profile: str
    allocation_mode: str
    manual_target_weights: dict[str, float] = Field(default_factory=dict)


class AllocationTargetItem(BaseModel):
    asset_symbol: str
    percentage: float
    amount: float
    value_usd: float
    source: str


class RiskValidationCheck(BaseModel):
    code: str
    label: str
    passed: bool
    blocking: bool
    message: str
    observed_value: str | None = None
    threshold_value: str | None = None
    data_sources_used: list[str] = Field(default_factory=list)


class TransactionStep(BaseModel):
    step_index: int
    step_type: str
    description: str
    asset_symbol: str | None = None
    amount: str | None = None
    proposal_id: str | None = None
    requires_user_action: bool = True


class LinkedProposalSummary(BaseModel):
    proposal_id: str
    asset_symbol: str
    action: str
    token_in_symbol: str
    token_out_symbol: str
    amount: float
    status_code: str


class InvestmentPlanResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    plan_id: str
    deposit_asset_symbol: str
    deposit_amount: float
    risk_profile: str
    allocation_mode: str
    ai_target_allocations: list[AllocationTargetItem] = Field(default_factory=list)
    selected_target_allocations: list[AllocationTargetItem] = Field(default_factory=list)
    warning_messages: list[str] = Field(default_factory=list)
    approval_enabled: bool
    approval_blockers: list[str] = Field(default_factory=list)
    guard_checks: list[RiskValidationCheck] = Field(default_factory=list)
    estimated_gas_native: str | None = None
    transaction_steps: list[TransactionStep] = Field(default_factory=list)
    linked_proposals: list[LinkedProposalSummary] = Field(default_factory=list)
    risk_assessment: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)
