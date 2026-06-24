from __future__ import annotations

from fastapi import APIRouter, Query

from services.agent.app.core.background_jobs import (
    generate_ai_decisions,
    refresh_allocation_snapshots,
    refresh_market_snapshots,
    refresh_portfolio_snapshots,
    refresh_risk_snapshots,
)
from services.agent.repositories.db.job_repository import JobRunRepository


router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/refresh-portfolio", response_model=dict)
async def refresh_portfolio_job(wallet_address: str | None = None) -> dict:
    return await refresh_portfolio_snapshots(wallet_address)


@router.post("/refresh-market", response_model=dict)
async def refresh_market_job() -> dict:
    return await refresh_market_snapshots()


@router.post("/recompute-risk", response_model=dict)
async def recompute_risk_job(wallet_address: str | None = None) -> dict:
    return await refresh_risk_snapshots(wallet_address)


@router.post("/refresh-allocation", response_model=dict)
async def refresh_allocation_job(wallet_address: str | None = None) -> dict:
    return await refresh_allocation_snapshots(wallet_address)


@router.post("/generate-ai-decision", response_model=dict)
async def generate_ai_decision_job(wallet_address: str | None = None) -> dict:
    return await generate_ai_decisions(wallet_address)


@router.get("/recent", response_model=dict)
def recent_jobs(limit: int = Query(20, ge=1, le=100)) -> dict:
    runs = JobRunRepository().recent_jobs(limit=limit)
    return {
        "status": "ok",
        "jobs": [
            {
                "id": run.id,
                "job_name": run.job_name,
                "status": run.status,
                "started_at": run.started_at.isoformat() if run.started_at else None,
                "finished_at": run.finished_at.isoformat() if run.finished_at else None,
                "error_message": run.error_message,
                "metadata": run.metadata_json,
            }
            for run in runs
        ],
    }
