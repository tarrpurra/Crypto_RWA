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
SIMULATION_PRICE_METHODS = {"sepolia_stable_fallback", "sepolia_mock_fixed_price", "native_mnt_parity", "manual_mirror", "wmnt_usdy_quote"}
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
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
        price_usd = _float_or_zero(position.price_usd)
        balances.append(
            AssetBalance(
                asset_symbol=position.asset_symbol,
                balance=balance,
                value_usd=value_usd,
                weight=weight,
                price_usd=price_usd,
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


def fetch_portfolio_snapshot(wallet_address: str | None = None, *, allow_env_fallback: bool = False) -> PortfolioSnapshot:
    settings = get_settings()
    portfolio_address = wallet_address
    if not portfolio_address and allow_env_fallback:
        portfolio_address = settings.portfolio_wallet_address or settings.executor_vault_address
    if not portfolio_address:
        return _missing_internal_snapshot(
            "No wallet_address was provided for portfolio snapshot lookup.",
            wallet_or_vault="UNCONFIGURED",
        )
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


def _native_mnt_asset(chain_id: int) -> dict[str, Any]:
    return {
        "asset_key": "NATIVE_MNT",
        "symbol": "MNT",
        "chain_id": chain_id,
        "address": ZERO_ADDRESS,
        "verified": True,
        "decimals": 18,
    }


def configured_vault_assets(
    asset_registry: dict[str, dict[str, Any]],
    chain_id: int,
) -> list[dict[str, Any]]:
    assets: list[dict[str, Any]] = []
    seen_addresses: set[str] = set()
    for asset in asset_registry.values():
        if int(asset["chain_id"]) != chain_id:
            continue
        if not asset.get("verified") or not asset.get("address"):
            continue
        address = str(asset["address"])
        lowered = address.lower()
        if lowered in seen_addresses:
            continue
        seen_addresses.add(lowered)
        assets.append(asset)
    return assets


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


class VaultShareReader:
    """Reads user vault position using vault contract shares + token balances.

    Preferred path: user's share % = vault.shares(user) / vault.totalShares().
    Multiply that ownership by the vault's live token balances to estimate the
    user's current sleeve after internal swaps. This is the only reliable
    representation once the vault has traded shared assets.

    Fallback path: if share reads fail, fall back to the legacy
    `getUserBalances(user, tokens)` ledger so recovery and degraded UIs can
    still render something rather than hard-failing.
    """

    VAULT_ABI = [
        {
            "constant": True,
            "inputs": [{"name": "user", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function",
        },
        {
            "constant": True,
            "inputs": [],
            "name": "totalShares",
            "outputs": [{"name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function",
        },
        {
            "constant": True,
            "inputs": [
                {"name": "user", "type": "address"},
                {"name": "tokens", "type": "address[]"},
            ],
            "name": "getUserBalances",
            "outputs": [{"name": "", "type": "uint256[]"}],
            "stateMutability": "view",
            "type": "function",
        },
        {
            "constant": True,
            "inputs": [],
            "name": "totalAssets",
            "outputs": [{"name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function",
        },
    ]

    def __init__(self, rpc_url: str, vault_address: str) -> None:
        from web3 import HTTPProvider, Web3

        self.web3 = Web3(HTTPProvider(rpc_url))
        self.vault_address = self.web3.to_checksum_address(vault_address)
        self.vault_contract = self.web3.eth.contract(address=self.vault_address, abi=self.VAULT_ABI)

    def read_user_position(
        self,
        *,
        user_address: str,
        asset_registry: dict[str, dict[str, object]],
        chain_id: int,
    ) -> list[BalanceObservation]:
        """Read user's vault position directly from the vault contract."""
        observed_at = utc_now()
        checksum_user = self.web3.to_checksum_address(user_address)

        token_assets = configured_vault_assets(asset_registry, chain_id)
        token_addresses: list[str] = []
        asset_map: dict[str, dict[str, object]] = {}
        for asset in token_assets:
            addr = str(asset["address"])
            token_addresses.append(addr)
            asset_map[addr.lower()] = asset

        # Always check native MNT in the vault, but we will skip it if its vault balance is 0.
        native_asset = _native_mnt_asset(chain_id)
        token_addresses.append(ZERO_ADDRESS)
        asset_map[ZERO_ADDRESS.lower()] = native_asset

        if not token_addresses:
            return []

        user_shares: int | None = None
        total_shares: int | None = None
        ownership_pct: Decimal | None = None
        try:
            user_shares = int(self.vault_contract.functions.balanceOf(checksum_user).call())
            total_shares = int(self.vault_contract.functions.totalShares().call())
            if total_shares > 0:
                ownership_pct = Decimal(user_shares) / Decimal(total_shares)
        except Exception:
            user_shares = None
            total_shares = None
            ownership_pct = None

        if ownership_pct is not None and user_shares is not None and total_shares is not None:
            return self._read_share_based_position(
                observed_at=observed_at,
                token_addresses=token_addresses,
                asset_map=asset_map,
                chain_id=chain_id,
                user_shares=user_shares,
                total_shares=total_shares,
                ownership_pct=ownership_pct,
            )

        return self._read_legacy_user_balances(
            observed_at=observed_at,
            checksum_user=checksum_user,
            token_addresses=token_addresses,
            asset_map=asset_map,
            chain_id=chain_id,
            user_shares=user_shares,
            total_shares=total_shares,
            ownership_pct=ownership_pct,
        )

    def _read_share_based_position(
        self,
        *,
        observed_at,
        token_addresses: list[str],
        asset_map: dict[str, dict[str, object]],
        chain_id: int,
        user_shares: int,
        total_shares: int,
        ownership_pct: Decimal,
    ) -> list[BalanceObservation]:
        balances: list[BalanceObservation] = []
        share_pct_text = f"{float(ownership_pct * 100):.2f}%"

        for addr in token_addresses:
            raw_vault_balance = self._read_raw_vault_balance(addr)
            if raw_vault_balance <= 0:
                continue

            raw_user_balance = (raw_vault_balance * user_shares) // total_shares if total_shares > 0 else 0
            if raw_user_balance <= 0:
                continue

            asset = asset_map.get(addr.lower(), {})
            decimals = int(asset.get("decimals", 18))
            balances.append(
                BalanceObservation(
                    asset_key=str(asset.get("asset_key", "")),
                    asset_symbol=str(asset.get("symbol", "")),
                    asset_address=addr,
                    chain_id=chain_id,
                    balance=_scaled_token_amount(raw_user_balance, decimals),
                    decimals=decimals,
                    observed_timestamp=observed_at,
                    balance_source="vault_share_of_vault_balances",
                    status="ok",
                    status_code="DATA_FRESH",
                    status_reason=(
                        "User position derived from live vault balances and proportional share ownership "
                        f"({share_pct_text})."
                    ),
                    metadata={
                        "user_shares": str(user_shares),
                        "total_shares": str(total_shares),
                        "ownership_pct": str(ownership_pct),
                        "raw_vault_balance": str(raw_vault_balance),
                        "raw_user_balance": str(raw_user_balance),
                    },
                )
            )

        return balances

    def _read_legacy_user_balances(
        self,
        *,
        observed_at,
        checksum_user: str,
        token_addresses: list[str],
        asset_map: dict[str, dict[str, object]],
        chain_id: int,
        user_shares: int | None,
        total_shares: int | None,
        ownership_pct: Decimal | None,
    ) -> list[BalanceObservation]:
        checksum_tokens = [self.web3.to_checksum_address(a) for a in token_addresses]
        raw_balances = self.vault_contract.functions.getUserBalances(checksum_user, checksum_tokens).call()

        balances: list[BalanceObservation] = []
        for i, addr in enumerate(token_addresses):
            raw_user_balance = int(raw_balances[i]) if i < len(raw_balances) else 0
            if raw_user_balance == 0 and addr == ZERO_ADDRESS:
                continue

            asset = asset_map.get(addr.lower(), {})
            decimals = int(asset.get("decimals", 18))
            share_pct_text = f"{float(ownership_pct * 100):.2f}%" if ownership_pct is not None else "unknown share"

            balances.append(
                BalanceObservation(
                    asset_key=str(asset.get("asset_key", "")),
                    asset_symbol=str(asset.get("symbol", "")),
                    asset_address=addr,
                    chain_id=chain_id,
                    balance=_scaled_token_amount(raw_user_balance, decimals),
                    decimals=decimals,
                    observed_timestamp=observed_at,
                    balance_source="vault_legacy_user_balances",
                    status="ok",
                    status_code="DATA_FRESH",
                    status_reason=(
                        "User position read from legacy vault getUserBalances "
                        f"with share metadata {share_pct_text}."
                    ),
                    metadata={
                        "user_shares": str(user_shares) if user_shares is not None else None,
                        "total_shares": str(total_shares) if total_shares is not None else None,
                        "ownership_pct": str(ownership_pct) if ownership_pct is not None else None,
                        "raw_user_balance": str(raw_user_balance),
                    },
                )
            )

        return balances

    def _read_raw_vault_balance(self, token_address: str) -> int:
        if token_address.lower() == ZERO_ADDRESS.lower():
            return int(self.web3.eth.get_balance(self.vault_address))

        contract = self.web3.eth.contract(
            address=self.web3.to_checksum_address(token_address),
            abi=ERC20_BALANCE_ABI,
        )
        return int(contract.functions.balanceOf(self.vault_address).call())


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
        quote_validation_status = self._quote_validation_status()

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
                "route_depth_status": quote_validation_status,
            },
        )

    def _quote_validation_status(self) -> str:
        try:
            from services.agent.modules.quotes import get_quote_service

            quote_service = get_quote_service()
            routes = quote_service.discover_routes()
            if not routes:
                from services.agent.repositories.db.market_repository import MarketDataRepository

                persisted_quotes = MarketDataRepository().latest_normalized_quotes()
                return "live_quote_ok" if persisted_quotes else "no_routes"
            attempts = [quote_service.best_quote_attempt_for_pair(route.token_in, route.token_out) for route in routes]
            attempts = [attempt for attempt in attempts if attempt is not None]
            if not attempts:
                from services.agent.repositories.db.market_repository import MarketDataRepository

                persisted_quotes = MarketDataRepository().latest_normalized_quotes()
                return "live_quote_ok" if persisted_quotes else "pending_phase_1b_quote_validation"
            if any(attempt.normalized_snapshot.amount_out is None for attempt in attempts):
                from services.agent.repositories.db.market_repository import MarketDataRepository

                persisted_quotes = MarketDataRepository().latest_normalized_quotes()
                return "live_quote_ok" if persisted_quotes else "quote_failed"
            return "live_quote_ok"
        except Exception as exc:
            logger.warning("Route-depth validation failed: %s", exc)
            try:
                from services.agent.repositories.db.market_repository import MarketDataRepository

                persisted_quotes = MarketDataRepository().latest_normalized_quotes()
                if persisted_quotes:
                    return "live_quote_ok"
            except Exception:
                pass
            return "pending_phase_1b_quote_validation"

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
        if not price:
            if balance.asset_symbol.upper() == "MNT":
                price = price_by_symbol.get("wmnt")
            elif balance.asset_symbol.upper() == "WMNT":
                price = price_by_symbol.get("mnt")
        price_value = _decimal_or_none(price.price_usd) if price else None
        price_is_usable = _price_is_usable(price, price_value)

        zero_balance = amount is not None and amount == 0
        if zero_balance:
            value = Decimal("0")
        elif amount is not None and price_value is not None and price_is_usable:
            value = amount * price_value
        else:
            value = None

        status_code = "DATA_FRESH" if value is not None and balance.status_code == "DATA_FRESH" else "DATA_MISSING"
        status_reason = "Position valued from balance and price snapshots."
        if balance.status_code != "DATA_FRESH":
            status_reason = balance.status_reason
        elif amount is None:
            status_reason = "Balance amount is not parseable."
        elif zero_balance:
            status_reason = "Zero-balance position valued at 0 without requiring a price snapshot."
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
