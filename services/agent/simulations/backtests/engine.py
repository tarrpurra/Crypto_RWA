from __future__ import annotations

from datetime import datetime

from services.agent.app.schemas.allocation import RebalanceAction
from services.agent.app.schemas.backtests import (
    BacktestRunRequest,
    BacktestRunResponse,
    BacktestStepResult,
    ScenarioDescriptor,
)
from services.agent.app.schemas.portfolio import AssetBalance, PortfolioSnapshot
from services.agent.app.schemas.risk import RiskSnapshot
from services.agent.modules.oracle.freshness import utc_now
from services.agent.simulations.benchmarks.guardian_strategy import run_guardian_strategy
from services.agent.simulations.benchmarks.hold_usdy import run_hold_usdy
from services.agent.simulations.benchmarks.static_basket import run_static_basket
from services.agent.simulations.stress import (
    build_depeg_scenario,
    build_liquidity_shock_scenario,
    build_stale_oracle_scenario,
)
from services.agent.strategies.allocation.rebalance import compute_rebalance


SCENARIO_BUILDERS = {
    "depeg": build_depeg_scenario,
    "stale_oracle": build_stale_oracle_scenario,
    "liquidity_shock": build_liquidity_shock_scenario,
}


def load_scenario(scenario_id: str) -> dict:
    builder = SCENARIO_BUILDERS.get(scenario_id)
    if builder is None:
        raise ValueError(f"Unknown backtest scenario: {scenario_id}")
    return builder()


def _scenario_descriptor(scenario: dict) -> ScenarioDescriptor:
    return ScenarioDescriptor(
        scenario_id=scenario["scenario_id"],
        name=scenario["name"],
        description=scenario["description"],
        category=scenario.get("category", "stress"),
        step_count=len(scenario.get("steps", [])),
        data_sources_used=scenario.get("data_sources_used", ["seeded_scenario"]),
    )


def list_scenarios() -> list[ScenarioDescriptor]:
    return [_scenario_descriptor(load_scenario(scenario_id)) for scenario_id in sorted(SCENARIO_BUILDERS)]


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _portfolio_from_step(step: dict) -> PortfolioSnapshot:
    observed_at = _parse_datetime(step["observed_at"])
    portfolio = step["portfolio"]
    return PortfolioSnapshot(
        snapshot_id=portfolio["snapshot_id"],
        wallet_or_vault=portfolio["wallet_or_vault"],
        total_value_usd=float(portfolio["total_value_usd"]),
        balances=[AssetBalance(**balance) for balance in portfolio.get("balances", [])],
        weights={asset: float(weight) for asset, weight in portfolio.get("weights", {}).items()},
        status_code=portfolio["status_code"],
        status_reason=portfolio["status_reason"],
        created_at=observed_at,
    )


def _risk_from_step(step: dict) -> RiskSnapshot:
    observed_at = _parse_datetime(step["observed_at"])
    risk = step["risk"]
    return RiskSnapshot(
        snapshot_id=risk["snapshot_id"],
        total_score=float(risk["total_score"]),
        risk_band=risk["risk_band"],
        status_code=risk["status_code"],
        status_reason=risk["status_reason"],
        bucket_scores={key: float(value) for key, value in risk.get("bucket_scores", {}).items()},
        prechecks={key: bool(value) for key, value in risk.get("prechecks", {}).items()},
        notes=list(risk.get("notes", [])),
        created_at=observed_at,
    )


def _action_notional_usd(action: RebalanceAction, portfolio: PortfolioSnapshot) -> float:
    balance = next((item for item in portfolio.balances if item.asset_symbol == action.asset_symbol), None)
    if balance is None or balance.balance <= 0:
        return 0.0
    price = balance.value_usd / balance.balance
    return abs(action.amount * price)


class BacktestEngine:
    def run(self, request: BacktestRunRequest) -> BacktestRunResponse:
        scenario = load_scenario(request.scenario_id)
        steps: list[BacktestStepResult] = []

        for index, step in enumerate(scenario.get("steps", [])):
            portfolio = _portfolio_from_step(step)
            risk = _risk_from_step(step)
            decision, actions = compute_rebalance(portfolio, risk, request.profile_name)
            action_notional = sum(_action_notional_usd(action, portfolio) for action in actions)
            step_notes = list(risk.notes)
            if action_notional > 0:
                step_notes.append(f"Estimated action notional: ${action_notional:.2f}")

            steps.append(
                BacktestStepResult(
                    step_index=index,
                    observed_at=portfolio.created_at,
                    portfolio_value_usd=portfolio.total_value_usd,
                    risk_band=risk.risk_band,
                    risk_score=risk.total_score,
                    recommended_action=decision.recommended_action,
                    rebalance_actions=actions,
                    action_notional_usd=round(action_notional, 4),
                    notes=step_notes,
                )
            )

        static_values, static_metrics = run_static_basket(scenario)
        hold_values, hold_metrics = run_hold_usdy(scenario)
        _, guardian_metrics = run_guardian_strategy(steps, baseline_values=static_values)
        benchmark_map = {
            "hold_usdy": hold_metrics,
            "static_basket": static_metrics,
            "guardian_strategy": guardian_metrics,
        }
        benchmarks = [benchmark_map[item] for item in request.benchmarks if item in benchmark_map]

        status = "ok" if steps else "degraded"
        status_code = "SIMULATION_ONLY" if steps else "DATA_MISSING"
        status_reason = "Backtest replay completed from seeded scenario inputs." if steps else "Scenario has no replayable steps."
        return BacktestRunResponse(
            status=status,
            status_code=status_code,
            status_label=status_code,
            status_reason=status_reason,
            generated_at=utc_now(),
            scenario=_scenario_descriptor(scenario),
            profile_name=request.profile_name,
            steps=steps,
            benchmarks=benchmarks,
            metadata={
                "mode": "seeded_local_simulation",
                "live_market_validation_required": True,
                "phase_1b_dependency": "Live quote, oracle, and persistence validation remain outside Phase 6 local-safe replay.",
            },
        )
