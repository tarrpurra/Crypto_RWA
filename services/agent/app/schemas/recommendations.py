from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AIDebugPayload(BaseModel):
    prompt: str
    raw_response: str | None = None
    parsed_response: dict[str, Any] = Field(default_factory=dict)
    mode: str
    used_fallback: bool
    ai_overrode_deterministic: bool = False
    fallback_reason: str | None = None


class RecommendationResponse(BaseModel):
    asset: str
    recommended_action: str
    risk_score: float
    confidence: float
    reasoning_summary: str
    data_sources_used: list[str] = Field(default_factory=list)
    hard_veto_status: str
    required_human_approval_status: str
    status: str
    status_code: str
    status_label: str
    status_reason: str
    runtime_mode: str
    target_chain: str
    freshness_status: str
    constraints_applied: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    ai_debug: AIDebugPayload
    metadata: dict[str, Any] = Field(default_factory=dict)
