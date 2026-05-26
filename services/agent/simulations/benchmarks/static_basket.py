from __future__ import annotations

from services.agent.simulations.backtests.metrics import compute_metrics


DEFAULT_STATIC_WEIGHTS = {"USDC": 0.25, "USDY": 0.45, "mETH": 0.30}


def run_static_basket(scenario: dict, weights: dict[str, float] | None = None) -> tuple[list[float], object]:
    steps = scenario.get("steps", [])
    if not steps:
        return [], compute_metrics(benchmark_id="static_basket", label="Static Basket", values=[])

    basket_weights = weights or DEFAULT_STATIC_WEIGHTS
    initial_value = float(steps[0]["portfolio"]["total_value_usd"])
    initial_prices = steps[0].get("asset_prices", {})
    values: list[float] = []

    for step in steps:
        prices = step.get("asset_prices", {})
        value = 0.0
        for asset, weight in basket_weights.items():
            start_price = float(initial_prices.get(asset, 1.0)) or 1.0
            current_price = float(prices.get(asset, start_price))
            value += initial_value * weight * (current_price / start_price)
        values.append(value)

    return values, compute_metrics(benchmark_id="static_basket", label="Static Basket", values=values)
