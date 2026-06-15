#!/usr/bin/env python3
"""Recovery indexer: rebuilds Postgres portfolio state from chain events.

If Postgres is deleted, run this to replay vault events from the deployment
block and rebuild portfolio_snapshots, trade_executions, and vault_flows.

Usage:
    python -m services.agent.jobs.recover_portfolio \\
        --vault 0x... \\
        --from-block 0 \\
        --user 0x...  (optional: single user)

This reads Deposited / Withdrawn / TradeExecuted / ProposalExecuted events
from the vault contract and upserts the corresponding Postgres rows.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from web3 import HTTPProvider, Web3
from web3.types import EventData

from services.agent.app.core.settings import get_settings
from services.agent.modules.market_data.balances import (
    PortfolioSnapshotEngine,
    VaultShareReader,
)
from services.agent.modules.market_data.prices import PriceService
from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.repositories.db.portfolio_repository import PortfolioSnapshotRepository
from services.agent.repositories.db.vault_repository import VaultFlowRepository


logger = logging.getLogger("services.agent.jobs.recover_portfolio")

VAULT_EVENTS_ABI = [
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "user", "type": "address"},
            {"indexed": True, "name": "token", "type": "address"},
            {"indexed": False, "name": "amount", "type": "uint256"},
            {"indexed": False, "name": "sharesMinted", "type": "uint256"},
        ],
        "name": "Deposited",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "user", "type": "address"},
            {"indexed": True, "name": "token", "type": "address"},
            {"indexed": False, "name": "amount", "type": "uint256"},
            {"indexed": False, "name": "sharesBurned", "type": "uint256"},
        ],
        "name": "Withdrawn",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "user", "type": "address"},
            {"indexed": False, "name": "nativeAmount", "type": "uint256"},
            {"indexed": False, "name": "sharesMinted", "type": "uint256"},
        ],
        "name": "NativeDeposited",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "proposalId", "type": "bytes32"},
            {"indexed": True, "name": "router", "type": "address"},
            {"indexed": True, "name": "tokenOut", "type": "address"},
            {"indexed": False, "name": "amountIn", "type": "uint256"},
            {"indexed": False, "name": "minAmountOut", "type": "uint256"},
            {"indexed": False, "name": "realizedAmountOut", "type": "uint256"},
            {"indexed": False, "name": "recipient", "type": "address"},
            {"indexed": False, "name": "actor", "type": "address"},
        ],
        "name": "TradeExecuted",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "proposalId", "type": "bytes32"},
            {"indexed": True, "name": "planHash", "type": "bytes32"},
            {"indexed": True, "name": "executor", "type": "address"},
        ],
        "name": "ProposalExecuted",
        "type": "event",
    },
]


def _format_decimal(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value.normalize(), "f")


def _scaled_token_amount(raw_balance: int, decimals: int) -> str:
    value = Decimal(raw_balance) / (Decimal(10) ** Decimal(decimals))
    return _format_decimal(value) or "0"


def rebuild_single_user(
    web3: Web3,
    vault_address: str,
    user_address: str,
    settings,
) -> dict:
    """Rebuild a single user's portfolio snapshot from current vault state.

    This is the primary recovery path: read vault shares + token balances
    from chain, build a snapshot, persist it, and return the result.
    """
    logger.info("Rebuilding portfolio for user %s from vault %s", user_address, vault_address)

    reader = VaultShareReader(settings.effective_http_rpc_url, vault_address)
    balances = reader.read_user_position(
        user_address=user_address,
        asset_registry=settings.active_portfolio_asset_registry,
        chain_id=settings.effective_chain_id,
    )

    if not balances:
        logger.warning("No vault position found for user %s (zero shares or no assets).", user_address)
        return {"user": user_address, "status": "no_position", "balances_count": 0}

    try:
        price_service = PriceService(settings)
        price_bundle = price_service.fetch_latest_prices()
        prices = price_bundle.normalized_snapshots if price_bundle else []
    except Exception as exc:
        logger.warning("Price fetch failed during recovery: %s", exc)
        prices = []

        try:
            persisted_prices = MarketDataRepository().latest_normalized_prices()
            if persisted_prices:
                prices = persisted_prices
        except Exception:
            pass

    engine = PortfolioSnapshotEngine()
    snapshot = engine.build_snapshot(
        balances=balances,
        prices=prices,
        portfolio_address=user_address,
        chain_id=settings.effective_chain_id,
        base_currency=settings.portfolio_base_currency,
        target_weights=settings.parsed_portfolio_target_weights,
        missing_reason="Portfolio rebuilt from vault during recovery.",
    )

    recovery_metadata = dict(snapshot.metadata)
    recovery_metadata.update(
        {
            "recovery_mode": True,
            "rebuilt_from": "vault_shares",
            "vault_address": vault_address,
        }
    )
    snapshot = snapshot.model_copy(update={"metadata": recovery_metadata})

    try:
        PortfolioSnapshotRepository().save_snapshot(snapshot)
        logger.info(
            "Saved recovered portfolio snapshot for %s (total=%s, %d positions).",
            user_address,
            snapshot.total_value_usd,
            len(snapshot.positions),
        )
    except Exception as exc:
        logger.error("Failed to save recovered snapshot for %s: %s", user_address, exc)

    return {
        "user": user_address,
        "status": "recovered",
        "total_value_usd": snapshot.total_value_usd,
        "positions": len(snapshot.positions),
    }


def replay_events(web3: Web3, vault_address: str, from_block: int, to_block: int | None = None) -> list[EventData]:
    """Replay vault events from chain logs.

    Useful for rebuilding vault_flows and trade_executions tables
    from historical events.
    """
    checksum_vault = web3.to_checksum_address(vault_address)
    contract = web3.eth.contract(address=checksum_vault, abi=VAULT_EVENTS_ABI)

    to_block = to_block or web3.eth.block_number
    logger.info("Replaying events from block %d to %d for vault %s", from_block, to_block, vault_address)

    all_events: list[EventData] = []

    for event_name in ("Deposited", "Withdrawn", "NativeDeposited", "TradeExecuted", "ProposalExecuted"):
        try:
            event = getattr(contract.events, event_name)
            entries = event.get_logs(from_block=from_block, to_block=to_block)
            all_events.extend(entries)
            logger.info("  Found %d %s events", len(entries), event_name)
        except Exception as exc:
            logger.warning("  Failed to fetch %s events: %s", event_name, exc)

    return all_events


def rebuild_vault_flows_from_events(events: list[EventData], vault_address: str, settings, w3: Web3) -> int:
    """Rebuild vault_flows table from Deposited/Withdrawn events."""
    flow_repo = VaultFlowRepository()
    saved = 0

    for event in events:
        try:
            event_name = event.get("event", "")
            args = event.get("args", {})
            tx_hash = event.get("transactionHash", b"").hex()
            block_number = event.get("blockNumber", 0)
            occurred_at = datetime.fromtimestamp(0, tz=timezone.utc)

            if event_name in ("Deposited", "NativeDeposited"):
                user = args.get("user", "")
                token = args.get("token", args.get("nativeAmount", "0"))
                amount = args.get("amount", args.get("nativeAmount", 0))
                flow_type = "deposit"
            elif event_name == "Withdrawn":
                user = args.get("user", "")
                token = args.get("token", "")
                amount = args.get("amount", 0)
                flow_type = "withdrawal"
            else:
                continue

            if not user or user == "0x0000000000000000000000000000000000000000":
                continue

            asset_amount = str(amount) if isinstance(amount, int) else str(int(amount))
            usd_value = "0"

            flow_repo.save_flow(
                flow_id=f"recovery_{uuid4().hex}",
                vault_address=vault_address,
                user_address=w3.to_checksum_address(user),
                flow_type=flow_type,
                asset_symbol="RECOVERED",
                asset_address=token if isinstance(token, str) and token.startswith("0x") else None,
                asset_amount=asset_amount,
                usd_value=usd_value,
                tx_hash=tx_hash,
                occurred_at=occurred_at,
                metadata={"recovery_mode": True, "block_number": block_number},
            )
            saved += 1
        except Exception as exc:
            logger.warning("Failed to save event as vault flow: %s", exc)

    return saved


def main() -> None:
    parser = argparse.ArgumentParser(description="Recover portfolio state from vault contract")
    parser.add_argument("--vault", help="ExecutorVault contract address", default=None)
    parser.add_argument("--from-block", type=int, default=0, help="Block to start event replay from")
    parser.add_argument("--to-block", type=int, default=None, help="Block to end event replay at")
    parser.add_argument("--user", help="Single user address to rebuild (omit for all from events)")
    parser.add_argument("--replay-events", action="store_true", help="Replay chain events into vault_flows")
    parser.add_argument("--rebuild-snapshot", action="store_true", default=True, help="Rebuild current portfolio snapshot from vault shares")

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    settings = get_settings()
    vault_address = args.vault or settings.executor_vault_address
    if not vault_address:
        logger.error("No vault address provided and none configured in settings.")
        sys.exit(1)

    web3 = Web3(HTTPProvider(settings.effective_http_rpc_url))
    if not web3.is_connected():
        logger.error("Cannot connect to RPC at %s", settings.effective_http_rpc_url)
        sys.exit(1)

    logger.info("Connected to chain %d via %s", settings.effective_chain_id, settings.effective_http_rpc_url)
    logger.info("Vault address: %s", vault_address)

    results = []

    if args.user:
        logger.info("Single-user recovery mode for %s", args.user)
        result = rebuild_single_user(web3, vault_address, args.user, settings)
        results.append(result)
    elif args.rebuild_snapshot:
        logger.info("Rebuilding snapshots from vault shares for all users...")
        vault_contract = web3.eth.contract(
            address=web3.to_checksum_address(vault_address),
            abi=VaultShareReader.VAULT_ABI,
        )
        logger.info("Note: full multi-user recovery requires event replay.")

        try:
            shares_filter = vault_contract.functions.shares
            logger.info("Reading totalShares from vault...")
            total_shares = vault_contract.functions.totalShares().call()
            logger.info("Total shares: %d", total_shares)

            if args.user:
                result = rebuild_single_user(web3, vault_address, args.user, settings)
                results.append(result)
            else:
                logger.warning(
                    "Multi-user recovery requires --user flag or event replay. "
                    "Use --replay-events to scan Deposited events for known users."
                )
        except Exception as exc:
            logger.error("Vault read failed: %s", exc)

    if args.replay_events:
        logger.info("Replaying events from block %d...", args.from_block)
        events = replay_events(web3, vault_address, args.from_block, args.to_block)
        logger.info("Found %d total events", len(events))

        flows_saved = rebuild_vault_flows_from_events(events, vault_address, settings, web3)
        logger.info("Rebuilt %d vault flow records from events", flows_saved)

        unique_users = set()
        for event in events:
            args_data = event.get("args", {})
            user = args_data.get("user", "")
            if user and user != "0x0000000000000000000000000000000000000000":
                unique_users.add(user)

        logger.info("Found %d unique users in events", len(unique_users))
        if not args.user:
            for user in sorted(unique_users):
                result = rebuild_single_user(web3, vault_address, user, settings)
                results.append(result)

    logger.info("Recovery complete. Results:")
    for r in results:
        logger.info("  %s: %s (positions=%s, total=%s)", r["user"], r["status"], r.get("positions"), r.get("total_value_usd"))


if __name__ == "__main__":
    main()
