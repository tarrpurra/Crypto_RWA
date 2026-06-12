from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class VaultBalanceItem(BaseModel):
    asset_symbol: str
    asset_address: str | None = None
    balance: str
    value_usd: str | None = None
    share: float = 0.0


class VaultBalanceResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    vault_address: str
    vault_label: str = "AIxRWA Portfolio Vault"
    user_address: str
    total_value_usd: str | None = None
    invested_amount_usd: str | None = None
    total_deposits_usd: str | None = None
    total_withdrawals_usd: str | None = None
    pnl_usd: str | None = None
    pnl_percent: str | None = None
    balances: list[VaultBalanceItem] = Field(default_factory=list)
    pending_deposits: int = 0
    pending_withdrawals: int = 0
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DepositPrepareRequest(BaseModel):
    token: str
    amount: str
    user_address: str | None = None


class DepositPrepareResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    token: str
    amount: str
    allowance_required: bool
    current_allowance: str
    spender: str


class WithdrawPrepareRequest(BaseModel):
    token: str
    amount: str
    user_address: str


class WithdrawPrepareResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    token: str
    amount: str
    vault_balance: str
    sufficient_balance: bool


class VaultFlowRecordRequest(BaseModel):
    user_address: str
    asset_symbol: str
    asset_amount: str
    flow_type: str = "deposit"
    usd_value: str | None = None
    asset_address: str | None = None
    tx_hash: str | None = None
    occurred_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class VaultFlowRecordResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    flow_id: str
    vault_address: str
    user_address: str
    flow_type: str
    asset_symbol: str
    asset_amount: str
    usd_value: str
    tx_hash: str | None = None
    occurred_at: datetime
