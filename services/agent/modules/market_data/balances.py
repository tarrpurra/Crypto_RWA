from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from web3 import Web3

from services.agent.app.core.settings import get_settings
from services.agent.app.core.status_codes import RuntimeMode
from services.agent.app.schemas.portfolio import AssetBalance, PortfolioSnapshot
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.modules.oracle.freshness import utc_now

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
    }
]


def get_default_mock_snapshot(wallet_or_vault: str) -> PortfolioSnapshot:
    """
    Returns a default mock portfolio snapshot representing $1,000,000 portfolio value:
    - USDY: 45% ($450,000 -> 428,571 tokens at $1.05)
    - mETH: 25% ($250,000 -> 71.428 tokens at $3500.00)
    - USDC: 30% ($300,000 -> 300,000 tokens at $1.00)
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
        status_reason="Vault address not configured or RPC unreachable. Using mock data.",
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
    vault = wallet_or_vault or settings.executor_vault_address or "0x0000000000000000000000000000000000000000"

    if not settings.executor_vault_address or settings.executor_vault_address == "TODO_VERIFY":
        logger.info("Executor vault address is not configured. Returning missing portfolio snapshot.")
        return get_missing_portfolio_snapshot(vault, "Executor vault address is not configured.")

    try:
        w3 = Web3(Web3.HTTPProvider(settings.effective_http_rpc_url))
        if not w3.is_connected():
            raise ConnectionError("Failed to connect to Mantle RPC provider.")

        # Read prices from repo (Phase 1)
        repo = MarketDataRepository()
        prices = {p.asset_symbol: float(p.price_usd) for p in repo.latest_normalized_prices() if p.price_usd}

        required_prices = {"USDY", "mETH", "USDC"}
        missing_prices = sorted(asset for asset in required_prices if asset not in prices)
        if missing_prices:
            return get_missing_portfolio_snapshot(
                vault,
                f"Required price snapshots are missing for portfolio valuation: {', '.join(missing_prices)}.",
            )

        usdy_price = prices["USDY"]
        meth_price = prices["mETH"]
        usdc_price = prices["USDC"]

        # Asset address mappings from settings
        # Note: on Sepolia we might use testnet addresses
        usdy_addr = settings.usdy_mainnet_address
        meth_addr = settings.meth_sepolia_address if settings.meth_sepolia_address else settings.meth_mainnet_address
        usdc_addr = settings.usdc_mainnet_address or "0x0000000000000000000000000000000000000000"  # Fallback

        tokens = [
            ("USDY", usdy_addr, usdy_price, 18),
            ("mETH", meth_addr, meth_price, 18),
            ("USDC", usdc_addr, usdc_price, 6 if usdc_addr != "0x0000000000000000000000000000000000000000" else 18),
        ]

        balances: list[AssetBalance] = []
        total_value = 0.0

        for symbol, address, price, default_decimals in tokens:
            if not address or address == "TODO_VERIFY":
                # Assume 0 balance if not configured
                balances.append(AssetBalance(asset_symbol=symbol, balance=0.0, value_usd=0.0, weight=0.0))
                continue

            try:
                contract = w3.eth.contract(address=w3.to_checksum_address(address), abi=ERC20_ABI)
                raw_balance = contract.functions.balanceOf(w3.to_checksum_address(vault)).call()
                try:
                    decimals = contract.functions.decimals().call()
                except Exception:
                    decimals = default_decimals
                balance = raw_balance / (10 ** decimals)
            except Exception as exc:
                logger.warning("Failed to fetch balance for %s at %s: %s", symbol, address, exc)
                return get_missing_portfolio_snapshot(vault, f"Failed to fetch {symbol} balance from chain.")

            val_usd = balance * price
            total_value += val_usd
            balances.append(AssetBalance(asset_symbol=symbol, balance=balance, value_usd=val_usd, weight=0.0))

        # Handle native MNT (just in case)
        try:
            native_raw = w3.eth.get_balance(w3.to_checksum_address(vault))
            native_bal = native_raw / 1e18
            # If native MNT is not tracked as a main asset, we might not count it in portfolio weights, but we can value it
            # For simplicity, we just log it
            logger.debug("Native MNT balance of vault: %s", native_bal)
        except Exception as exc:
            logger.debug("Failed to fetch native balance: %s", exc)

        # Update weights
        weights: dict[str, float] = {}
        for b in balances:
            b.weight = b.value_usd / total_value if total_value > 0 else 0.0
            weights[b.asset_symbol] = b.weight

        now = utc_now()
        status_code = "DATA_FRESH"
        status_reason = "Portfolio snapshot refreshed from chain."
        
        if total_value == 0.0:
            return get_missing_portfolio_snapshot(vault, "Vault portfolio value is zero or no supported balances were found.")

        return PortfolioSnapshot(
            snapshot_id=f"port_{int(now.timestamp())}",
            wallet_or_vault=vault,
            total_value_usd=total_value,
            balances=balances,
            weights=weights,
            status_code=status_code,
            status_reason=status_reason,
            created_at=now,
        )

    except Exception as exc:
        logger.error("Error reading portfolio from chain: %s", exc)
        return get_missing_portfolio_snapshot(vault, f"Error reading portfolio from chain: {exc}")
