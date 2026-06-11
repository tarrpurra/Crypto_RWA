from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from services.agent.app.schemas.allocation import AllocationDecisionResponse
from services.agent.app.schemas.portfolio import PortfolioSnapshotResponse
from services.agent.app.schemas.proposals import ProposalListItem
from services.agent.app.schemas.recommendations import RecommendationResponse
from services.agent.app.schemas.risk import RiskAssessmentResponse


class DashboardFreshnessPayload(BaseModel):
    updated_at: str | None = None
    age_seconds: int | None = None
    status: str


class DashboardCachePayload(BaseModel):
    hit: bool
    ttl_seconds: int


class DashboardSummaryResponse(BaseModel):
    portfolio: PortfolioSnapshotResponse | None = None
    risk: RiskAssessmentResponse | None = None
    allocation: AllocationDecisionResponse | None = None
    latest_decision: RecommendationResponse | None = None
    pending_proposal: ProposalListItem | None = None
    alerts: list[dict[str, Any]] = Field(default_factory=list)
    freshness: DashboardFreshnessPayload
    mode: str
    cache: DashboardCachePayload
