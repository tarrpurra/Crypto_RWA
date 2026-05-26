from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SourceHealth(BaseModel):
    source: str
    status: str
    status_code: str
    status_label: str
    status_reason: str
    observed_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class OpsAlert(BaseModel):
    alert_id: str
    severity: str
    status_code: str
    title: str
    message: str
    source: str
    recommended_mode: str
    created_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class OpsHealthResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    runtime_mode: str
    target_chain: str
    recommended_mode: str
    sources: list[SourceHealth] = Field(default_factory=list)
    alerts: list[OpsAlert] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class OpsAlertsResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    alerts: list[OpsAlert] = Field(default_factory=list)


class OpsReadinessResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    ready_for_live: bool
    recommended_mode: str
    blockers: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
