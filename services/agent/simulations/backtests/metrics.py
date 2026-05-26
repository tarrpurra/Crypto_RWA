from __future__ import annotations

from collections import Counter

from services.agent.app.schemas.backtests import BenchmarkMetrics


def max_drawdown_pct(values: list[float]) -> float:
    if not values:
        return 0.0

    peak = values[0]
    max_drawdown = 0.0
    for value in values:
        peak = max(peak, value)
        if peak > 0:
            max_drawdown = max(max_drawdown, (peak - value) / peak)
    return round(max_drawdown * 100.0, 4)


def total_return_pct(values: list[float]) -> float:
    if len(values) < 2 or values[0] <= 0:
        return 0.0
    return round(((values[-1] - values[0]) / values[0]) * 100.0, 4)


def compute_hit_rate(strategy_values: list[float], benchmark_values: list[float]) -> float | None:
    if len(strategy_values) != len(benchmark_values) or len(strategy_values) < 2:
        return None

    wins = 0
    periods = len(strategy_values) - 1
    for index in range(1, len(strategy_values)):
        strategy_return = strategy_values[index] - strategy_values[index - 1]
        benchmark_return = benchmark_values[index] - benchmark_values[index - 1]
        if strategy_return >= benchmark_return:
            wins += 1
    return round(wins / periods, 4) if periods > 0 else None


def compute_metrics(
    *,
    benchmark_id: str,
    label: str,
    values: list[float],
    risk_bands: list[str] | None = None,
    turnover_usd: float = 0.0,
    rebalance_count: int = 0,
    veto_count: int = 0,
    hit_rate: float | None = None,
) -> BenchmarkMetrics:
    initial_value = values[0] if values else 0.0
    final_value = values[-1] if values else 0.0
    return BenchmarkMetrics(
        benchmark_id=benchmark_id,
        label=label,
        initial_value_usd=round(initial_value, 4),
        final_value_usd=round(final_value, 4),
        total_return_pct=total_return_pct(values),
        max_drawdown_pct=max_drawdown_pct(values),
        turnover_usd=round(turnover_usd, 4),
        rebalance_count=rebalance_count,
        veto_count=veto_count,
        hit_rate=hit_rate,
        risk_band_frequency=dict(Counter(risk_bands or [])),
    )
