from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from services.agent.app.core.settings import Settings, TargetChain, get_settings
from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.schemas.allocation import AllocationDecision, AllocationDecisionResponse, RebalanceAction
from services.agent.app.schemas.portfolio import AssetBalance, PortfolioPosition, PortfolioSnapshot, PortfolioSnapshotResponse
from services.agent.app.schemas.recommendations import RecommendationResponse
from services.agent.app.schemas.risk import RiskAssessmentResponse
from services.agent.modules.oracle.freshness import utc_now
from services.agent.modules.proposals.investment_planner import (
    _build_planned_swaps,
    _build_target_allocations,
    _latest_price_map,
)
from services.agent.risk.engine import RiskEngine
from services.agent.risk.scoring.score_engine import RiskScoreEngine
from services.agent.strategies.allocation.profiles import get_allocation_profile_for_chain, normalize_profile_name
from services.agent.strategies.decision_templates.parser import generate_recommendation_reasoning


@dataclass(frozen=True)
class InvestmentScopeInput:
    wallet_address: str | None
    deposit_asset_symbol: str
    deposit_amount: float
    risk_profile: str
    allocation_mode: str = "AI Suggested"


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _resolve_price(symbol: str, prices: dict[str, Decimal], settings: Settings | None = None) -> Decimal:
    upper = symbol.upper()
    if upper in prices:
        return prices[upper]
    if upper == "MNT" and "WMNT" in prices:
        return prices["WMNT"]
    if upper == "WMNT" and "MNT" in prices:
        return prices["MNT"]
    if settings is not None:
        if upper in {"USDC", "USDC.E"} and settings.target_chain == TargetChain.MANTLE_SEPOLIA and settings.simulation_fallback_enabled:
            return Decimal("1")
        if upper == "USDY" and settings.target_chain == TargetChain.MANTLE_SEPOLIA:
            if settings.sepolia_usdy_reference_price_usd:
                try:
                    return Decimal(str(settings.sepolia_usdy_reference_price_usd))
                except Exception:
                    pass
            if settings.simulation_fallback_enabled:
                return Decimal("1")
        if upper == "METH" and settings.target_chain == TargetChain.MANTLE_SEPOLIA:
            if (
                settings.sepolia_meth_is_test_token
                and settings.effective_sepolia_meth_price_mode == "manual_mirror"
                and settings.meth_manual_price_usd
            ):
                try:
                    return Decimal(str(settings.meth_manual_price_usd))
                except Exception:
                    pass
    return Decimal("0")


def _resolved_price_map(
    scope: InvestmentScopeInput,
    target_weights: dict[str, float],
    settings: Settings,
    prices: dict[str, Decimal],
) -> dict[str, Decimal]:
    resolved = dict(prices)
    symbols = {scope.deposit_asset_symbol.upper(), *[symbol.upper() for symbol in target_weights.keys()]}
    for symbol in symbols:
        resolved_price = _resolve_price(symbol, resolved, settings)
        if resolved_price > 0:
            resolved[symbol] = resolved_price
    return resolved


def _target_weights(scope: InvestmentScopeInput, settings: Settings) -> tuple[str, dict[str, float]]:
    profile_name, ai_weights = get_allocation_profile_for_chain(scope.risk_profile, settings.target_chain.value)
    normalized_profile = normalize_profile_name(profile_name)
    return normalized_profile, dict(ai_weights)


def _quote_validation_status(swaps) -> str:
    if not swaps:
        return DataStatusCode.DATA_FRESH.value
    if all(swap.quote and swap.quote.amount_out and swap.quote.status_code == DataStatusCode.QUOTE_FRESH.value for swap in swaps):
        return DataStatusCode.QUOTE_FRESH.value
    return DataStatusCode.LIQUIDITY_UNKNOWN.value


def build_scoped_portfolio_response(scope: InvestmentScopeInput, settings: Settings | None = None) -> tuple[PortfolioSnapshotResponse, dict[str, float], str]:
    settings = settings or get_settings()
    profile_name, target_weights = _target_weights(scope, settings)
    prices = _latest_price_map()
    resolved_prices = _resolved_price_map(scope, target_weights, settings, prices)
    deposit_price = _resolve_price(scope.deposit_asset_symbol, resolved_prices, settings)
    deposit_amount = Decimal(str(scope.deposit_amount))
    total_value_usd = deposit_amount * deposit_price if deposit_price > 0 else Decimal("0")
    allocations = _build_target_allocations(
        deposit_amount=deposit_amount,
        deposit_asset_symbol=scope.deposit_asset_symbol,
        deposit_price_usd=deposit_price if deposit_price > 0 else Decimal("0"),
        target_weights=target_weights,
        source="investment_scope",
        prices=resolved_prices,
    )
    allocations = [
        item
        for item in allocations
        if item.asset_symbol.upper() == scope.deposit_asset_symbol.upper() or item.value_usd > 0
    ]
    positions: list[PortfolioPosition] = []
    for item in allocations:
        positions.append(
            PortfolioPosition(
                asset_key=item.asset_symbol.upper(),
                asset_symbol=item.asset_symbol,
                asset_address=None,
                chain_id=settings.effective_chain_id,
                balance=str(item.amount),
                balance_source="investment_scope",
                price_usd=str(resolved_prices.get(item.asset_symbol.upper())) if resolved_prices.get(item.asset_symbol.upper()) is not None else None,
                value_usd=str(item.value_usd),
                weight=str(item.percentage),
                target_weight=str(item.percentage),
                weight_drift="0",
                drift_status="within_tolerance",
                valuation_status="valued" if item.value_usd > 0 else "unvalued",
                status_code=DataStatusCode.DATA_FRESH.value,
                status_reason="Scoped investment allocation preview.",
                data_sources_used=["investment_scope", "normalized_prices"],
            )
        )
    snapshot = PortfolioSnapshotResponse(
        snapshot_id=f"scoped_portfolio_{uuid4().hex}",
        generated_at=utc_now(),
        portfolio_address=scope.wallet_address,
        chain_id=settings.effective_chain_id,
        base_currency=settings.portfolio_base_currency,
        total_value_usd=str(total_value_usd),
        positions=positions,
        data_sources_used=["investment_scope", "normalized_prices"],
        status="ok" if positions else "degraded",
        status_code=DataStatusCode.DATA_FRESH.value if positions else DataStatusCode.DATA_MISSING.value,
        status_label=DataStatusCode.DATA_FRESH.value if positions else DataStatusCode.DATA_MISSING.value,
        status_reason=(
            f"Scoped to invest {scope.deposit_amount} {scope.deposit_asset_symbol} under the {profile_name} profile."
            if positions
            else f"No fetchable allocation data is available for {scope.deposit_asset_symbol} under the {profile_name} profile."
        ),
        metadata={
            "scope": {
                "deposit_asset_symbol": scope.deposit_asset_symbol,
                "deposit_amount": scope.deposit_amount,
                "risk_profile": profile_name,
                "allocation_mode": scope.allocation_mode,
            }
        },
    )
    return snapshot, target_weights, profile_name


def build_scoped_internal_portfolio(scope: InvestmentScopeInput, settings: Settings | None = None) -> PortfolioSnapshot:
    snapshot, target_weights, _ = build_scoped_portfolio_response(scope, settings)
    total_value = float(snapshot.total_value_usd or "0")
    balances = [
        AssetBalance(
            asset_symbol=position.asset_symbol,
            balance=float(position.balance or 0),
            value_usd=float(position.value_usd or 0),
            weight=float(position.weight or 0),
        )
        for position in snapshot.positions
    ]
    return PortfolioSnapshot(
        snapshot_id=snapshot.snapshot_id,
        wallet_or_vault=scope.wallet_address or "investment_scope",
        total_value_usd=total_value,
        balances=balances,
        weights=target_weights,
        status_code=snapshot.status_code,
        status_reason=snapshot.status_reason,
        created_at=_ensure_utc(snapshot.generated_at),
    )


def build_scoped_risk_assessment(scope: InvestmentScopeInput, settings: Settings | None = None) -> RiskAssessmentResponse:
    settings = settings or get_settings()
    snapshot, target_weights, _ = build_scoped_portfolio_response(scope, settings)
    swaps = _build_planned_swaps(
        deposit_asset_symbol=scope.deposit_asset_symbol,
        deposit_amount=Decimal(str(scope.deposit_amount)),
        target_weights=target_weights,
    )
    return RiskEngine().evaluate(
        portfolio=snapshot,
        runtime_mode=settings.runtime_mode,
        target_chain=settings.target_chain.value,
        quote_validation_status=_quote_validation_status(swaps),
    )


def build_scoped_allocation_response(scope: InvestmentScopeInput, settings: Settings | None = None) -> AllocationDecisionResponse:
    settings = settings or get_settings()
    snapshot, target_weights, profile_name = build_scoped_portfolio_response(scope, settings)
    deposit_symbol = scope.deposit_asset_symbol.upper()
    deposit_amount = float(scope.deposit_amount)
    allocations_by_symbol = {position.asset_symbol.upper(): position for position in snapshot.positions}
    actions: list[RebalanceAction] = []
    retained_weight = target_weights.get(scope.deposit_asset_symbol, target_weights.get(deposit_symbol, 0.0))
    retained_amount = deposit_amount * retained_weight
    if retained_amount > 0:
        actions.append(
            RebalanceAction(
                asset_symbol=scope.deposit_asset_symbol,
                action="HOLD",
                amount=round(retained_amount, 8),
                route_id=None,
            )
        )
    swaps = _build_planned_swaps(
        deposit_asset_symbol=scope.deposit_asset_symbol,
        deposit_amount=Decimal(str(scope.deposit_amount)),
        target_weights=target_weights,
    )
    for swap in swaps:
        target_position = allocations_by_symbol.get(swap.target_asset_symbol.upper())
        actions.append(
            RebalanceAction(
                asset_symbol=swap.target_asset_symbol,
                action="BUY",
                amount=round(float(target_position.balance) if target_position and target_position.balance else 0.0, 8),
                route_id=swap.quote.route_id if swap.quote else None,
            )
        )
    actions = [action for action in actions if action.amount > 0]
    actionable_actions = [action for action in actions if action.action != "HOLD"]
    actions = actionable_actions + [action for action in actions if action.action == "HOLD"]
    recommended_action = "REBALANCE" if actionable_actions else "HOLD"
    reasoning = (
        f"Scoped allocation uses {scope.deposit_amount} {scope.deposit_asset_symbol} on chain {settings.effective_chain_id} "
        f"with the {profile_name} target profile."
    )
    if settings.target_chain == TargetChain.MANTLE_SEPOLIA and "USDC" not in target_weights:
        reasoning += " USDC is excluded on Mantle Sepolia and the remaining sleeves are renormalized."
    decision = AllocationDecision(
        decision_id=f"scoped_allocation_{uuid4().hex}",
        wallet_or_vault=scope.wallet_address or "investment_scope",
        profile_name=profile_name,
        current_weights={scope.deposit_asset_symbol: 1.0},
        target_weights=target_weights,
        recommended_action=recommended_action,
        confidence=0.85 if snapshot.status_code == DataStatusCode.DATA_FRESH.value else 0.5,
        reasoning=reasoning,
        risk_snapshot_id=None,
        status_code=DataStatusCode.DATA_FRESH.value,
        created_at=utc_now(),
    )
    return AllocationDecisionResponse(
        status="ok",
        status_code=DataStatusCode.DATA_FRESH.value,
        status_label=DataStatusCode.DATA_FRESH.value,
        status_reason=reasoning,
        generated_at=utc_now(),
        decision=decision,
        rebalance_actions=actions,
    )


async def build_scoped_decision_response(scope: InvestmentScopeInput, settings: Settings | None = None) -> RecommendationResponse:
    settings = settings or get_settings()
    allocation = build_scoped_allocation_response(scope, settings)
    internal_portfolio = build_scoped_internal_portfolio(scope, settings)
    risk_snapshot = RiskScoreEngine().compute_risk_snapshot(internal_portfolio)
    return await generate_recommendation_reasoning(
        internal_portfolio,
        risk_snapshot,
        allocation.decision,
        allocation.rebalance_actions,
    )
