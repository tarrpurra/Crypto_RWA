from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import uuid4

from services.agent.app.schemas.market_data import NormalizedPriceSnapshot
from services.agent.app.schemas.portfolio import (
    AssetBalance,
    BalanceObservation,
    PortfolioSnapshot,
    PortfolioPosition,
    PortfolioSnapshotResponse,
)
from services.agent.app.core.settings import get_settings
from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.portfolio_repository import PortfolioSnapshotRepository


logger = logging.getLogger("services.agent.market_data.balances")

FRESH_PRICE_CODES = {"DATA_FRESH", "ORACLE_FRESH", "QUOTE_FRESH"}
SIMULATION_PRICE_METHODS = {"sepolia_stable_fallback", "sepolia_mock_fixed_price"}
ERC20_BALANCE_ABI = [
    {
        "constant": True,
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    }
]


def _float_or_zero(value: str | float | int | None) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _missing_internal_snapshot(reason: str, wallet_or_vault: str = "UNCONFIGURED") -> PortfolioSnapshot:
    return PortfolioSnapshot(
        snapshot_id=f"portfolio_missing_{int(utc_now().timestamp())}",
        wallet_or_vault=wallet_or_vault,
        total_value_usd=0.0,
        balances=[],
        weights={},
        status_code="DATA_MISSING",
        status_reason=reason,
        created_at=utc_now(),
    )


def internal_snapshot_from_response(snapshot: PortfolioSnapshotResponse) -> PortfolioSnapshot:
    if snapshot.total_value_usd is None or snapshot.status_code != "DATA_FRESH":
        return _missing_internal_snapshot(
            snapshot.status_reason,
            wallet_or_vault=snapshot.portfolio_address or "UNCONFIGURED",
        )

    balances: list[AssetBalance] = []
    weights: dict[str, float] = {}
    for position in snapshot.positions:
        value_usd = _float_or_zero(position.value_usd)
        weight = _float_or_zero(position.weight)
        balance = _float_or_zero(position.balance)
        balances.append(
            AssetBalance(
                asset_symbol=position.asset_symbol,
                balance=balance,
                value_usd=value_usd,
                weight=weight,
            )
        )
        weights[position.asset_symbol] = weight

    return PortfolioSnapshot(
        snapshot_id=snapshot.snapshot_id,
        wallet_or_vault=snapshot.portfolio_address or "UNCONFIGURED",
        total_value_usd=_float_or_zero(snapshot.total_value_usd),
        balances=balances,
        weights=weights,
        status_code=snapshot.status_code,
        status_reason=snapshot.status_reason,
        created_at=snapshot.generated_at,
    )


def get_default_mock_snapshot() -> PortfolioSnapshot:
    return _missing_internal_snapshot("Mock portfolio fallback is disabled; no portfolio snapshot is available.")


def fetch_portfolio_snapshot(wallet_address: str | None = None) -> PortfolioSnapshot:
    settings = get_settings()
    portfolio_address = wallet_address or settings.portfolio_wallet_address or settings.executor_vault_address
    try:
        snapshot = PortfolioSnapshotRepository().latest_snapshot(portfolio_address=portfolio_address)
    except Exception as exc:
        return _missing_internal_snapshot(
            f"Portfolio snapshot repository unavailable: {exc}",
            wallet_or_vault=portfolio_address or "UNCONFIGURED",
        )
    if snapshot is None:
        return _missing_internal_snapshot(
            "No persisted portfolio snapshot is available for allocation or decisioning.",
            wallet_or_vault=portfolio_address or "UNCONFIGURED",
        )
    return internal_snapshot_from_response(snapshot)


def _decimal_or_none(value: str | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(value)
    except (InvalidOperation, ValueError):
        return None


def _format_decimal(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value.normalize(), "f")


def _scaled_token_amount(raw_balance: int, decimals: int) -> str:
    value = Decimal(raw_balance) / (Decimal(10) ** Decimal(decimals))
    return _format_decimal(value) or "0"


def _price_is_usable(price: NormalizedPriceSnapshot | None, price_value: Decimal | None) -> bool:
    if price is None or price_value is None:
        return False
    if price.status_code in FRESH_PRICE_CODES:
        return True
    return price.freshness_status == "simulation_only" and price.derivation_method in SIMULATION_PRICE_METHODS


class Erc20BalanceReader:
    def __init__(self, rpc_url: str, timeout: int = 10) -> None:
        from web3 import HTTPProvider, Web3

        self.web3 = Web3(HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))

    def read_configured_balances(
        self,
        *,
        portfolio_address: str,
        asset_registry: dict[str, dict[str, Any]],
        chain_id: int,
    ) -> list[BalanceObservation]:
        observed_at = utc_now()
        balances: list[BalanceObservation] = []
        for asset in asset_registry.values():
            if int(asset["chain_id"]) != chain_id:
                continue
            if not asset.get("verified") or not asset.get("address"):
                continue
            balances.append(self._read_asset_balance(portfolio_address, asset, observed_at))
        return balances

    def _read_asset_balance(self, portfolio_address: str, asset: dict[str, Any], observed_at) -> BalanceObservation:
        asset_address = str(asset["address"])
        decimals = int(asset.get("decimals") or 18)
        try:
            contract = self.web3.eth.contract(
                address=self.web3.to_checksum_address(asset_address),
                abi=ERC20_BALANCE_ABI,
            )
            raw_balance = int(contract.functions.balanceOf(self.web3.to_checksum_address(portfolio_address)).call())
            return BalanceObservation(
                asset_key=str(asset["asset_key"]),
                asset_symbol=str(asset["symbol"]),
                asset_address=asset_address,
                chain_id=int(asset["chain_id"]),
                balance=_scaled_token_amount(raw_balance, decimals),
                decimals=decimals,
                observed_timestamp=observed_at,
                balance_source="erc20_balanceOf",
                status="ok",
                status_code="DATA_FRESH",
                status_reason="ERC-20 balance read succeeded.",
                metadata={"raw_balance": str(raw_balance)},
            )
        except Exception as exc:
            return BalanceObservation(
                asset_key=str(asset["asset_key"]),
                asset_symbol=str(asset["symbol"]),
                asset_address=asset_address,
                chain_id=int(asset["chain_id"]),
                balance=None,
                decimals=decimals,
                observed_timestamp=observed_at,
                balance_source="erc20_balanceOf",
                status="degraded",
                status_code="DATA_MISSING",
                status_reason=f"ERC-20 balance read failed: {exc}",
            )


class PortfolioSnapshotEngine:
    def build_snapshot(
        self,
        *,
        balances: list[BalanceObservation],
        prices: list[NormalizedPriceSnapshot],
        portfolio_address: str | None,
        chain_id: int,
        base_currency: str = "USD",
        target_weights: dict[str, str] | None = None,
        missing_reason: str | None = None,
    ) -> PortfolioSnapshotResponse:
        generated_at = utc_now()
        if not balances:
            reason = missing_reason or "No portfolio balance observations are available."
            return PortfolioSnapshotResponse(
                snapshot_id=str(uuid4()),
                generated_at=generated_at,
                portfolio_address=portfolio_address,
                chain_id=chain_id,
                base_currency=base_currency,
                total_value_usd=None,
                positions=[],
                data_sources_used=[],
                status="degraded",
                status_code="DATA_MISSING",
                status_label="DATA_MISSING",
                status_reason=reason,
                metadata={"balance_count": 0},
            )

        price_by_key = {price.asset_key.lower(): price for price in prices}
        price_by_symbol = {price.asset_symbol.lower(): price for price in prices}
        positions: list[PortfolioPosition] = []
        total_value = Decimal("0")
        all_valued = True
        data_sources: set[str] = set()
        parsed_targets = self._parse_target_weights(target_weights or {})

        for balance in balances:
            position, value = self._position_from_balance(balance, price_by_key, price_by_symbol)
            positions.append(position)
            data_sources.update(position.data_sources_used)
            if value is None:
                all_valued = False
                continue
            total_value += value

        total_value_output = total_value if all_valued else None
        if total_value_output is not None and total_value_output > 0:
            positions = [self._with_weight_and_drift(position, total_value_output, parsed_targets) for position in positions]
        elif total_value_output is not None:
            positions = [self._with_weight_and_drift(position, Decimal("0"), parsed_targets) for position in positions]
        else:
            positions = [self._with_weight_and_drift(position, None, parsed_targets) for position in positions]

        status_code = "DATA_FRESH" if total_value_output is not None else "DATA_PARTIAL"
        status = "ok" if status_code == "DATA_FRESH" else "degraded"
        status_reason = "Portfolio snapshot valued successfully."
        if status_code == "DATA_PARTIAL":
            status_reason = "Portfolio balances are present, but one or more positions cannot be valued."

        return PortfolioSnapshotResponse(
            snapshot_id=str(uuid4()),
            generated_at=generated_at,
            portfolio_address=portfolio_address,
            chain_id=chain_id,
            base_currency=base_currency,
            total_value_usd=_format_decimal(total_value_output),
            positions=positions,
            data_sources_used=sorted(data_sources),
            status=status,
            status_code=status_code,
            status_label=status_code,
            status_reason=status_reason,
            metadata={
                "balance_count": len(balances),
                "all_positions_valued": all_valued,
                "target_weights_configured": bool(parsed_targets),
                "route_depth_status": "pending_phase_1b_quote_validation",
            },
        )

    def _with_weight_and_drift(
        self,
        position: PortfolioPosition,
        total_value: Decimal | None,
        target_weights: dict[str, Decimal],
    ) -> PortfolioPosition:
        value = _decimal_or_none(position.value_usd)
        target = target_weights.get(position.asset_key.lower()) or target_weights.get(position.asset_symbol.lower())
        weight = None
        if total_value is not None and total_value > 0 and value is not None:
            weight = value / total_value
        elif total_value is not None and value is not None:
            weight = Decimal("0")

        drift = weight - target if weight is not None and target is not None else None
        drift_status = "not_configured"
        if target is not None and weight is None:
            drift_status = "unvalued"
        elif drift is not None:
            drift_status = "within_target" if abs(drift) <= Decimal("0.01") else "drifted"

        return position.model_copy(
            update={
                "weight": _format_decimal(weight),
                "target_weight": _format_decimal(target),
                "weight_drift": _format_decimal(drift),
                "drift_status": drift_status,
            }
        )

    @staticmethod
    def _parse_target_weights(target_weights: dict[str, str]) -> dict[str, Decimal]:
        parsed: dict[str, Decimal] = {}
        for key, value in target_weights.items():
            decimal_value = _decimal_or_none(value)
            if decimal_value is not None:
                parsed[key.lower()] = decimal_value
        return parsed

    def _position_from_balance(
        self,
        balance: BalanceObservation,
        price_by_key: dict[str, NormalizedPriceSnapshot],
        price_by_symbol: dict[str, NormalizedPriceSnapshot],
    ) -> tuple[PortfolioPosition, Decimal | None]:
        amount = _decimal_or_none(balance.balance)
        price = price_by_key.get(balance.asset_key.lower()) or price_by_symbol.get(balance.asset_symbol.lower())
        price_value = _decimal_or_none(price.price_usd) if price else None
        price_is_usable = _price_is_usable(price, price_value)

        value = amount * price_value if amount is not None and price_value is not None and price_is_usable else None
        status_code = "DATA_FRESH" if value is not None and balance.status_code == "DATA_FRESH" else "DATA_MISSING"
        status_reason = "Position valued from balance and price snapshots."
        if balance.status_code != "DATA_FRESH":
            status_reason = balance.status_reason
        elif amount is None:
            status_reason = "Balance amount is not parseable."
        elif not price:
            status_reason = "No price snapshot is available for this position."
        elif not price_is_usable:
            status_reason = "Price snapshot is missing, stale, or verification-gated."

        data_sources = [balance.balance_source]
        if price:
            data_sources.extend(price.data_sources_used)

        return (
            PortfolioPosition(
                asset_key=balance.asset_key,
                asset_symbol=balance.asset_symbol,
                asset_address=balance.asset_address,
                chain_id=balance.chain_id,
                balance=balance.balance,
                balance_source=balance.balance_source,
                price_usd=price.price_usd if price else None,
                value_usd=_format_decimal(value),
                weight=None,
                target_weight=None,
                weight_drift=None,
                drift_status="not_evaluated",
                route_depth_usd=None,
                slippage_impact_bps=None,
                valuation_status="valued" if value is not None else "unvalued",
                status_code=status_code,
                status_reason=status_reason,
                data_sources_used=sorted(set(data_sources)),
                metadata=balance.metadata,
            ),
            value,
        )
