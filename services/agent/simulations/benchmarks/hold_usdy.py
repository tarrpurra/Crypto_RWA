from __future__ import annotations

from services.agent.simulations.backtests.metrics import compute_metrics


def run_hold_usdy(scenario: dict) -> tuple[list[float], object]:
    steps = scenario.get("steps", [])
    if not steps:
        return [], compute_metrics(benchmark_id="hold_usdy", label="Hold USDY", values=[])

    initial_value = float(steps[0]["portfolio"]["total_value_usd"])
    initial_price = float(steps[0].get("asset_prices", {}).get("USDY", 1.0)) or 1.0
    values: list[float] = []
    for step in steps:
        usdy_price = float(step.get("asset_prices", {}).get("USDY", initial_price))
        values.append(initial_value * (usdy_price / initial_price))

    return values, compute_metrics(benchmark_id="hold_usdy", label="Hold USDY", values=values)
