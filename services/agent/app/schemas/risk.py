from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class RiskBucket(BaseModel):
    bucket: str
    score: float
    weight: float = 0.0
    status: str
    status_code: str
    reason: str
    hard_veto: bool = False
    data_sources_used: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RiskScoreBandRange(BaseModel):
    band: str
    min_inclusive: float
    max_exclusive: float | None = None
    label: str


class RiskScoreScale(BaseModel):
    min_score: float = 0.0
    max_score: float = 100.0
    higher_is_worse: bool = True
    bands: list[RiskScoreBandRange] = Field(default_factory=list)


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


class RiskAssessmentResponse(BaseModel):
    asset: str
    recommended_action: str
    risk_score: float
    risk_score_normalized: float = 0.0
    risk_band: str
    risk_score_scale: RiskScoreScale = Field(default_factory=RiskScoreScale)
    confidence: float
    confidence_normalized: float = 0.0
    reasoning_summary: str
    data_sources_used: list[str] = Field(default_factory=list)
    hard_veto_status: str
    required_human_approval_status: str
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    runtime_mode: str
    target_chain: str
    freshness_status: str
    buckets: list[RiskBucket] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RiskAssessmentHistoryResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    assessments: list[RiskAssessmentResponse] = Field(default_factory=list)
