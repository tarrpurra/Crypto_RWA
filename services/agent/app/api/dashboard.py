from __future__ import annotations

from fastapi import APIRouter

from services.agent.app.schemas.dashboard import DashboardCachePayload, DashboardSummaryResponse
from services.agent.modules.dashboard.cache import get_cached, set_cached
from services.agent.modules.dashboard.summary import get_dashboard_summary


router = APIRouter(prefix="/dashboard", tags=["dashboard"])

_DASHBOARD_SUMMARY_TTL_SECONDS = 15


@router.get("/summary", response_model=DashboardSummaryResponse)
async def dashboard_summary(wallet_address: str | None = None) -> DashboardSummaryResponse:
    cache_key = f"dashboard_summary:{(wallet_address or '').lower()}"
    cached = get_cached(cache_key, ttl_seconds=_DASHBOARD_SUMMARY_TTL_SECONDS)
    if cached is not None:
        return DashboardSummaryResponse(
            **cached,
            cache=DashboardCachePayload(hit=True, ttl_seconds=_DASHBOARD_SUMMARY_TTL_SECONDS),
        )

    summary = get_dashboard_summary(wallet_address)
    set_cached(cache_key, summary)
    return DashboardSummaryResponse(
        **summary,
        cache=DashboardCachePayload(hit=False, ttl_seconds=_DASHBOARD_SUMMARY_TTL_SECONDS),
    )
