from __future__ import annotations

from services.agent.app.schemas.backtests import BacktestStepResult
from services.agent.simulations.backtests.metrics import compute_hit_rate, compute_metrics


def run_guardian_strategy(
    steps: list[BacktestStepResult],
    *,
    baseline_values: list[float] | None = None,
) -> tuple[list[float], object]:
    values = [step.portfolio_value_usd for step in steps]
    turnover = 0.0
    rebalance_count = 0
    veto_count = 0
    risk_bands: list[str] = []

    for step in steps:
        risk_bands.append(step.risk_band)
        if step.risk_band in ("RISK_VETO", "RISK_PAUSE_REQUIRED"):
            veto_count += 1
        if step.recommended_action == "REBALANCE":
            rebalance_count += 1
        turnover += step.action_notional_usd

    hit_rate = compute_hit_rate(values, baseline_values) if baseline_values else None
    metrics = compute_metrics(
        benchmark_id="guardian_strategy",
        label="AIxRWA Guardian Strategy",
        values=values,
        risk_bands=risk_bands,
        turnover_usd=turnover,
        rebalance_count=rebalance_count,
        veto_count=veto_count,
        hit_rate=hit_rate,
    )
    return values, metrics
