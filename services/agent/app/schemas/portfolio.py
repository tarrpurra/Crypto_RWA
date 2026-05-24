from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class AssetBalance(BaseModel):
    asset_symbol: str
    balance: float
    value_usd: float
    weight: float


class PortfolioSnapshot(BaseModel):
    snapshot_id: str
    wallet_or_vault: str
    total_value_usd: float
    balances: list[AssetBalance]
    weights: dict[str, float]
    status_code: str
    status_reason: str
    created_at: datetime


class PortfolioSnapshotResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    snapshot: PortfolioSnapshot
