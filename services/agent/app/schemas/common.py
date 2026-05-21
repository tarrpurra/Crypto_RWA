from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    status: str = "error"
    status_code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    runtime_mode: str
    degraded: bool = False
    action_required: str | None = None


class FreshnessThreshold(BaseModel):
    fresh_limit_seconds: int
    warn_after_seconds: int
    hard_block_after_seconds: int | None = None
