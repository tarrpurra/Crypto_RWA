from __future__ import annotations

from dataclasses import dataclass, field

from services.agent.modules.strategy_policy.prompt_safety import SafetyScanResult
from services.agent.modules.strategy_policy.schemas import (
    StrategyHardLimits,
    StrategyPolicyConfig,
    StrategyValidationError,
)

ALLOWED_OBJECTIVES = {
    "capital_preservation_first",
    "balanced_yield",
    "emergency_defensive",
    "yield_guard",
}

KNOWN_SAFE_ASSETS = {
    "USDY",
    "mETH",
    "USDT",
    "DAI",
    "WMNT",
    "MNT",
    "MockTokenA",
    "MockTokenB",
}


@dataclass(frozen=True)
class PolicyValidationResult:
    status: str
    safety_score: int
    validation_errors: list[StrategyValidationError] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    requires_simulation: bool = True
    safe_suggestion: str = "Describe only portfolio objectives, allowed assets, hard limits, and monitoring cadence."

    @property
    def is_valid(self) -> bool:
        return self.status == "validated"


def _error(code: str, message: str, field: str | None = None) -> StrategyValidationError:
    return StrategyValidationError(code=code, message=message, field=field)


def _append_numeric_range_checks(errors: list[StrategyValidationError], policy: StrategyPolicyConfig) -> None:
    hard: StrategyHardLimits = policy.hard_limits
    if hard.max_slippage_bps < 5 or hard.max_slippage_bps > 150:
        errors.append(_error("SLIPPAGE_LIMIT_OUT_OF_RANGE", "max_slippage_bps must stay between 5 and 150.", "hard_limits.max_slippage_bps"))
    if hard.max_gas_gwei < 1 or hard.max_gas_gwei > 300:
        errors.append(_error("GAS_LIMIT_OUT_OF_RANGE", "max_gas_gwei must stay between 1 and 300.", "hard_limits.max_gas_gwei"))
    if hard.max_asset_exposure_pct > 50:
        errors.append(_error("ASSET_EXPOSURE_TOO_HIGH", "max_asset_exposure_pct cannot exceed 50.", "hard_limits.max_asset_exposure_pct"))
    if hard.max_issuer_exposure_pct > 60:
        errors.append(_error("ISSUER_EXPOSURE_TOO_HIGH", "max_issuer_exposure_pct cannot exceed 60.", "hard_limits.max_issuer_exposure_pct"))
    if hard.min_stable_reserve_pct < 10:
        errors.append(_error("STABLE_RESERVE_TOO_LOW", "min_stable_reserve_pct must be at least 10.", "hard_limits.min_stable_reserve_pct"))
    if hard.max_llm_influence_pct > 40:
        errors.append(_error("LLM_INFLUENCE_TOO_HIGH", "max_llm_influence_pct cannot exceed 40.", "hard_limits.max_llm_influence_pct"))
    if hard.max_risk_score_for_fresh_allocation > 45:
        errors.append(_error("RISK_ALLOC_THRESHOLD_TOO_HIGH", "max_risk_score_for_fresh_allocation cannot exceed 45.", "hard_limits.max_risk_score_for_fresh_allocation"))
    if hard.force_human_approval_risk_score < 65:
        errors.append(_error("HUMAN_APPROVAL_TOO_PERMISSIVE", "force_human_approval_risk_score must be at least 65.", "hard_limits.force_human_approval_risk_score"))
    if hard.pause_risk_score < 80:
        errors.append(_error("PAUSE_THRESHOLD_TOO_PERMISSIVE", "pause_risk_score must be at least 80.", "hard_limits.pause_risk_score"))
    if hard.pause_risk_score < hard.force_human_approval_risk_score:
        errors.append(_error("PAUSE_THRESHOLD_ORDER", "pause_risk_score must not be lower than force_human_approval_risk_score.", "hard_limits.pause_risk_score"))
    if not hard.global_circuit_breaker:
        errors.append(_error("CIRCUIT_BREAKER_DISABLED", "global_circuit_breaker must remain enabled for activation.", "hard_limits.global_circuit_breaker"))

    if policy.market_check_interval_seconds < 60 or policy.market_check_interval_seconds > 3600:
        errors.append(_error("MARKET_INTERVAL_OUT_OF_RANGE", "market_check_interval_seconds must stay between 60 and 3600.", "market_check_interval_seconds"))
    if policy.quote_refresh_interval_seconds < 30 or policy.quote_refresh_interval_seconds > 1800:
        errors.append(_error("QUOTE_INTERVAL_OUT_OF_RANGE", "quote_refresh_interval_seconds must stay between 30 and 1800.", "quote_refresh_interval_seconds"))
    if policy.risk_recompute_interval_seconds < 60 or policy.risk_recompute_interval_seconds > 3600:
        errors.append(_error("RISK_INTERVAL_OUT_OF_RANGE", "risk_recompute_interval_seconds must stay between 60 and 3600.", "risk_recompute_interval_seconds"))
    if policy.proposal_expiry_seconds < 60 or policy.proposal_expiry_seconds > 3600:
        errors.append(_error("PROPOSAL_EXPIRY_OUT_OF_RANGE", "proposal_expiry_seconds must stay between 60 and 3600.", "proposal_expiry_seconds"))


def _weights_sum(value: StrategyPolicyConfig) -> float:
    weights = value.risk_weights
    return round(weights.llm_sentiment + weights.liquidity + weights.oracle + weights.depeg + weights.execution, 4)


def validate_policy(
    policy: StrategyPolicyConfig,
    *,
    scan: SafetyScanResult | None = None,
    baseline: StrategyPolicyConfig | None = None,
) -> PolicyValidationResult:
    errors: list[StrategyValidationError] = []
    warnings: list[str] = []
    safety_score = 100 if scan is None else scan.safety_score

    if scan is not None and not scan.is_safe:
        errors.append(_error("PROMPT_UNSAFE", "The strategy text contains unsafe or out-of-domain instructions.", "strategy_text"))
        warnings.extend(scan.warnings)
        safety_score = min(safety_score, scan.safety_score)

    if policy.objective not in ALLOWED_OBJECTIVES:
        errors.append(_error("UNSUPPORTED_OBJECTIVE", f"Objective '{policy.objective}' is not allowed.", "objective"))

    unknown_assets = [asset for asset in policy.allowed_assets if asset not in KNOWN_SAFE_ASSETS]
    if unknown_assets:
        errors.append(_error("UNKNOWN_ASSET", f"Allowed assets include unsupported entries: {', '.join(sorted(unknown_assets))}.", "allowed_assets"))

    weights_total = _weights_sum(policy)
    if abs(weights_total - 1.0) > 0.05:
        errors.append(_error("RISK_WEIGHTS_INVALID", f"Risk weights must total 1.0 +/- 0.05; received {weights_total:.2f}.", "risk_weights"))

    for field_name in ("llm_sentiment", "liquidity", "oracle", "depeg", "execution"):
        value = getattr(policy.risk_weights, field_name)
        if value > 1.0:
            errors.append(_error("RISK_WEIGHT_TOO_HIGH", f"{field_name} cannot exceed 1.0.", f"risk_weights.{field_name}"))

    _append_numeric_range_checks(errors, policy)

    if baseline is not None:
        base = baseline
        base_hard = baseline.hard_limits
        hard = policy.hard_limits
        if hard.max_slippage_bps > base_hard.max_slippage_bps:
            errors.append(_error("SLIPPAGE_LIMIT_WEAKER", "max_slippage_bps cannot be loosened versus the active policy.", "hard_limits.max_slippage_bps"))
        if hard.max_gas_gwei > base_hard.max_gas_gwei:
            errors.append(_error("GAS_LIMIT_WEAKER", "max_gas_gwei cannot be loosened versus the active policy.", "hard_limits.max_gas_gwei"))
        if hard.max_asset_exposure_pct > base_hard.max_asset_exposure_pct:
            errors.append(_error("ASSET_EXPOSURE_WEAKER", "max_asset_exposure_pct cannot be loosened versus the active policy.", "hard_limits.max_asset_exposure_pct"))
        if hard.max_issuer_exposure_pct > base_hard.max_issuer_exposure_pct:
            errors.append(_error("ISSUER_EXPOSURE_WEAKER", "max_issuer_exposure_pct cannot be loosened versus the active policy.", "hard_limits.max_issuer_exposure_pct"))
        if hard.min_stable_reserve_pct < base_hard.min_stable_reserve_pct:
            errors.append(_error("STABLE_RESERVE_WEAKER", "min_stable_reserve_pct cannot be reduced versus the active policy.", "hard_limits.min_stable_reserve_pct"))
        if hard.max_llm_influence_pct > base_hard.max_llm_influence_pct:
            errors.append(_error("LLM_INFLUENCE_WEAKER", "max_llm_influence_pct cannot be increased versus the active policy.", "hard_limits.max_llm_influence_pct"))
        if policy.market_check_interval_seconds > base.market_check_interval_seconds:
            errors.append(_error("MARKET_INTERVAL_WEAKER", "market_check_interval_seconds cannot be slowed versus the active policy.", "market_check_interval_seconds"))
        if policy.risk_recompute_interval_seconds > base.risk_recompute_interval_seconds:
            errors.append(_error("RISK_INTERVAL_WEAKER", "risk_recompute_interval_seconds cannot be slowed versus the active policy.", "risk_recompute_interval_seconds"))
        if policy.quote_refresh_interval_seconds > base.quote_refresh_interval_seconds:
            errors.append(_error("QUOTE_INTERVAL_WEAKER", "quote_refresh_interval_seconds cannot be slowed versus the active policy.", "quote_refresh_interval_seconds"))
        if hard.force_human_approval_risk_score < base_hard.force_human_approval_risk_score:
            errors.append(_error("HUMAN_APPROVAL_WEAKER", "force_human_approval_risk_score cannot be loosened versus the active policy.", "hard_limits.force_human_approval_risk_score"))
        if hard.pause_risk_score < base_hard.pause_risk_score:
            errors.append(_error("PAUSE_THRESHOLD_WEAKER", "pause_risk_score cannot be lowered versus the active policy.", "hard_limits.pause_risk_score"))

    if policy.hard_limits.max_llm_influence_pct > 40:
        errors.append(_error("LLM_INFLUENCE_CAP_EXCEEDED", "max_llm_influence_pct cannot exceed 40.", "hard_limits.max_llm_influence_pct"))

    if errors:
        return PolicyValidationResult(
            status="rejected",
            safety_score=safety_score,
            validation_errors=errors,
            warnings=warnings,
            requires_simulation=False,
        )

    return PolicyValidationResult(
        status="validated",
        safety_score=safety_score,
        validation_errors=[],
        warnings=warnings,
        requires_simulation=True,
    )
