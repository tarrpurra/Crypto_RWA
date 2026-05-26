from __future__ import annotations

from fastapi import APIRouter, HTTPException

from services.agent.app.schemas.backtests import (
    BacktestRunRequest,
    BacktestRunResponse,
    DemoBacktestSummaryResponse,
    ScenarioListResponse,
)
from services.agent.modules.oracle.freshness import utc_now
from services.agent.simulations.backtests.engine import BacktestEngine, list_scenarios


router = APIRouter(prefix="/backtests", tags=["backtests"])


@router.get("/scenarios", response_model=ScenarioListResponse)
async def get_backtest_scenarios() -> ScenarioListResponse:
    scenarios = list_scenarios()
    return ScenarioListResponse(
        status="ok",
        status_code="SIMULATION_ONLY",
        status_label="SIMULATION_ONLY",
        status_reason="Seeded Phase 6 scenarios are available for deterministic replay.",
        generated_at=utc_now(),
        scenarios=scenarios,
    )


@router.post("/run", response_model=BacktestRunResponse)
async def run_backtest(request: BacktestRunRequest) -> BacktestRunResponse:
    try:
        return BacktestEngine().run(request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/demo-summary", response_model=DemoBacktestSummaryResponse)
async def get_demo_backtest_summary() -> DemoBacktestSummaryResponse:
    engine = BacktestEngine()
    results = [
        engine.run(BacktestRunRequest(scenario_id=scenario.scenario_id))
        for scenario in list_scenarios()
    ]
    return DemoBacktestSummaryResponse(
        status="ok",
        status_code="SIMULATION_ONLY",
        status_label="SIMULATION_ONLY",
        status_reason="Demo summary generated from all seeded Phase 6 scenarios.",
        generated_at=utc_now(),
        results=results,
    )
