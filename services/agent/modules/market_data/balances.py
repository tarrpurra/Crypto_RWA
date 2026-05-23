from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from web3 import Web3

from services.agent.app.core.settings import get_settings
from services.agent.app.core.status_codes import TargetChain
from services.agent.app.schemas.market_data import NormalizedPriceSnapshot
from services.agent.app.schemas.portfolio import (
    AssetBalance,
    BalanceObservation,
    CurrentPortfolioResponse,
    PortfolioPosition,
    PortfolioSnapshot,
)
from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.market_repository import MarketDataRepository


logger = logging.getLogger("services.agent.market_data.balances")

ERC20_ABI = [
    {
        "constant": True,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function",
    },
]

FRESH_PRICE_CODES = {"DATA_FRESH", "ORACLE_FRESH", "QUOTE_FRESH"}
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


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


def get_default_mock_snapshot(wallet_or_vault: str) -> PortfolioSnapshot:
    """
    Legacy test helper only. Runtime portfolio reads must use
    get_missing_portfolio_snapshot or live chain data instead of this mock.
    """
    now = utc_now()
    balances = [
        AssetBalance(asset_symbol="USDY", balance=428571.43, value_usd=450000.0, weight=0.45),
        AssetBalance(asset_symbol="mETH", balance=71.4286, value_usd=250000.0, weight=0.25),
        AssetBalance(asset_symbol="USDC", balance=300000.0, value_usd=300000.0, weight=0.30),
    ]
    weights = {"USDY": 0.45, "mETH": 0.25, "USDC": 0.30}
    return PortfolioSnapshot(
        snapshot_id=f"port_mock_{int(now.timestamp())}",
        wallet_or_vault=wallet_or_vault,
        total_value_usd=1000000.0,
        balances=balances,
        weights=weights,
        status_code="DATA_STALE",
        status_reason="Legacy mock portfolio snapshot. Do not use for live decisioning.",
        created_at=now,
    )


def get_missing_portfolio_snapshot(wallet_or_vault: str, reason: str) -> PortfolioSnapshot:
    now = utc_now()
    return PortfolioSnapshot(
        snapshot_id=f"port_missing_{int(now.timestamp())}",
        wallet_or_vault=wallet_or_vault,
        total_value_usd=0.0,
        balances=[],
        weights={},
        status_code="DATA_MISSING",
        status_reason=reason,
        created_at=now,
    )


def fetch_portfolio_snapshot(wallet_or_vault: str | None = None) -> PortfolioSnapshot:
    settings = get_settings()
    vault = wallet_or_vault or settings.executor_vault_address or ZERO_ADDRESS

    if not settings.executor_vault_address or settings.executor_vault_address == "TODO_VERIFY":
        logger.info("Executor vault address is not configured. Returning missing portfolio snapshot.")
        return get_missing_portfolio_snapshot(vault, "Executor vault address is not configured.")

    try:
        w3 = Web3(Web3.HTTPProvider(settings.effective_http_rpc_url))
        if not w3.is_connected():
            raise ConnectionError("Failed to connect to Mantle RPC provider.")

        prices = {price.asset_symbol: float(price.price_usd) for price in MarketDataRepository().latest_normalized_prices() if price.price_usd}
        required_prices = {"USDY", "mETH", "USDC"}
        missing_prices = sorted(asset for asset in required_prices if asset not in prices)
        if missing_prices:
            return get_missing_portfolio_snapshot(
                vault,
                f"Required price snapshots are missing for portfolio valuation: {', '.join(missing_prices)}.",
            )

        meth_address = (
            settings.meth_sepolia_address
            if settings.target_chain == TargetChain.MANTLE_SEPOLIA
            else settings.meth_mainnet_address
        )
        tokens = [
            ("USDY", settings.usdy_mainnet_address, prices["USDY"], 18),
            ("mETH", meth_address, prices["mETH"], 18),
            ("USDC", settings.usdc_mainnet_address, prices["USDC"], 6),
        ]

        balances: list[AssetBalance] = []
        total_value = 0.0

        for symbol, address, price, default_decimals in tokens:
            if not address or address == "TODO_VERIFY" or address == ZERO_ADDRESS:
                return get_missing_portfolio_snapshot(vault, f"{symbol} token address is not configured for portfolio reads.")

            try:
                contract = w3.eth.contract(address=w3.to_checksum_address(address), abi=ERC20_ABI)
                raw_balance = contract.functions.balanceOf(w3.to_checksum_address(vault)).call()
                try:
                    decimals = contract.functions.decimals().call()
                except Exception:
                    decimals = default_decimals
                balance = raw_balance / (10**decimals)
            except Exception as exc:
                logger.warning("Failed to fetch balance for %s at %s: %s", symbol, address, exc)
                return get_missing_portfolio_snapshot(vault, f"Failed to fetch {symbol} balance from chain.")

            value_usd = balance * price
            total_value += value_usd
            balances.append(AssetBalance(asset_symbol=symbol, balance=balance, value_usd=value_usd, weight=0.0))

        if total_value == 0.0:
            return get_missing_portfolio_snapshot(vault, "Vault portfolio value is zero or no supported balances were found.")

        weights: dict[str, float] = {}
        for balance in balances:
            balance.weight = balance.value_usd / total_value
            weights[balance.asset_symbol] = balance.weight

        now = utc_now()
        return PortfolioSnapshot(
            snapshot_id=f"port_{int(now.timestamp())}",
            wallet_or_vault=vault,
            total_value_usd=total_value,
            balances=balances,
            weights=weights,
            status_code="DATA_FRESH",
            status_reason="Portfolio snapshot refreshed from chain.",
            created_at=now,
        )

    except Exception as exc:
        logger.error("Error reading portfolio from chain: %s", exc)
        return get_missing_portfolio_snapshot(vault, f"Error reading portfolio from chain: {exc}")


class PortfolioSnapshotEngine:
    def build_snapshot(
        self,
        *,
        balances: list[BalanceObservation],
        prices: list[NormalizedPriceSnapshot],
        portfolio_address: str | None,
        chain_id: int,
        base_currency: str = "USD",
        missing_reason: str | None = None,
    ) -> CurrentPortfolioResponse:
        generated_at = utc_now()
        if not balances:
            reason = missing_reason or "No portfolio balance observations are available."
            return CurrentPortfolioResponse(
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

        for balance in balances:
            position, value = self._position_from_balance(balance, price_by_key, price_by_symbol)
            positions.append(position)
            data_sources.update(position.data_sources_used)
            if value is None:
                all_valued = False
                continue
            total_value += value

        total_value_output = total_value if all_valued and total_value > 0 else None
        if total_value_output is not None:
            positions = [
                position.model_copy(
                    update={"weight": _format_decimal((_decimal_or_none(position.value_usd) or Decimal("0")) / total_value_output)}
                )
                for position in positions
            ]

        status_code = "DATA_FRESH" if all_valued and total_value_output is not None else "DATA_PARTIAL"
        status = "ok" if status_code == "DATA_FRESH" else "degraded"
        status_reason = "Portfolio snapshot valued successfully."
        if status_code == "DATA_PARTIAL":
            status_reason = "Portfolio balances are present, but one or more positions cannot be valued."

        return CurrentPortfolioResponse(
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
            metadata={"balance_count": len(balances), "all_positions_valued": all_valued},
        )

    def _position_from_balance(
        self,
        balance: BalanceObservation,
        price_by_key: dict[str, NormalizedPriceSnapshot],
        price_by_symbol: dict[str, NormalizedPriceSnapshot],
    ) -> tuple[PortfolioPosition, Decimal | None]:
        amount = _decimal_or_none(balance.balance)
        price = price_by_key.get(balance.asset_key.lower()) or price_by_symbol.get(balance.asset_symbol.lower())
        price_value = _decimal_or_none(price.price_usd) if price else None
        price_is_usable = bool(price and price.status_code in FRESH_PRICE_CODES and price_value is not None)

        value = amount * price_value if amount is not None and price_value is not None and price_is_usable else None
        status_code = "DATA_FRESH" if value is not None and balance.status_code == "DATA_FRESH" else "DATA_MISSING"
        status_reason = "Position valued from balance and price snapshots."
        if amount is None:
            status_reason = "Balance amount is not parseable."
        elif not price:
            status_reason = "No price snapshot is available for this position."
        elif not price_is_usable:
            status_reason = "Price snapshot is missing, stale, or verification-gated."
        elif balance.status_code != "DATA_FRESH":
            status_reason = balance.status_reason

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
                valuation_status="valued" if value is not None else "unvalued",
                status_code=status_code,
                status_reason=status_reason,
                data_sources_used=sorted(set(data_sources)),
                metadata=balance.metadata,
            ),
            value,
        )
