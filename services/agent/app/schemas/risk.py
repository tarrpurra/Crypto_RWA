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


class RiskAssessmentResponse(BaseModel):
    asset: str
    recommended_action: str
    risk_score: float
    risk_band: str
    confidence: float
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
