from __future__ import annotations

from copy import deepcopy
from typing import Any

from services.agent.modules.strategy_policy.schemas import (
    DEFAULT_AI_RUN_INTERVAL_SECONDS,
    StrategyHardLimits,
    StrategyPolicyConfig,
    StrategyRiskWeights,
)

SAFE_OBJECTIVES = {
    "capital preservation first": "capital_preservation_first",
    "capital preservation": "capital_preservation_first",
    "balanced yield": "balanced_yield",
    "balanced": "balanced_yield",
    "emergency defensive": "emergency_defensive",
    "defensive": "emergency_defensive",
    "yield guard": "yield_guard",
}

TEMPLATE_PRESETS: dict[str, StrategyPolicyConfig] = {
    "Conservative RWA Guardian": StrategyPolicyConfig(
        strategy_version="v1.0.0",
        objective="capital_preservation_first",
        allowed_assets=["USDY", "mETH"],
        risk_weights=StrategyRiskWeights(llm_sentiment=0.35, liquidity=0.20, oracle=0.15, depeg=0.20, execution=0.10),
        hard_limits=StrategyHardLimits(
            max_slippage_bps=50,
            max_gas_gwei=50,
            max_asset_exposure_pct=35,
            max_issuer_exposure_pct=60,
            min_stable_reserve_pct=40,
            max_llm_influence_pct=35,
            max_risk_score_for_fresh_allocation=45,
            force_human_approval_risk_score=65,
            pause_risk_score=80,
            global_circuit_breaker=True,
        ),
        market_check_interval_seconds=DEFAULT_AI_RUN_INTERVAL_SECONDS,
        quote_refresh_interval_seconds=DEFAULT_AI_RUN_INTERVAL_SECONDS,
        risk_recompute_interval_seconds=DEFAULT_AI_RUN_INTERVAL_SECONDS,
        proposal_expiry_seconds=180,
        simulation_only_mode=False,
        human_approval_required=True,
        notes=["Capital preservation biased policy template."],
    ),
    "Balanced Yield Guardian": StrategyPolicyConfig(
        strategy_version="v1.0.0",
        objective="balanced_yield",
        allowed_assets=["USDY", "mETH"],
        risk_weights=StrategyRiskWeights(llm_sentiment=0.35, liquidity=0.20, oracle=0.15, depeg=0.20, execution=0.10),
        hard_limits=StrategyHardLimits(
            max_slippage_bps=75,
            max_gas_gwei=60,
            max_asset_exposure_pct=40,
            max_issuer_exposure_pct=60,
            min_stable_reserve_pct=25,
            max_llm_influence_pct=35,
            max_risk_score_for_fresh_allocation=45,
            force_human_approval_risk_score=65,
            pause_risk_score=80,
            global_circuit_breaker=True,
        ),
        market_check_interval_seconds=DEFAULT_AI_RUN_INTERVAL_SECONDS,
        quote_refresh_interval_seconds=DEFAULT_AI_RUN_INTERVAL_SECONDS,
        risk_recompute_interval_seconds=DEFAULT_AI_RUN_INTERVAL_SECONDS,
        proposal_expiry_seconds=180,
        simulation_only_mode=False,
        human_approval_required=True,
        notes=["Balanced template with moderate yield bias."],
    ),
    "Emergency Defensive Mode": StrategyPolicyConfig(
        strategy_version="v1.0.0",
        objective="emergency_defensive",
        allowed_assets=["USDY"],
        risk_weights=StrategyRiskWeights(llm_sentiment=0.25, liquidity=0.25, oracle=0.20, depeg=0.20, execution=0.10),
        hard_limits=StrategyHardLimits(
            max_slippage_bps=25,
            max_gas_gwei=40,
            max_asset_exposure_pct=20,
            max_issuer_exposure_pct=40,
            min_stable_reserve_pct=70,
            max_llm_influence_pct=25,
            max_risk_score_for_fresh_allocation=30,
            force_human_approval_risk_score=65,
            pause_risk_score=80,
            global_circuit_breaker=True,
        ),
        market_check_interval_seconds=DEFAULT_AI_RUN_INTERVAL_SECONDS,
        quote_refresh_interval_seconds=DEFAULT_AI_RUN_INTERVAL_SECONDS,
        risk_recompute_interval_seconds=DEFAULT_AI_RUN_INTERVAL_SECONDS,
        proposal_expiry_seconds=120,
        simulation_only_mode=True,
        human_approval_required=True,
        notes=["Defensive template prioritizing capital preservation and pause readiness."],
    ),
}

DEFAULT_POLICY = TEMPLATE_PRESETS["Conservative RWA Guardian"]


def get_template_policy(template_name: str | None) -> StrategyPolicyConfig:
    if not template_name:
        return DEFAULT_POLICY.model_copy(deep=True)
    preset = TEMPLATE_PRESETS.get(template_name)
    if preset is None:
        return DEFAULT_POLICY.model_copy(deep=True)
    return preset.model_copy(deep=True)


def _merge_nested_dicts(base: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge_nested_dicts(merged[key], value)
        else:
            merged[key] = value
    return merged


def _normalize_objective(value: str | None) -> str | None:
    if not value:
        return None
    normalized = " ".join(value.strip().lower().replace("_", " ").split())
    return SAFE_OBJECTIVES.get(normalized, value.strip().lower().replace(" ", "_"))


def extract_policy(
    strategy_text: str,
    *,
    template_name: str | None = None,
    policy_json: dict[str, Any] | None = None,
) -> StrategyPolicyConfig:
    policy_data = get_template_policy(template_name).model_dump(mode="python")
    if policy_json:
        policy_data = _merge_nested_dicts(policy_data, policy_json)

    explicit_overrides = deepcopy(policy_json) if policy_json else None

    normalized_text = strategy_text.lower()
    for phrase, objective in SAFE_OBJECTIVES.items():
        if phrase in normalized_text:
            policy_data["objective"] = objective
            break
    if "emergency defensive" in normalized_text:
        policy_data["simulation_only_mode"] = True
    if "circuit breaker" in normalized_text and "disable" not in normalized_text:
        policy_data.setdefault("hard_limits", {})["global_circuit_breaker"] = True

    if "conservative" in normalized_text:
        policy_data["objective"] = "capital_preservation_first"
    elif "balanced" in normalized_text:
        policy_data["objective"] = "balanced_yield"
    elif "defensive" in normalized_text:
        policy_data["objective"] = "emergency_defensive"

    if "usdy" in normalized_text:
        policy_data.setdefault("allowed_assets", ["USDY", "mETH"])

    if explicit_overrides:
        for key in ("objective", "simulation_only_mode"):
            if key in explicit_overrides:
                policy_data[key] = explicit_overrides[key]
        if "hard_limits" in explicit_overrides and isinstance(explicit_overrides["hard_limits"], dict) and "global_circuit_breaker" in explicit_overrides["hard_limits"]:
            policy_data.setdefault("hard_limits", {})["global_circuit_breaker"] = explicit_overrides["hard_limits"]["global_circuit_breaker"]

    objective = _normalize_objective(str(policy_data.get("objective") or "")) or "capital_preservation_first"
    policy_data["objective"] = objective
    policy_data["strategy_version"] = str(policy_data.get("strategy_version") or "v1.0.0")

    return StrategyPolicyConfig.model_validate(policy_data)
