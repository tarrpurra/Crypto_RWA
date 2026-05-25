from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class BalanceObservation(BaseModel):
    asset_key: str
    asset_symbol: str
    asset_address: str | None = None
    chain_id: int
    balance: str | None = None
    decimals: int
    observed_timestamp: datetime
    balance_source: str
    status: str
    status_code: str
    status_reason: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class PortfolioPosition(BaseModel):
    asset_key: str
    asset_symbol: str
    asset_address: str | None = None
    chain_id: int
    balance: str | None = None
    balance_source: str
    price_usd: str | None = None
    value_usd: str | None = None
    weight: str | None = None
    target_weight: str | None = None
    weight_drift: str | None = None
    drift_status: str = "not_evaluated"
    route_depth_usd: str | None = None
    slippage_impact_bps: str | None = None
    valuation_status: str
    status_code: str
    status_reason: str
    data_sources_used: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class PortfolioSnapshotResponse(BaseModel):
    snapshot_id: str
    generated_at: datetime
    portfolio_address: str | None = None
    chain_id: int
    base_currency: str = "USD"
    total_value_usd: str | None = None
    positions: list[PortfolioPosition] = Field(default_factory=list)
    data_sources_used: list[str] = Field(default_factory=list)
    status: str
    status_code: str
    status_label: str
    status_reason: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class PortfolioSnapshotHistoryResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    snapshots: list[PortfolioSnapshotResponse] = Field(default_factory=list)
