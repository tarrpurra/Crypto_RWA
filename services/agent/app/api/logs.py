from __future__ import annotations

from fastapi import APIRouter, Query

from services.agent.app.core.log_buffer import recent_log_entries
from services.agent.app.schemas.logs import BackendLogEntry, BackendLogsResponse


router = APIRouter(prefix="/system/logs", tags=["logs"])


@router.get("/recent", response_model=BackendLogsResponse)
async def get_recent_backend_logs(
    limit: int = Query(120, ge=1, le=400),
) -> BackendLogsResponse:
    return BackendLogsResponse(
        status="ok",
        entries=[BackendLogEntry(**entry) for entry in recent_log_entries(limit=limit)],
    )
