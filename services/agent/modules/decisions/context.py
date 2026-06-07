from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from uuid import uuid4

from services.agent.app.api.portfolio import current_portfolio
from services.agent.app.core.settings import Settings, TargetChain, get_settings
from services.agent.app.schemas.portfolio import AssetBalance, PortfolioPosition, PortfolioSnapshot, PortfolioSnapshotResponse
from services.agent.app.schemas.risk import RiskAssessmentResponse, RiskSnapshot
from services.agent.modules.market_data.balances import internal_snapshot_from_response
from services.agent.modules.oracle.freshness import utc_now
from services.agent.modules.proposals.investment_planner import _build_target_allocations, _latest_price_map
from services.agent.risk.engine import RiskEngine
from services.agent.strategies.allocation import profiles
from services.agent.strategies.allocation.profiles import get_allocation_profile_for_chain, normalize_profile_name


@dataclass(frozen=True)
class DecisionContext:
    settings: Settings
    portfolio_response: PortfolioSnapshotResponse
    portfolio: PortfolioSnapshot
    risk_assessment: RiskAssessmentResponse
    risk_snapshot: RiskSnapshot
    profile_name: str
    scope_type: str = "wallet"
    scope_input: dict | None = None


RiskSnapshotAdapter = RiskSnapshot


def risk_assessment_to_snapshot(assessment: RiskAssessmentResponse) -> RiskSnapshot:
    bucket_scores = {
        bucket.bucket: bucket.score
        for bucket in assessment.buckets
    }
    prechecks = {
        bucket.bucket: not bucket.hard_veto and bucket.status not in {"blocked", "missing"}
        for bucket in assessment.buckets
    }
    return RiskSnapshot(
        snapshot_id=str(assessment.metadata.get("risk_snapshot_id") or f"risk_assessment_{int(assessment.generated_at.timestamp())}"),
        total_score=assessment.risk_score,
        risk_band=assessment.risk_band,
        status_code=assessment.status_code,
        status_reason=assessment.status_reason,
        bucket_scores=bucket_scores,
        prechecks=prechecks,
        notes=list(assessment.notes),
        created_at=assessment.generated_at,
    )


def _active_profile_name(settings: Settings, requested_profile_name: str | None = None) -> str:
    configured_name = requested_profile_name or profiles.ACTIVE_PROFILE_NAME or settings.allocation_profile_name
    if settings.target_chain == TargetChain.MANTLE_SEPOLIA and requested_profile_name is None:
        configured_name = "Sepolia Test"
    return normalize_profile_name(configured_name)


def _resolve_price(symbol: str, prices: dict[str, Decimal], settings: Settings) -> Decimal:
    upper = symbol.upper()
    if upper in prices:
        return prices[upper]
    if upper == "MNT" and "WMNT" in prices:
        return prices["WMNT"]
    if upper == "WMNT" and "MNT" in prices:
        return prices["MNT"]
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


def _build_scoped_portfolio(
    *,
    deposit_asset_symbol: str,
    deposit_amount: float,
    risk_profile: str,
    wallet_address: str | None = None,
    allocation_mode: str = "AI Suggested",
    settings: Settings | None = None,
) -> tuple[PortfolioSnapshotResponse, dict[str, float], str]:
    settings = settings or get_settings()
    profile_name, target_weights = get_allocation_profile_for_chain(risk_profile, settings.target_chain.value)
    canonical_profile = normalize_profile_name(profile_name)
    prices = _latest_price_map()
    deposit_price = _resolve_price(deposit_asset_symbol, prices, settings)
    deposit_amount_dec = Decimal(str(deposit_amount))
    total_value_usd = deposit_amount_dec * deposit_price if deposit_price > 0 else Decimal("0")
    resolved_prices = dict(prices)
    for symbol in {deposit_asset_symbol.upper(), *[s.upper() for s in target_weights.keys()]}:
        rp = _resolve_price(symbol, resolved_prices, settings)
        if rp > 0:
            resolved_prices[symbol] = rp
    allocations = _build_target_allocations(
        deposit_amount=deposit_amount_dec,
        deposit_asset_symbol=deposit_asset_symbol,
        deposit_price_usd=deposit_price if deposit_price > 0 else Decimal("0"),
        target_weights=target_weights,
        source="investment_scope",
        prices=resolved_prices,
    )
    allocations = [item for item in allocations if item.asset_symbol.upper() == deposit_asset_symbol.upper() or item.value_usd > 0]

    positions: list[PortfolioPosition] = []
    for item in allocations:
        positions.append(PortfolioPosition(
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
            status_code="DATA_FRESH",
            status_reason="Scoped investment allocation preview.",
            data_sources_used=["investment_scope", "normalized_prices"],
        ))

    snapshot = PortfolioSnapshotResponse(
        snapshot_id=f"scoped_portfolio_{uuid4().hex}",
        generated_at=utc_now(),
        portfolio_address=wallet_address,
        chain_id=settings.effective_chain_id,
        base_currency=settings.portfolio_base_currency,
        total_value_usd=str(total_value_usd),
        positions=positions,
        data_sources_used=["investment_scope", "normalized_prices"],
        status="ok" if positions else "degraded",
        status_code="DATA_FRESH" if positions else "DATA_MISSING",
        status_label="DATA_FRESH" if positions else "DATA_MISSING",
        status_reason=(
            f"Scoped to invest {deposit_amount} {deposit_asset_symbol} under the {canonical_profile} profile."
            if positions
            else f"No fetchable allocation data is available for {deposit_asset_symbol} under the {canonical_profile} profile."
        ),
        metadata={
            "scope": {
                "deposit_asset_symbol": deposit_asset_symbol,
                "deposit_amount": deposit_amount,
                "risk_profile": canonical_profile,
                "allocation_mode": allocation_mode,
            }
        },
    )
    return snapshot, target_weights, canonical_profile


async def build_decision_context(
    *,
    wallet_address: str | None = None,
    profile_name: str | None = None,
    allow_env_fallback: bool = False,
    deposit_asset_symbol: str | None = None,
    deposit_amount: float | None = None,
    risk_profile: str | None = None,
    allocation_mode: str | None = None,
) -> DecisionContext:
    settings = get_settings()
    is_scoped = bool(deposit_asset_symbol and deposit_amount is not None and risk_profile)

    if is_scoped:
        portfolio_response, target_weights, canonical_profile = _build_scoped_portfolio(
            deposit_asset_symbol=deposit_asset_symbol,
            deposit_amount=deposit_amount,
            risk_profile=risk_profile,
            wallet_address=wallet_address,
            allocation_mode=allocation_mode or "AI Suggested",
            settings=settings,
        )
        total_value = float(portfolio_response.total_value_usd or "0")
        portfolio = PortfolioSnapshot(
            snapshot_id=portfolio_response.snapshot_id,
            wallet_or_vault=wallet_address or "investment_scope",
            total_value_usd=total_value,
            balances=[
                AssetBalance(
                    asset_symbol=position.asset_symbol,
                    balance=float(position.balance or 0),
                    value_usd=float(position.value_usd or 0),
                    weight=float(position.weight or 0),
                    price_usd=float(position.price_usd or 0),
                )
                for position in portfolio_response.positions
            ],
            weights=target_weights,
            status_code=portfolio_response.status_code,
            status_reason=portfolio_response.status_reason,
            created_at=utc_now(),
        )
        effective_profile = _active_profile_name(settings, canonical_profile)
    else:
        portfolio_response = await current_portfolio(
            wallet_address=wallet_address,
            allow_env_fallback=allow_env_fallback,
        )
        portfolio = internal_snapshot_from_response(portfolio_response)
        effective_profile = _active_profile_name(settings, profile_name)

    risk_assessment = RiskEngine().evaluate(
        portfolio=portfolio_response,
        runtime_mode=settings.runtime_mode,
        target_chain=settings.target_chain.value,
    )

    return DecisionContext(
        settings=settings,
        portfolio_response=portfolio_response,
        portfolio=portfolio,
        risk_assessment=risk_assessment,
        risk_snapshot=risk_assessment_to_snapshot(risk_assessment),
        profile_name=effective_profile,
        scope_type="deposit" if is_scoped else "wallet",
        scope_input={
            "deposit_asset_symbol": deposit_asset_symbol,
            "deposit_amount": deposit_amount,
            "risk_profile": risk_profile,
            "allocation_mode": allocation_mode,
        } if is_scoped else None,
    )
