from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class RiskSnapshot(BaseModel):
    snapshot_id: str
    total_score: float
    risk_band: str
    status_code: str
    status_reason: str
    bucket_scores: dict[str, float] = Field(default_factory=dict)
    prechecks: dict[str, bool] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)
    created_at: datetime


class RiskSnapshotResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    risk: RiskSnapshot
