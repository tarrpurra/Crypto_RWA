from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class RebalanceAction(BaseModel):
    asset_symbol: str
    action: str  # "BUY", "SELL", "HOLD"
    amount: float
    route_id: str | None = None


class AllocationDecision(BaseModel):
    decision_id: str
    wallet_or_vault: str
    profile_name: str
    current_weights: dict[str, float]
    target_weights: dict[str, float]
    recommended_action: str
    confidence: float
    reasoning: str
    risk_snapshot_id: str | None = None
    status_code: str
    created_at: datetime


class AllocationDecisionResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    decision: AllocationDecision
    rebalance_actions: list[RebalanceAction] = Field(default_factory=list)


class UpdateProfileRequest(BaseModel):
    profile_name: str
