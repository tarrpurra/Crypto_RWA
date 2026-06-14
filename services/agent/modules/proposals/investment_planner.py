from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from decimal import Decimal

from eth_abi import encode
from eth_hash.auto import keccak
from fastapi import HTTPException
from web3 import Web3

from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import DataStatusCode, ExecutionStatusCode, ProposalStatusCode, RuntimeMode, TargetChain
from services.agent.app.schemas.portfolio import AssetBalance, PortfolioSnapshot, PortfolioSnapshotResponse
from services.agent.app.schemas.allocation import RebalanceAction
from services.agent.app.schemas.proposals import (
    AllocationTargetItem,
    ExecutionPayloadSchema,
    InvestmentPlanRequest,
    InvestmentPlanResponse,
    LinkedProposalSummary,
    RiskValidationCheck,
    TradeProposal,
    TransactionStep,
)
from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot
from services.agent.app.schemas.risk import RiskAssessmentResponse, RiskSnapshot
from services.agent.modules.contracts.reader import get_pause_guardian_state
from services.agent.modules.market_data import PRICE_SNAPSHOT_STORE
from services.agent.modules.oracle import get_ondo_usdy_oracle_adapter
from services.agent.modules.oracle.freshness import age_seconds, utc_now
from services.agent.modules.quotes import get_quote_service
from services.agent.modules.strategy_policy.runtime import resolve_requested_profile_name, resolve_target_weights
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.strategies.allocation.profiles import get_allocation_profile
from services.agent.strategies.allocation.rebalance import compute_rebalance


PROPOSAL_DETAIL_CACHE: dict[str, InvestmentPlanResponse] = {}
logger = logging.getLogger("services.agent.proposals.investment_planner")

MIN_SWAP_USD = Decimal("1.00")
SEPOLIA_PRICE_DEVIATION_THRESHOLD = Decimal("0.10")
SEPOLIA_CONCENTRATION_CAP = Decimal("1.00")
SEPOLIA_SLIPPAGE_THRESHOLD_DEFAULT = Decimal("100")
SEPOLIA_SLIPPAGE_THRESHOLD_METH = Decimal("250")

LIVE_PRICE_DEVIATION_THRESHOLD = Decimal("0.03")
LIVE_CONCENTRATION_CAP = Decimal("0.80")
LIVE_SLIPPAGE_THRESHOLD_DEFAULT = Decimal("100")
LIVE_SLIPPAGE_THRESHOLD_METH = Decimal("150")


@dataclass(frozen=True)
class PlannedSwap:
    target_asset_symbol: str
    amount_in: Decimal
    token_in_symbol: str
    token_out_symbol: str
    quote: NormalizedQuoteSnapshot | None
    gas_estimate: Decimal | None = None
    uses_native_value: bool = False


def _execution_input_symbol(deposit_asset_symbol: str) -> str:
    return "WMNT" if deposit_asset_symbol.upper() == "MNT" else deposit_asset_symbol


def _guard_thresholds(settings: Settings) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    if settings.target_chain == TargetChain.MANTLE_SEPOLIA:
        return (
            SEPOLIA_PRICE_DEVIATION_THRESHOLD,
            SEPOLIA_CONCENTRATION_CAP,
            SEPOLIA_SLIPPAGE_THRESHOLD_DEFAULT,
            SEPOLIA_SLIPPAGE_THRESHOLD_METH,
        )
    return (
        LIVE_PRICE_DEVIATION_THRESHOLD,
        LIVE_CONCENTRATION_CAP,
        LIVE_SLIPPAGE_THRESHOLD_DEFAULT,
        LIVE_SLIPPAGE_THRESHOLD_METH,
    )


def _normalize_weights(request: InvestmentPlanRequest, settings: Settings) -> tuple[dict[str, float], dict[str, float], list[str]]:
    requested_profile_name = str(request.risk_profile or "").strip()
    profile_name = resolve_requested_profile_name(requested_profile_name, settings.target_chain.value)
    profile_name, ai_weights, _ = resolve_target_weights(profile_name, settings.target_chain.value)
    warnings: list[str] = []
    original_profile_name = profile_name
    if not profile_name.startswith("Custom Strategy"):
        original_profile_name, _ = get_allocation_profile(requested_profile_name)
    if request.allocation_mode.lower().startswith("manual"):
        if not request.manual_target_weights:
            raise HTTPException(status_code=400, detail="Manual allocation mode requires manual_target_weights.")
        total = sum(max(weight, 0.0) for weight in request.manual_target_weights.values())
        if total <= 0:
            raise HTTPException(status_code=400, detail="Manual allocation weights must sum to a positive value.")
        selected_weights = {
            asset: max(weight, 0.0) / total
            for asset, weight in request.manual_target_weights.items()
            if max(weight, 0.0) > 0
        }
    else:
        selected_weights = dict(ai_weights)
        if not profile_name.startswith("Custom Strategy") and profile_name != original_profile_name:
            warnings.append(f"Risk profile alias normalized to {profile_name}.")
    return ai_weights, selected_weights, warnings


def _asset_config_by_symbol(settings: Settings) -> dict[str, dict[str, object]]:
    assets: dict[str, dict[str, object]] = {}
    for asset in settings.asset_registry.values():
        if int(asset["chain_id"]) != settings.effective_chain_id:
            continue
        assets[str(asset["symbol"]).upper()] = asset
    return assets


def _decimal_or_zero(value: str | None) -> Decimal:
    try:
        return Decimal(value or "0")
    except Exception:
        return Decimal("0")


def _portfolio_snapshot_from_response(snapshot: PortfolioSnapshotResponse) -> PortfolioSnapshot:
    return PortfolioSnapshot(
        snapshot_id=snapshot.snapshot_id,
        wallet_or_vault=snapshot.portfolio_address or "UNCONFIGURED",
        total_value_usd=float(_decimal_or_zero(snapshot.total_value_usd)),
        balances=[
            AssetBalance(
                asset_symbol=position.asset_symbol,
                balance=float(_decimal_or_zero(position.balance)),
                value_usd=float(_decimal_or_zero(position.value_usd)),
                weight=float(_decimal_or_zero(position.weight)),
                price_usd=float(_decimal_or_zero(position.price_usd)),
            )
            for position in snapshot.positions
        ],
        weights={
            position.asset_symbol: float(_decimal_or_zero(position.weight))
            for position in snapshot.positions
        },
        status_code=snapshot.status_code,
        status_reason=snapshot.status_reason,
        created_at=snapshot.generated_at,
    )


def _risk_snapshot_from_assessment(assessment: RiskAssessmentResponse) -> RiskSnapshot:
    return RiskSnapshot(
        snapshot_id=str(assessment.metadata.get("risk_snapshot_id") or assessment.metadata.get("risk_assessment_id") or assessment.metadata.get("assessment_id") or f"risk_assessment_{int(assessment.generated_at.timestamp())}"),
        total_score=assessment.risk_score,
        risk_band=assessment.risk_band,
        status_code=assessment.status_code,
        status_reason=assessment.status_reason,
        bucket_scores={bucket.bucket: bucket.score for bucket in assessment.buckets},
        prechecks={bucket.bucket: not bucket.hard_veto and bucket.status not in {"blocked", "missing"} for bucket in assessment.buckets},
        notes=list(assessment.notes),
        created_at=assessment.generated_at,
    )


def _symbol_price(
    symbol: str,
    prices: dict[str, Decimal],
    portfolio: PortfolioSnapshotResponse | None = None,
) -> Decimal | None:
    normalized = symbol.upper()
    aliases = {normalized}
    if normalized == "MNT":
        aliases.add("WMNT")
    elif normalized == "WMNT":
        aliases.add("MNT")


    for alias in aliases:
        price = prices.get(alias)
        if price is not None and price > 0:
            return price

    if portfolio is None:
        return None

    for position in portfolio.positions:
        position_symbol = position.asset_symbol.upper()
        position_key = position.asset_key.upper()
        if position_symbol not in aliases and position_key not in aliases:
            continue
        price = _decimal_or_zero(position.price_usd)
        if price > 0:
            return price
        balance = _decimal_or_zero(position.balance)
        value_usd = _decimal_or_zero(position.value_usd)
        if balance > 0 and value_usd > 0:
            return value_usd / balance
    return None


def _best_quote_for_pair(
    quote_service,
    token_in: str,
    token_out: str,
) -> tuple[NormalizedQuoteSnapshot | None, Decimal | None]:
    attempt = quote_service.best_quote_attempt_for_pair(token_in, token_out)
    raw_gas_estimate: Decimal | None = None
    quote: NormalizedQuoteSnapshot | None = None

    if attempt is not None:
        gas_value = attempt.raw_snapshot.raw_payload_json.get("gas_estimate")
        if gas_value is not None:
            try:
                raw_gas_estimate = Decimal(str(gas_value))
            except Exception:
                raw_gas_estimate = None
        if (
            attempt.normalized_snapshot.status_code == DataStatusCode.QUOTE_FRESH.value
            and attempt.normalized_snapshot.amount_out is not None
        ):
            quote = attempt.normalized_snapshot

    if quote is None:
        quote = quote_service.best_quote_for_pair(token_in, token_out)

    return quote, raw_gas_estimate


def _is_dust_swap(
    *,
    amount_in: Decimal,
    token_in_symbol: str,
    prices: dict[str, Decimal],
    portfolio: PortfolioSnapshotResponse | None = None,
) -> bool:
    source_price = _symbol_price(token_in_symbol, prices, portfolio)
    if source_price is None or source_price <= 0:
        return False
    return amount_in * source_price < MIN_SWAP_USD


def _scaled_quote_amount_out_for_swap(swap: PlannedSwap) -> Decimal | None:
    if swap.quote is None or swap.quote.amount_out is None:
        return None
    try:
        quote_amount_in = Decimal(swap.quote.amount_in)
        quote_amount_out = Decimal(swap.quote.amount_out)
    except Exception:
        return None
    if quote_amount_in <= 0 or quote_amount_out <= 0 or swap.amount_in <= 0:
        return None
    return (quote_amount_out * swap.amount_in) / quote_amount_in


def _latest_price_map() -> dict[str, Decimal]:
    prices: dict[str, Decimal] = {}
    try:
        for snapshot in PRICE_SNAPSHOT_STORE.latest().normalized_snapshots:
            if snapshot.price_usd:
                prices[snapshot.asset_symbol.upper()] = Decimal(snapshot.price_usd)
    except Exception:
        prices = {}
    if prices:
        try:
            for snapshot in MarketDataRepository().latest_normalized_prices():
                if snapshot.price_usd and snapshot.asset_symbol.upper() not in prices:
                    prices[snapshot.asset_symbol.upper()] = Decimal(snapshot.price_usd)
        except Exception:
            pass
        return prices
    for snapshot in MarketDataRepository().latest_normalized_prices():
        if snapshot.price_usd:
            prices[snapshot.asset_symbol.upper()] = Decimal(snapshot.price_usd)
    return prices


def _quote_derived_price(symbol: str, prices: dict[str, Decimal]) -> Decimal | None:
    quote_service = get_quote_service()
    for stable_symbol in ("USDY",):
        stable_price = prices.get(stable_symbol.upper())
        if stable_price is None:
            continue
        quote = quote_service.best_quote_for_pair(symbol, stable_symbol)
        if quote is None or quote.amount_out is None:
            continue
        try:
            amount_in = Decimal(quote.amount_in)
            amount_out = Decimal(quote.amount_out)
        except Exception:
            continue
        if amount_in <= 0 or amount_out <= 0:
            continue
        return (amount_out * stable_price) / amount_in
    return None


def _build_target_allocations(
    *,
    deposit_amount: Decimal,
    deposit_asset_symbol: str,
    deposit_price_usd: Decimal,
    target_weights: dict[str, float],
    source: str,
    prices: dict[str, Decimal],
) -> list[AllocationTargetItem]:
    deposit_value_usd = deposit_amount * deposit_price_usd if deposit_price_usd > 0 else None
    allocations: list[AllocationTargetItem] = []
    for asset_symbol, weight in target_weights.items():
        allocation_value_usd = deposit_value_usd * Decimal(str(weight)) if deposit_value_usd is not None else None
        target_price = prices.get(asset_symbol.upper())
        if asset_symbol.upper() == deposit_asset_symbol.upper():
            amount = deposit_amount * Decimal(str(weight))
        elif allocation_value_usd is not None and target_price and target_price > 0:
            amount = allocation_value_usd / target_price
        else:
            amount = Decimal("0")
        allocations.append(
            AllocationTargetItem(
                asset_symbol=asset_symbol,
                percentage=round(weight, 6),
                amount=float(round(amount, 8)),
                value_usd=float(round(allocation_value_usd, 8)) if allocation_value_usd is not None else 0.0,
                source=source,
            )
        )
    return allocations


def _build_planned_swaps(
    *,
    deposit_asset_symbol: str,
    deposit_amount: Decimal,
    target_weights: dict[str, float],
    prices: dict[str, Decimal] | None = None,
) -> list[PlannedSwap]:
    quote_service = get_quote_service()
    prices = prices or _latest_price_map()
    execution_symbol = _execution_input_symbol(deposit_asset_symbol)
    source_price = _symbol_price(execution_symbol, prices)
    if source_price is None:
        source_price = _symbol_price(deposit_asset_symbol, prices)
    swaps: list[PlannedSwap] = []
    for asset_symbol, weight in target_weights.items():
        if asset_symbol.upper() == execution_symbol.upper():
            continue
        amount_in = deposit_amount * Decimal(str(weight))
        if amount_in <= 0:
            continue
        if source_price is not None and amount_in * source_price < MIN_SWAP_USD:
            logger.info(
                "Skipping dust swap %s->%s: source value $%s is below the minimum threshold.",
                execution_symbol,
                asset_symbol,
                f"{(amount_in * source_price):.4f}",
            )
            continue
        quote, raw_gas_estimate = _best_quote_for_pair(quote_service, execution_symbol, asset_symbol)
        swaps.append(
            PlannedSwap(
                target_asset_symbol=asset_symbol,
                amount_in=amount_in,
                token_in_symbol=execution_symbol,
                token_out_symbol=asset_symbol,
                quote=quote,
                gas_estimate=raw_gas_estimate,
                uses_native_value=False,
            )
        )
    return swaps


def _build_rebalance_swaps(
    *,
    rebalance_actions: list[RebalanceAction],
    portfolio: PortfolioSnapshotResponse,
    prices: dict[str, Decimal] | None = None,
) -> list[PlannedSwap]:
    quote_service = get_quote_service()
    prices = prices or _latest_price_map()
    swaps: list[PlannedSwap] = []

    for action in rebalance_actions:
        action_type = action.action.upper()
        if action_type not in {"BUY", "SELL"}:
            continue
        token_in_symbol = action.token_in_symbol or action.asset_symbol
        token_out_symbol = action.token_out_symbol or action.asset_symbol
        if not token_in_symbol or not token_out_symbol:
            continue

        source_price = _symbol_price(token_in_symbol, prices, portfolio)
        target_price = _symbol_price(token_out_symbol, prices, portfolio)

        amount_in: Decimal | None = None
        if action_type == "SELL":
            amount_in = Decimal(str(action.amount))
        elif source_price is not None and target_price is not None and source_price > 0:
            amount_in = Decimal(str(action.amount)) * target_price / source_price

        if amount_in is None or amount_in <= 0:
            logger.info(
                "Skipping rebalance swap %s->%s because the input amount could not be resolved.",
                token_in_symbol,
                token_out_symbol,
            )
            continue

        if source_price is not None and amount_in * source_price < MIN_SWAP_USD:
            logger.info(
                "Skipping dust rebalance swap %s->%s: source value $%s is below the minimum threshold.",
                token_in_symbol,
                token_out_symbol,
                f"{(amount_in * source_price):.4f}",
            )
            continue

        quote, raw_gas_estimate = _best_quote_for_pair(quote_service, token_in_symbol, token_out_symbol)
        swaps.append(
            PlannedSwap(
                target_asset_symbol=token_out_symbol,
                amount_in=amount_in,
                token_in_symbol=token_in_symbol,
                token_out_symbol=token_out_symbol,
                quote=quote,
                gas_estimate=raw_gas_estimate,
                uses_native_value=False,
            )
        )

    return swaps


def _build_guard_checks(
    *,
    settings: Settings,
    deposit_asset_symbol: str,
    selected_weights: dict[str, float],
    prices: dict[str, Decimal],
    swaps: list[PlannedSwap],
    risk: RiskAssessmentResponse,
) -> tuple[list[RiskValidationCheck], list[str]]:
    blockers: list[str] = []
    strict_market_checks = settings.runtime_mode == RuntimeMode.LIVE or settings.require_live_prices
    fresh_price_symbols = {deposit_asset_symbol.upper(), *[symbol.upper() for symbol in selected_weights.keys()]}
    usdy_oracle = get_ondo_usdy_oracle_adapter().read().status
    price_deviation_threshold, concentration_cap, slippage_threshold_default, slippage_threshold_meth = _guard_thresholds(settings)

    oracle_ok = usdy_oracle.status in {"ok", "live", "live_reference"} if "USDY" in fresh_price_symbols else True
    quote_ok = all(swap.quote and swap.quote.amount_out is not None for swap in swaps) if swaps else True
    quote_freshness_pass = True
    quote_freshness_message = "No swap quotes require freshness checks."
    quote_freshness_observed = "n/a"
    quote_freshness_threshold = f"<={int(settings.dex_quote_fresh_limit_seconds)}s"
    for swap in swaps:
        if swap.quote is None or swap.quote.amount_out is None:
            quote_freshness_pass = False
            quote_freshness_message = f"Missing live quote for {swap.token_in_symbol}->{swap.token_out_symbol}."
            quote_freshness_observed = "missing"
            break
        quote_age = age_seconds(swap.quote.sample_timestamp, utc_now())
        quote_freshness_observed = str(quote_age) if quote_age is not None else "missing"
        if quote_age is None:
            quote_freshness_pass = False
            quote_freshness_message = f"Quote freshness timestamp is missing for {swap.token_in_symbol}->{swap.token_out_symbol}."
            break
        if quote_age > settings.dex_quote_fresh_limit_seconds or swap.quote.status_code == DataStatusCode.QUOTE_STALE.value:
            quote_freshness_pass = False
            quote_freshness_message = f"Quote for {swap.token_in_symbol}->{swap.token_out_symbol} is stale at {quote_age} seconds old."
            break
        quote_freshness_message = f"Quote for {swap.token_in_symbol}->{swap.token_out_symbol} is {quote_age} seconds old and within freshness limits."

    deviation_pass = True
    deviation_message = "No swap quotes require deviation checks."
    for swap in swaps:
        scaled_quote_amount_out = _scaled_quote_amount_out_for_swap(swap)
        if scaled_quote_amount_out is None:
            deviation_pass = False
            deviation_message = f"Missing live quote for {swap.token_in_symbol}->{swap.token_out_symbol}."
            break
        price_in = prices.get(swap.token_in_symbol.upper())
        price_out = prices.get(swap.token_out_symbol.upper())
        if not price_in or not price_out:
            deviation_pass = False
            deviation_message = f"Missing spot prices for {swap.token_in_symbol}/{swap.token_out_symbol}."
            break
        quote_ratio = swap.amount_in / scaled_quote_amount_out
        expected_ratio = price_out / price_in
        deviation = abs((quote_ratio - expected_ratio) / expected_ratio) if expected_ratio > 0 else Decimal("1")
        if deviation > price_deviation_threshold:
            deviation_pass = False
            deviation_message = (
                f"Quote deviation for {swap.token_in_symbol}->{swap.token_out_symbol} exceeds "
                f"{int(price_deviation_threshold * Decimal('100'))}%."
            )
            break
        deviation_message = f"Quote prices remain within {int(price_deviation_threshold * Decimal('100'))}% of current spot-derived expectations."

    slippage_pass = True
    slippage_message = "No swap quotes require slippage checks."
    for swap in swaps:
        if not swap.quote or not swap.quote.estimated_slippage_bps:
            slippage_pass = False
            slippage_message = f"Missing slippage estimate for {swap.token_in_symbol}->{swap.token_out_symbol}."
            break
        slippage_bps = Decimal(swap.quote.estimated_slippage_bps)
        threshold = slippage_threshold_meth if "METH" in {swap.token_in_symbol.upper(), swap.token_out_symbol.upper()} else slippage_threshold_default
        if slippage_bps > threshold:
            slippage_pass = False
            slippage_message = f"Estimated slippage for {swap.token_in_symbol}->{swap.token_out_symbol} exceeds the configured threshold."
            break
        slippage_message = "Estimated slippage remains within configured thresholds."

    concentration_pass = max(selected_weights.values()) <= concentration_cap if selected_weights else True
    if not concentration_pass:
        blockers.append(f"One target allocation exceeds the {int(concentration_cap * Decimal('100'))}% concentration cap.")
    if not quote_freshness_pass:
        blockers.append(quote_freshness_message)

    pause_ok = True
    pause_message = "Pause guardian is not configured; runtime remains advisory."
    if settings.pause_guardian_address:
        try:
            pause_state = get_pause_guardian_state(
                rpc_url=settings.effective_http_rpc_url,
                foundry_out_dir=settings.foundry_out_dir,
                address=settings.pause_guardian_address,
            )
            pause_ok = not bool(pause_state.get("paused"))
            pause_message = "Pause guardian is clear." if pause_ok else "Pause guardian is active."
        except Exception as exc:
            pause_ok = settings.runtime_mode != RuntimeMode.LIVE
            pause_message = f"Pause guardian read failed: {exc}"

    veto_ok = settings.runtime_mode != RuntimeMode.LIVE or bool(settings.trade_approval_manager_address)
    veto_message = (
        "Trade approval manager address is configured; operator approval is still required."
        if settings.trade_approval_manager_address
        else "Trade approval manager address is not configured; live execution remains blocked."
    )

    approval_freshness_ok = False
    approval_message = "Approval freshness is evaluated after the wallet submits the ERC-20 approval transaction."

    checks = [
        RiskValidationCheck(
            code="quote_freshness",
            label="Quote freshness",
            passed=quote_freshness_pass,
            blocking=strict_market_checks,
            message=quote_freshness_message,
            observed_value=quote_freshness_observed,
            threshold_value=quote_freshness_threshold,
            data_sources_used=["quotes"],
        ),
        RiskValidationCheck(
            code="oracle_freshness",
            label="Oracle freshness",
            passed=oracle_ok,
            blocking=strict_market_checks,
            message="USDY oracle is fresh enough for guarded execution." if oracle_ok else "USDY oracle freshness check failed.",
            observed_value=usdy_oracle.status if "USDY" in fresh_price_symbols else "not_required",
            threshold_value="status=ok",
            data_sources_used=["ondo_redemption_oracle"] if "USDY" in fresh_price_symbols else [],
        ),
        RiskValidationCheck(
            code="price_deviation",
            label="Price deviation",
            passed=deviation_pass,
            blocking=strict_market_checks,
            message=deviation_message,
            threshold_value=f"<={int(price_deviation_threshold * Decimal('100'))}%",
            data_sources_used=["quotes", "normalized_prices"],
        ),
        RiskValidationCheck(
            code="liquidity_check",
            label="Liquidity check",
            passed=quote_ok,
            blocking=strict_market_checks,
            message="Liquidity inferred from successful live quote responses." if quote_ok else "Live quote liquidity inference failed for one or more swaps.",
            threshold_value="live_quote_required",
            data_sources_used=["quotes"],
        ),
        RiskValidationCheck(
            code="slippage_limit",
            label="Slippage limit",
            passed=slippage_pass,
            blocking=strict_market_checks,
            message=slippage_message,
            data_sources_used=["quotes"],
        ),
        RiskValidationCheck(
            code="concentration_risk",
            label="Concentration risk",
            passed=concentration_pass,
            blocking=strict_market_checks,
            message=f"Target allocations stay within the {int(concentration_cap * Decimal('100'))}% concentration cap." if concentration_pass else f"One target allocation exceeds the {int(concentration_cap * Decimal('100'))}% concentration cap.",
            threshold_value=f"<={int(concentration_cap * Decimal('100'))}%",
            data_sources_used=["allocation_profile"],
        ),
        RiskValidationCheck(
            code="approval_freshness",
            label="Approval freshness",
            passed=approval_freshness_ok,
            blocking=False,
            message=approval_message,
            threshold_value="<20 blocks",
            data_sources_used=["wallet_approval"],
        ),
        RiskValidationCheck(
            code="pause_status",
            label="Pause status",
            passed=pause_ok,
            blocking=True,
            message=pause_message,
            data_sources_used=["pause_guardian"] if settings.pause_guardian_address else [],
        ),
        RiskValidationCheck(
            code="veto_check",
            label="Veto check",
            passed=veto_ok,
            blocking=settings.runtime_mode == RuntimeMode.LIVE,
            message=veto_message,
            data_sources_used=["trade_approval_manager"] if settings.trade_approval_manager_address else [],
        ),
    ]

    for check in checks:
        if check.blocking and not check.passed:
            blockers.append(check.message)
    if risk.hard_veto_status == "active":
        blockers.append("Risk engine returned a hard veto for the current portfolio state.")
    return checks, blockers


def _encode_trade_proposal(
    *,
    settings: Settings,
    wallet_address: str | None,
    swap: PlannedSwap,
) -> tuple[TradeProposal, LinkedProposalSummary, str]:
    quoted_amount_out = _scaled_quote_amount_out_for_swap(swap)
    if quoted_amount_out is None:
        raise HTTPException(status_code=400, detail=f"Execution route is unavailable for {swap.token_in_symbol}->{swap.token_out_symbol}.")

    assets = _asset_config_by_symbol(settings)
    token_in_asset = assets.get(swap.token_in_symbol.upper())
    token_out_asset = assets.get(swap.token_out_symbol.upper())
    if not token_in_asset or not token_out_asset:
        raise HTTPException(status_code=400, detail=f"Asset configuration missing for {swap.token_in_symbol}->{swap.token_out_symbol}.")

    token_in = str(token_in_asset["address"])
    token_out = str(token_out_asset["address"])
    decimals_in = int(token_in_asset.get("decimals") or 18)
    decimals_out = int(token_out_asset.get("decimals") or 18)
    max_amount_in = int(swap.amount_in * Decimal(10 ** decimals_in))
    if settings.target_chain == TargetChain.MANTLE_SEPOLIA:
        min_amount_out = int((quoted_amount_out * Decimal("0.50")) * Decimal(10 ** decimals_out))
    else:
        min_amount_out = int((quoted_amount_out * Decimal("0.99")) * Decimal(10 ** decimals_out))

    if swap.quote.protocol == "AIYIELD":
        router_address = settings.effective_aiyield_swap_router_address
    else:
        router_address = settings.effective_agni_swap_router_address
    if not router_address:
        raise HTTPException(status_code=400, detail=f"{swap.quote.protocol} swap router address is not configured.")

    selector = "0xa64e3dd7" if swap.quote.protocol == "AIYIELD" else "0x414bf389"
    recipient = settings.executor_vault_address
    if not recipient:
        raise HTTPException(status_code=400, detail="Executor vault address is not configured for trade execution.")
    proposal_scope = wallet_address or "UNCONFIGURED"

    now = int(time.time())
    deadline = now + 900
    proposal_expiry = now + 7200
    nonce = int(uuid.uuid4().int & 0xFFFFFFFF)
    if swap.quote.protocol == "AIYIELD":
        params = (
            Web3.to_checksum_address(token_in),
            Web3.to_checksum_address(token_out),
            Web3.to_checksum_address(recipient),
            Web3.to_checksum_address(recipient),
            max_amount_in,
            min_amount_out,
        )
        encoded_struct = encode(
            ["address", "address", "address", "address", "uint256", "uint256"],
            list(params),
        )
    else:
        fee_tier = int(swap.quote.route_id.split(":")[-1]) if ":" in swap.quote.route_id and swap.quote.route_id.split(":")[-1].isdigit() else 500
        params = (
            Web3.to_checksum_address(token_in),
            Web3.to_checksum_address(token_out),
            fee_tier,
            Web3.to_checksum_address(recipient),
            deadline,
            max_amount_in,
            min_amount_out,
            0,
        )
        encoded_struct = encode(["(address,address,uint24,address,uint256,uint256,uint256,uint160)"], [params])
    calldata = Web3.to_bytes(hexstr=selector) + encoded_struct
    calldata_hash = Web3.to_hex(keccak(calldata))

    proposal_id = Web3.to_hex(keccak(f"proposal_{uuid.uuid4()}_{now}".encode("utf-8")))
    plan_hash = Web3.to_hex(keccak(f"plan_{swap.token_in_symbol}_{swap.token_out_symbol}_{swap.amount_in}".encode("utf-8")))
    payload = ExecutionPayloadSchema(
        proposalId=proposal_id,
        planHash=plan_hash,
        router=Web3.to_checksum_address(router_address),
        selector=selector,
        calldataHash=calldata_hash,
        tokenIn=Web3.to_checksum_address(token_in),
        tokenOut=Web3.to_checksum_address(token_out),
        recipient=Web3.to_checksum_address(recipient),
        maxAmountIn=max_amount_in,
        minAmountOut=min_amount_out,
        nativeValue=max_amount_in if swap.uses_native_value else 0,
        deadline=deadline,
        proposalExpiry=proposal_expiry,
        nonce=nonce,
    )
    t_now = utc_now()
    proposal = TradeProposal(
        proposal_id=proposal_id,
        plan_hash=plan_hash,
        wallet_or_vault=proposal_scope,
        payload=payload,
        status_code=ProposalStatusCode.PROPOSAL_PENDING_APPROVAL.value,
        risk_snapshot_id=None,
        created_at=t_now,
        updated_at=t_now,
    )
    summary = LinkedProposalSummary(
        proposal_id=proposal_id,
        asset_symbol=swap.target_asset_symbol,
        action="BUY",
        token_in_symbol=swap.token_in_symbol,
        token_out_symbol=swap.token_out_symbol,
        amount=float(round(swap.amount_in, 8)),
        status_code=proposal.status_code,
    )
    return proposal, summary, Web3.to_hex(calldata)


def build_investment_plan(
    *,
    settings: Settings,
    request: InvestmentPlanRequest,
    portfolio: PortfolioSnapshotResponse,
    risk: RiskAssessmentResponse,
    actual_portfolio: PortfolioSnapshotResponse | None = None,
) -> tuple[InvestmentPlanResponse, list[tuple[TradeProposal, str]]]:
    normalized_profile = resolve_requested_profile_name(request.risk_profile, settings.target_chain.value)
    deposit_amount = Decimal(str(request.deposit_amount))
    if deposit_amount <= 0:
        raise HTTPException(status_code=400, detail="Deposit amount must be greater than zero.")

    assets = _asset_config_by_symbol(settings)
    execution_deposit_symbol = _execution_input_symbol(request.deposit_asset_symbol)
    deposit_asset = assets.get(execution_deposit_symbol.upper())
    if request.deposit_asset_symbol.upper() == "MNT" and not settings.native_mnt_enabled:
        raise HTTPException(
            status_code=400,
            detail="Native MNT deposit flow is disabled. Set NATIVE_MNT_ENABLED=true and configure SEPOLIA_WMNT_ADDRESS.",
        )
    if deposit_asset is None or not deposit_asset.get("address"):
        raise HTTPException(
            status_code=400,
            detail=f"Deposit asset {request.deposit_asset_symbol} is not configured on {settings.target_chain.value}.",
        )

    prices = _latest_price_map()
    deposit_price = prices.get(request.deposit_asset_symbol.upper()) or prices.get(execution_deposit_symbol.upper())
    if deposit_price is None and execution_deposit_symbol.upper() == "WMNT":
        deposit_price = _quote_derived_price("WMNT", prices)
        if deposit_price is not None:
            prices["WMNT"] = deposit_price
            prices["MNT"] = deposit_price

    ai_weights, selected_weights, warnings = _normalize_weights(request, settings)
    if deposit_price is None:
        warnings.append(
            f"Deposit valuation for {request.deposit_asset_symbol} is unavailable, so only fetchable allocation data will be returned."
        )
    ai_allocations = _build_target_allocations(
        deposit_amount=deposit_amount,
        deposit_asset_symbol=request.deposit_asset_symbol,
        deposit_price_usd=deposit_price or Decimal("0"),
        target_weights=ai_weights,
        source="ai",
        prices=prices,
    )
    selected_allocations = _build_target_allocations(
        deposit_amount=deposit_amount,
        deposit_asset_symbol=request.deposit_asset_symbol,
        deposit_price_usd=deposit_price or Decimal("0"),
        target_weights=selected_weights,
        source="selected",
        prices=prices,
    )
    ai_allocations = [
        item
        for item in ai_allocations
        if item.asset_symbol.upper() == request.deposit_asset_symbol.upper() or item.value_usd > 0
    ]
    selected_allocations = [
        item
        for item in selected_allocations
        if item.asset_symbol.upper() == request.deposit_asset_symbol.upper() or item.value_usd > 0
    ]

    missing_assets = [
        allocation.asset_symbol
        for allocation in selected_allocations
        if allocation.asset_symbol.upper() != request.deposit_asset_symbol.upper()
        and allocation.percentage > 0
        and allocation.asset_symbol.upper() not in assets
    ]
    blockers: list[str] = []
    if missing_assets:
        blockers.append(f"Target assets are not configured on {settings.target_chain.value}: {', '.join(missing_assets)}.")

    rebalance_swaps: list[PlannedSwap] = []
    if settings.target_chain == TargetChain.MANTLE_SEPOLIA and risk.risk_band == "RISK_REBALANCE_ONLY":
        warnings.append("Testnet advisory: RISK_REBALANCE_ONLY is advisory on Mantle Sepolia and does not block rebalance execution.")
    planning_portfolio = actual_portfolio or portfolio
    held_symbols = {
        position.asset_symbol.upper()
        for position in planning_portfolio.positions
        if _decimal_or_zero(position.balance) > 0 and position.asset_symbol.upper() != request.deposit_asset_symbol.upper()
    }
    if held_symbols:
        rebalance_portfolio = _portfolio_snapshot_from_response(planning_portfolio)
        rebalance_decision, rebalance_actions = compute_rebalance(
            rebalance_portfolio,
            _risk_snapshot_from_assessment(risk),
            normalized_profile,
            target_weights_override=selected_weights,
        )
        if rebalance_actions and rebalance_decision.recommended_action != "PAUSE":
            rebalance_swaps = _build_rebalance_swaps(
                rebalance_actions=rebalance_actions,
                portfolio=planning_portfolio,
                prices=prices,
            )
            if rebalance_swaps:
                warnings.append("Rebalance proposal legs were built from current wallet holdings.")

    swaps = rebalance_swaps or _build_planned_swaps(
        deposit_asset_symbol=request.deposit_asset_symbol,
        deposit_amount=deposit_amount,
        target_weights=selected_weights,
        prices=prices,
    )

    # Dynamic gas/net-benefit filtering for swaps
    filtered_swaps: list[PlannedSwap] = []
    gas_price_wei = Decimal("50000000")  # fallback to 0.05 Gwei
    try:
        w3 = Web3(Web3.HTTPProvider(settings.effective_http_rpc_url))
        gas_price_wei = Decimal(str(w3.eth.gas_price))
    except Exception as exc:
        logger.warning("Failed to fetch live gas price from RPC, using fallback: %s", exc)

    mnt_price = prices.get("MNT") or prices.get("WMNT") or Decimal("0.80")
    min_benefit = Decimal(str(settings.rebalance_min_benefit_usd))

    for swap in swaps:
        source_price = _symbol_price(swap.token_in_symbol, prices, planning_portfolio)
        if source_price is None:
            source_price = prices.get(swap.token_in_symbol.upper(), Decimal("0"))
        
        swap_val_usd = swap.amount_in * source_price
        
        gas_cost_usd = Decimal("0")
        if swap.gas_estimate is not None:
            gas_cost_mnt = (swap.gas_estimate * gas_price_wei) / Decimal("1000000000000000000")
            gas_cost_usd = gas_cost_mnt * mnt_price
            
        net_benefit_usd = swap_val_usd - gas_cost_usd
        
        if net_benefit_usd < min_benefit:
            logger.info(
                "Skipping swap %s->%s: swap value $%.2f minus gas cost $%.4f yields net benefit $%.2f, which is below the minimum threshold $%.2f",
                swap.token_in_symbol,
                swap.token_out_symbol,
                swap_val_usd,
                gas_cost_usd,
                net_benefit_usd,
                min_benefit
            )
            continue
        filtered_swaps.append(swap)
        
    swaps = filtered_swaps
    checks, guard_blockers = _build_guard_checks(
        settings=settings,
        deposit_asset_symbol=request.deposit_asset_symbol,
        selected_weights=selected_weights,
        prices=prices,
        swaps=swaps,
        risk=risk,
    )
    blockers.extend(guard_blockers)

    proposal_pairs: list[tuple[TradeProposal, str]] = []
    linked_proposals: list[LinkedProposalSummary] = []
    estimated_gas = Decimal("0")
    for swap in swaps:
        if swap.quote is None or swap.quote.amount_out is None:
            continue
        proposal, summary, calldata = _encode_trade_proposal(
            settings=settings,
            wallet_address=request.wallet_address,
            swap=swap,
        )
        proposal_pairs.append((proposal, calldata))
        linked_proposals.append(summary)
        if swap.gas_estimate is not None:
            estimated_gas += swap.gas_estimate

    transaction_steps: list[TransactionStep] = []
    step_index = 1
    ai_managed_execution = settings.ai_decision_maker_enabled
    # Bug D fix: emit the wrap step whenever native MNT is being deposited,
    # regardless of whether swap legs were built. Previously the condition
    # required swaps to exist with token_in_symbol=="WMNT", which meant an
    # empty-swaps scenario (no quotes yet) produced no wrap step and the
    # frontend's executeNativeWrapIfNeeded() silently skipped the wrap.
    wrap_native_mnt = (
        request.deposit_asset_symbol.upper() == "MNT"
        and settings.native_mnt_enabled
        and bool(settings.sepolia_wmnt_address)
        and not rebalance_swaps
    )
    if wrap_native_mnt:
        transaction_steps.append(
            TransactionStep(
                step_index=step_index,
                step_type="wrap",
                description="Wrap native MNT into WMNT in the connected wallet before approvals and swaps.",
                asset_symbol="WMNT",
                amount=str(round(request.deposit_amount, 8)),
                requires_user_action=not ai_managed_execution,
            )
        )
        step_index += 1
    for swap in swaps:
        transaction_steps.append(
            TransactionStep(
                step_index=step_index,
                step_type="approve",
                description=f"Approve {swap.token_in_symbol} for router spend before executing {swap.token_in_symbol}->{swap.token_out_symbol}.",
                asset_symbol=swap.token_in_symbol,
                amount=str(round(swap.amount_in, 8)),
                requires_user_action=not ai_managed_execution,
            )
        )
        step_index += 1
        matching_link = next((proposal for proposal in linked_proposals if proposal.token_out_symbol == swap.token_out_symbol), None)
        transaction_steps.append(
            TransactionStep(
                step_index=step_index,
                step_type="swap",
                description=f"Swap {swap.token_in_symbol} into {swap.token_out_symbol} through the guarded execution route.",
                asset_symbol=swap.token_out_symbol,
                amount=str(round(swap.amount_in, 8)),
                proposal_id=matching_link.proposal_id if matching_link else None,
                requires_user_action=not ai_managed_execution,
            )
        )
        step_index += 1
    for allocation in selected_allocations:
        if allocation.asset_symbol.upper() == request.deposit_asset_symbol.upper() and allocation.amount > 0:
            transaction_steps.append(
                TransactionStep(
                    step_index=step_index,
                    step_type="hold",
                    description=f"Retain {allocation.amount:.4f} {allocation.asset_symbol} as the reserve or already-aligned sleeve.",
                    asset_symbol=allocation.asset_symbol,
                    amount=str(allocation.amount),
                    requires_user_action=False,
                )
            )
            step_index += 1

    execution_required = bool(linked_proposals)
    execution_ready = bool(linked_proposals) and (deposit_price is not None or bool(rebalance_swaps))
    approval_enabled = not blockers and execution_ready
    if blockers:
        response_status = "degraded"
        response_status_code = ExecutionStatusCode.EXECUTION_BLOCKED.value
        response_status_reason = "Investment plan is blocked until the listed issues are resolved."
    elif execution_ready:
        response_status = "ok"
        response_status_code = ExecutionStatusCode.EXECUTION_READY.value
        if settings.ai_decision_maker_enabled:
            response_status_reason = "AI created a trade proposal from the passed recommendation. Human approval is required before execution."
        elif linked_proposals:
            response_status_reason = "Trade proposal created. Human approval is required before execution."
        elif rebalance_swaps:
            response_status_reason = "Rebalance recommendation is ready, but no approval-ready proposal could be created."
        else:
            response_status_reason = "Investment recommendation is ready, but no approval-ready proposal could be created."
    else:
        response_status = "ok"
        response_status_code = ExecutionStatusCode.EXECUTION_SKIPPED.value
        response_status_reason = (
            "No swaps are required because the requested allocation is already aligned."
            if not execution_required
            else "Allocation is available, but execution is deferred until a normalized deposit price or rebalance-backed quote path is available."
        )

    response = InvestmentPlanResponse(
        status=response_status,
        status_code=response_status_code,
        status_label=response_status_code,
        status_reason=response_status_reason,
        generated_at=utc_now(),
        plan_id=f"0x{keccak(f'investment_plan_{uuid.uuid4()}'.encode('utf-8')).hex()}",
        deposit_asset_symbol=request.deposit_asset_symbol,
        deposit_amount=request.deposit_amount,
        risk_profile=normalized_profile,
        allocation_mode=request.allocation_mode,
        ai_target_allocations=ai_allocations,
        selected_target_allocations=selected_allocations,
        warning_messages=warnings,
        approval_enabled=approval_enabled,
        approval_blockers=blockers,
        guard_checks=checks,
        estimated_gas_native=str(estimated_gas) if estimated_gas > 0 else None,
        transaction_steps=transaction_steps,
        linked_proposals=linked_proposals,
        risk_assessment=risk.model_dump(mode="json"),
        metadata={
            "portfolio_snapshot_id": portfolio.snapshot_id,
            "portfolio_address": portfolio.portfolio_address,
            "total_portfolio_value_usd": portfolio.total_value_usd,
            "actual_portfolio_snapshot_id": actual_portfolio.snapshot_id if actual_portfolio is not None else None,
            "swap_path": "rebalance" if rebalance_swaps else "deposit",
            "runtime_mode": settings.runtime_mode.value,
            "target_chain": settings.target_chain.value,
            "execution_required": execution_required,
            "human_approval_required": bool(linked_proposals),
            "proposal_creation_mode": "ai_auto" if settings.ai_decision_maker_enabled else "manual",
        },
    )
    for proposal in linked_proposals:
        PROPOSAL_DETAIL_CACHE[proposal.proposal_id] = response
    return response, proposal_pairs


def get_cached_plan_for_proposal(proposal_id: str) -> InvestmentPlanResponse | None:
    return PROPOSAL_DETAIL_CACHE.get(proposal_id)
