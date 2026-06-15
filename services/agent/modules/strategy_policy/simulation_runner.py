from __future__ import annotations

from dataclasses import dataclass

from services.agent.modules.strategy_policy.schemas import StrategyPolicyConfig, StrategySimulationMetrics


@dataclass(frozen=True)
class SimulationContext:
    current_risk_score: float | None = None
    current_quote_slippage_bps: int | None = None
    market_fresh: bool = True
    data_sources_used: list[str] | None = None


def run_simulation(policy: StrategyPolicyConfig, context: SimulationContext | None = None) -> StrategySimulationMetrics:
    context = context or SimulationContext()
    data_sources_used = sorted(set(context.data_sources_used or []))
    critical_findings: list[str] = []
    protective_actions: list[str] = []

    score = 18.0
    score += max(0.0, (policy.hard_limits.max_slippage_bps - 50) / 5.0)
    score += max(0.0, (policy.hard_limits.max_gas_gwei - 50) / 20.0)
    score += max(0.0, (35 - policy.hard_limits.min_stable_reserve_pct) * 0.7)
    score += max(0.0, (policy.hard_limits.max_llm_influence_pct - 35) * 1.5)
    score += max(0.0, (len(policy.allowed_assets) - 3) * 4.0)

    if context.current_risk_score is not None:
        score += max(0.0, context.current_risk_score * 0.35)
    if context.current_quote_slippage_bps is not None:
        score += max(0.0, context.current_quote_slippage_bps * 0.2)
    if not context.market_fresh:
        score += 18.0
        critical_findings.append("Market context is stale or incomplete.")
        protective_actions.append("pause_on_stale_market")
    if policy.simulation_only_mode:
        score -= 5.0
        protective_actions.append("keep_simulation_only")
    if not policy.hard_limits.global_circuit_breaker:
        score += 30.0
        critical_findings.append("Global circuit breaker is disabled.")

    score = max(0.0, min(100.0, score))
    expected_slippage_bps = min(policy.hard_limits.max_slippage_bps, context.current_quote_slippage_bps or policy.hard_limits.max_slippage_bps)
    expected_human_approval_required = score >= policy.hard_limits.force_human_approval_risk_score or policy.human_approval_required
    expected_pause_required = score >= policy.hard_limits.pause_risk_score or not policy.hard_limits.global_circuit_breaker

    if score >= policy.hard_limits.pause_risk_score:
        critical_findings.append("Projected risk remains above pause threshold.")
        protective_actions.append("require_pause_before_activation")
    elif score >= policy.hard_limits.force_human_approval_risk_score:
        critical_findings.append("Projected risk requires human approval.")
        protective_actions.append("route_to_human_approval")
    else:
        protective_actions.append("allow_activation_with_monitoring")

    if policy.hard_limits.max_slippage_bps <= 25:
        protective_actions.append("tight_slippage_guard")
    if policy.hard_limits.min_stable_reserve_pct >= 40:
        protective_actions.append("preserve_stable_reserve")

    recommendation = "approve"
    if expected_pause_required or any("pause" in action for action in protective_actions):
        recommendation = "review"
    if any("Global circuit breaker" in finding for finding in critical_findings):
        recommendation = "reject"
    if not policy.allowed_assets:
        recommendation = "reject"
        critical_findings.append("No allowed assets were configured.")

    return StrategySimulationMetrics(
        expected_risk_score=int(round(score)),
        expected_slippage_bps=int(round(expected_slippage_bps)),
        expected_human_approval_required=expected_human_approval_required,
        expected_pause_required=expected_pause_required,
        recommendation=recommendation,
        critical_findings=critical_findings,
        protective_actions=sorted(set(protective_actions)),
        data_sources_used=data_sources_used,
    )

