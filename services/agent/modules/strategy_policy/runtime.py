from __future__ import annotations

from typing import Iterable

from services.agent.modules.strategy_policy.repository import StrategyPolicyRepository
from services.agent.modules.strategy_policy.schemas import StrategyPolicyConfig, StrategyVersionRecordResponse
from services.agent.strategies.allocation.profiles import get_allocation_profile_for_chain, normalize_profile_name

STABLE_ASSET_SYMBOLS = {"USDY", "USDT", "DAI", "MUSD"}

OBJECTIVE_RISK_SHARE = {
    "capital_preservation_first": 0.30,
    "balanced_yield": 0.40,
    "emergency_defensive": 0.10,
    "yield_guard": 0.50,
}


def _normalized_assets(value: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for asset in value:
        normalized = str(asset).strip()
        if not normalized:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(normalized)
    return ordered


def derive_target_weights(policy: StrategyPolicyConfig) -> dict[str, float]:
    allowed_assets = _normalized_assets(policy.allowed_assets)
    if not allowed_assets:
        return {}

    stable_assets = [asset for asset in allowed_assets if asset.upper() in STABLE_ASSET_SYMBOLS]
    primary_stable = stable_assets[0] if stable_assets else allowed_assets[0]
    remaining_assets = [asset for asset in allowed_assets if asset != primary_stable]
    if not remaining_assets:
        return {primary_stable: 1.0}

    max_risk_share = OBJECTIVE_RISK_SHARE.get(policy.objective, 0.40)
    stable_floor = max(0.0, min(1.0, policy.hard_limits.min_stable_reserve_pct / 100))
    stable_weight = max(stable_floor, 1.0 - max_risk_share)
    stable_weight = max(0.0, min(1.0, stable_weight))
    remaining_weight = max(0.0, 1.0 - stable_weight)

    weights: dict[str, float] = {primary_stable: stable_weight}
    per_asset_cap = max(0.0, min(1.0, policy.hard_limits.max_asset_exposure_pct / 100))
    raw_share = remaining_weight / len(remaining_assets) if remaining_assets else 0.0
    capped_share = min(raw_share, per_asset_cap) if per_asset_cap > 0 else raw_share

    allocated_to_risk = capped_share * len(remaining_assets)
    spillback_to_stable = max(0.0, remaining_weight - allocated_to_risk)
    weights[primary_stable] += spillback_to_stable

    for asset in remaining_assets:
        weights[asset] = capped_share

    total = sum(weights.values())
    if total <= 0:
        return {primary_stable: 1.0}
    return {asset: round(weight / total, 6) for asset, weight in weights.items() if weight > 0}


def resolve_active_strategy_target_weights() -> tuple[str | None, dict[str, float] | None, StrategyPolicyConfig | None]:
    active_version: StrategyVersionRecordResponse | None = StrategyPolicyRepository().get_active_version()
    if active_version is None:
        return None, None, None
    policy = active_version.active_policy_json
    profile_name = f"Custom Strategy {active_version.version}"
    return profile_name, derive_target_weights(policy), policy


def resolve_requested_profile_name(
    profile_name: str,
    target_chain: str | None = None,
) -> str:
    candidate = str(profile_name or "").strip()
    active_profile_name, active_target_weights, _ = resolve_active_strategy_target_weights()
    custom_aliases = {"custom strategy", "active strategy", "strategy policy"}
    if active_target_weights and active_profile_name:
        lowered = candidate.lower()
        if lowered in custom_aliases or lowered == active_profile_name.lower():
            return active_profile_name
    return normalize_profile_name(candidate)


def resolve_target_weights(
    profile_name: str,
    target_chain: str | None = None,
) -> tuple[str, dict[str, float], StrategyPolicyConfig | None]:
    active_profile_name, active_target_weights, active_policy = resolve_active_strategy_target_weights()
    if active_target_weights:
        return active_profile_name or "Strategy Policy", active_target_weights, active_policy

    canonical = normalize_profile_name(profile_name)
    _, profile_weights = get_allocation_profile_for_chain(canonical, target_chain)
    return canonical, dict(profile_weights), None
