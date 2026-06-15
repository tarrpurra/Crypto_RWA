from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from services.agent.app.api.portfolio import current_portfolio
from services.agent.app.core.settings import get_settings
from services.agent.app.schemas.vault import (
    DepositPrepareRequest,
    DepositPrepareResponse,
    VaultBalanceItem,
    VaultBalanceResponse,
    VaultFlowRecordRequest,
    VaultFlowRecordResponse,
    WithdrawPrepareRequest,
    WithdrawPrepareResponse,
)
from services.agent.modules.dashboard.cache import clear_cached
from services.agent.modules.market_data.balances import Erc20BalanceReader, VaultShareReader, ZERO_ADDRESS
from services.agent.modules.market_data import get_price_service
from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.vault_repository import VaultFlowRepository


logger = logging.getLogger("services.agent.vault.api")
router = APIRouter(prefix="/vault", tags=["vault"])


def _web3(rpc_url: str):
    from web3 import HTTPProvider, Web3
    return Web3(HTTPProvider(rpc_url))


def _format_decimal(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value.normalize(), "f")


def _scaled_token_amount(raw_balance: int, decimals: int) -> str:
    value = Decimal(raw_balance) / (Decimal(10) ** Decimal(decimals))
    return _format_decimal(value) or "0"


def _price_by_symbol_from_snapshots(prices) -> dict[str, Decimal]:
    price_by_symbol: dict[str, Decimal] = {}
    for price_snapshot in prices:
        if price_snapshot.price_usd:
            try:
                price_by_symbol[price_snapshot.asset_symbol.lower()] = Decimal(price_snapshot.price_usd)
            except (InvalidOperation, ValueError):
                continue
    return price_by_symbol


def _safe_decimal(value: str | None) -> Decimal:
    if value is None:
        return Decimal("0")
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def _compute_pnl(total_value_usd: Decimal, net_invested_usd: Decimal) -> tuple[str | None, str | None]:
    pnl_usd = total_value_usd - net_invested_usd
    pnl_usd_str = _format_decimal(pnl_usd)
    if net_invested_usd == 0:
        return pnl_usd_str, None
    pnl_percent = (pnl_usd / net_invested_usd) * Decimal("100")
    return pnl_usd_str, _format_decimal(pnl_percent)


def _reconcile_dashboard_cost_basis(total_value_usd: Decimal, net_invested_usd: Decimal) -> tuple[Decimal, bool]:
    if total_value_usd <= 0 or net_invested_usd <= 0:
        return net_invested_usd, False
    if net_invested_usd <= (total_value_usd * Decimal("5")):
        return net_invested_usd, False
    return total_value_usd, True


def _summary_metadata(summary) -> dict[str, object]:
    return {
        "flow_count": summary.flow_count,
        "last_flow_at": summary.last_flow_at.isoformat() if summary.last_flow_at else None,
        "cost_basis_tracking": summary.flow_count > 0,
    }


def _get_vault_contract(web3, vault_address: str):
    from web3 import Web3 as W3
    vault_abi = [
        {
            "constant": True,
            "inputs": [
                {"name": "user", "type": "address"},
                {"name": "token", "type": "address"},
            ],
            "name": "getUserBalance",
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
    ]
    return web3.eth.contract(address=W3.to_checksum_address(vault_address), abi=vault_abi)


@router.get("/wallet", response_model=VaultBalanceResponse)
async def wallet_balance(wallet_address: str | None = None) -> VaultBalanceResponse:
    settings = get_settings()
    if not wallet_address:
        return VaultBalanceResponse(
            status="degraded",
            status_code="DATA_MISSING",
            status_label="DATA_MISSING",
            status_reason="wallet_address is required.",
            vault_address="",
            vault_label="Wallet",
            user_address="",
            balances=[],
        )

    try:
        web3 = _web3(settings.effective_http_rpc_url)
        reader = Erc20BalanceReader(settings.effective_http_rpc_url)
        balances = reader.read_configured_balances(
            portfolio_address=wallet_address,
            asset_registry=settings.active_portfolio_asset_registry,
            chain_id=settings.effective_chain_id,
        )
        native_mnt_balance = int(web3.eth.get_balance(web3.to_checksum_address(wallet_address)))
    except Exception as exc:
        return VaultBalanceResponse(
            status="degraded",
            status_code="DATA_MISSING",
            status_label="DATA_MISSING",
            status_reason=f"Wallet balance read failed: {exc}",
            vault_address="",
            vault_label="Wallet",
            user_address=wallet_address,
            balances=[],
        )

    price_service = get_price_service()
    try:
        price_bundle = await price_service.fetch_latest_prices()
        prices = price_bundle.normalized_snapshots if price_bundle else []
    except Exception:
        prices = []

    price_by_symbol = _price_by_symbol_from_snapshots(prices)

    items: list[VaultBalanceItem] = []
    total_value = Decimal("0")
    for bal in balances:
        if bal.balance is None:
            continue
        try:
            bal_dec = Decimal(bal.balance)
        except (InvalidOperation, ValueError):
            continue
        symbol_lower = bal.asset_symbol.lower()
        price = price_by_symbol.get(symbol_lower, Decimal("0"))
        value = bal_dec * price
        total_value += value
        items.append(
            VaultBalanceItem(
                asset_symbol=bal.asset_symbol,
                asset_address=bal.asset_address,
                balance=bal.balance,
                value_usd=_format_decimal(value),
                share=0.0,
            )
        )

    if native_mnt_balance > 0:
        try:
            native_value = Decimal(native_mnt_balance) / (Decimal(10) ** Decimal(18))
        except (InvalidOperation, ValueError):
            native_value = Decimal("0")
        price = price_by_symbol.get("mnt", Decimal("0"))
        value = native_value * price
        total_value += value
        items.append(
            VaultBalanceItem(
                asset_symbol="MNT",
                asset_address=ZERO_ADDRESS,
                balance=_format_decimal(native_value) or "0",
                value_usd=_format_decimal(value),
                share=0.0,
            )
        )

    for item in items:
        if total_value > 0:
            try:
                val = Decimal(item.value_usd or "0")
                item.share = float(val / total_value)
            except (InvalidOperation, ValueError, ZeroDivisionError):
                item.share = 0.0

    return VaultBalanceResponse(
        status="ok",
        status_code="DATA_FRESH",
        status_label="DATA_FRESH",
        status_reason="Wallet balances loaded.",
        vault_address="",
        vault_label="Wallet",
        user_address=wallet_address,
        total_value_usd=_format_decimal(total_value),
        balances=items,
    )


@router.get("/portfolio", response_model=VaultBalanceResponse)
async def vault_balance(user_address: str | None = None) -> VaultBalanceResponse:
    return await get_vault_balance_snapshot(user_address)


async def get_vault_balance_snapshot(user_address: str | None = None) -> VaultBalanceResponse:
    settings = get_settings()
    vault_address = settings.executor_vault_address
    if not vault_address:
        return VaultBalanceResponse(
            status="degraded",
            status_code="DATA_MISSING",
            status_label="DATA_MISSING",
            status_reason="ExecutorVault address is not configured.",
            vault_address="",
            vault_label="AIxRWA Portfolio Vault",
            user_address=user_address or "",
            balances=[],
            metadata={"cost_basis_tracking": False},
        )
    if not user_address:
        return VaultBalanceResponse(
            status="degraded",
            status_code="DATA_MISSING",
            status_label="DATA_MISSING",
            status_reason="user_address is required.",
            vault_address=vault_address,
            vault_label="AIxRWA Portfolio Vault",
            user_address="",
            balances=[],
            metadata={"cost_basis_tracking": False},
        )

    try:
        reader = VaultShareReader(settings.effective_http_rpc_url, vault_address)
    except Exception as exc:
        return VaultBalanceResponse(
            status="degraded",
            status_code="DATA_MISSING",
            status_label="DATA_MISSING",
            status_reason=f"Vault contract connection failed: {exc}",
            vault_address=vault_address,
            vault_label="AIxRWA Portfolio Vault",
            user_address=user_address,
            balances=[],
            metadata={"cost_basis_tracking": False},
        )

    try:
        balances = reader.read_user_position(
            user_address=user_address,
            asset_registry=settings.active_portfolio_asset_registry,
            chain_id=settings.effective_chain_id,
        )
    except Exception as exc:
        logger.warning("Vault balance read failed: %s", exc)
        return VaultBalanceResponse(
            status="degraded",
            status_code="DATA_MISSING",
            status_label="DATA_MISSING",
            status_reason=f"Vault balance read failed: {exc}",
            vault_address=vault_address,
            vault_label="AIxRWA Portfolio Vault",
            user_address=user_address,
            balances=[],
            metadata={"cost_basis_tracking": False},
        )

    price_service = get_price_service()
    prices = []
    try:
        price_bundle = await price_service.fetch_latest_prices()
        if price_bundle:
            prices = price_bundle.normalized_snapshots
            has_missing = any(p.price_usd is None or p.status_code == "DATA_MISSING" for p in prices)
            if has_missing:
                from services.agent.repositories.db.market_repository import MarketDataRepository
                try:
                    persisted_prices = MarketDataRepository().latest_normalized_prices()
                    persisted_by_symbol = {p.asset_symbol.upper(): p for p in persisted_prices if p.price_usd is not None}
                    merged_prices = []
                    for p in prices:
                        if (p.price_usd is None or p.status_code == "DATA_MISSING") and p.asset_symbol.upper() in persisted_by_symbol:
                            merged_prices.append(persisted_by_symbol[p.asset_symbol.upper()])
                        else:
                            merged_prices.append(p)
                    prices = merged_prices
                except Exception as exc:
                    logger.warning("Failed to merge missing prices in vault API: %s", exc)
    except Exception:
        prices = []

    price_by_symbol = _price_by_symbol_from_snapshots(prices)

    items: list[VaultBalanceItem] = []
    total_value = Decimal("0")
    for balance in balances:
        if balance.balance is None:
            continue
        try:
            bal_dec = Decimal(balance.balance)
        except (InvalidOperation, ValueError):
            continue

        sym_lower = balance.asset_symbol.lower()
        price = price_by_symbol.get(sym_lower, Decimal("0"))
        value = bal_dec * price
        total_value += value
        items.append(
            VaultBalanceItem(
                asset_symbol=balance.asset_symbol,
                asset_address=balance.asset_address,
                balance=balance.balance,
                value_usd=_format_decimal(value),
                share=0.0,
            )
        )

    for item in items:
        if total_value > 0:
            try:
                val = Decimal(item.value_usd or "0")
                item.share = float(val / total_value)
            except (InvalidOperation, ValueError, ZeroDivisionError):
                item.share = 0.0

    try:
        summary = VaultFlowRepository().summarize(vault_address=vault_address, user_address=user_address)
    except Exception as exc:
        logger.warning("Vault flow summary lookup failed: %s", exc)
        summary = None

    invested_amount_usd = _format_decimal(summary.net_invested_usd) if summary is not None else None
    total_deposits_usd = _format_decimal(summary.total_deposits_usd) if summary is not None else None
    total_withdrawals_usd = _format_decimal(summary.total_withdrawals_usd) if summary is not None else None
    pnl_usd = None
    pnl_percent = None
    metadata = {"cost_basis_tracking": False}
    if summary is not None:
        effective_invested_usd, reconciled = _reconcile_dashboard_cost_basis(total_value, summary.net_invested_usd)
        invested_amount_usd = _format_decimal(effective_invested_usd)
        pnl_usd, pnl_percent = _compute_pnl(total_value, effective_invested_usd)
        metadata = _summary_metadata(summary)
        if reconciled:
            metadata["cost_basis_tracking_mode"] = "reconciled_live_value"
            metadata["cost_basis_reconciled"] = True
            metadata["cost_basis_reconciliation_reason"] = (
                "Historical vault flow basis was far above current live vault ownership, so the dashboard capped invested capital to live value."
            )

    return VaultBalanceResponse(
        status="ok",
        status_code="DATA_FRESH",
        status_label="DATA_FRESH",
        status_reason="Vault balances loaded.",
        vault_address=vault_address,
        vault_label="AIxRWA Portfolio Vault",
        user_address=user_address,
        total_value_usd=_format_decimal(total_value),
        invested_amount_usd=invested_amount_usd,
        total_deposits_usd=total_deposits_usd,
        total_withdrawals_usd=total_withdrawals_usd,
        pnl_usd=pnl_usd,
        pnl_percent=pnl_percent,
        balances=items,
        metadata=metadata,
    )


@router.post("/deposit/prepare", response_model=DepositPrepareResponse)
async def deposit_prepare(req: DepositPrepareRequest) -> DepositPrepareResponse:
    settings = get_settings()
    vault_address = settings.executor_vault_address
    if not vault_address:
        return DepositPrepareResponse(
            status="degraded",
            status_code="DATA_MISSING",
            status_label="DATA_MISSING",
            status_reason="ExecutorVault address is not configured.",
            token=req.token,
            amount=req.amount,
            allowance_required=False,
            current_allowance="0",
            spender="",
        )
    if req.token.lower() in ("mnt", "0x0000000000000000000000000000000000000000", "native"):
        return DepositPrepareResponse(
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="Native MNT deposit — no approval needed.",
            token=req.token,
            amount=req.amount,
            allowance_required=False,
            current_allowance="0",
            spender=vault_address,
        )

    try:
        web3 = _web3(settings.effective_http_rpc_url)
        registry = settings.active_portfolio_asset_registry
        asset_data = next(
            (a for a in registry.values() if str(a["symbol"]).lower() == req.token.lower()),
            None,
        )
        if not asset_data or not asset_data.get("address"):
            return DepositPrepareResponse(
                status="degraded",
                status_code="DATA_MISSING",
                status_label="DATA_MISSING",
                status_reason=f"Asset {req.token} not found in registry.",
                token=req.token,
                amount=req.amount,
                allowance_required=False,
                current_allowance="0",
                spender=vault_address,
            )

        token_address = web3.to_checksum_address(str(asset_data["address"]))
        checksum_vault = web3.to_checksum_address(vault_address)

        allowance_abi = [
            {
                "constant": True,
                "inputs": [
                    {"name": "owner", "type": "address"},
                    {"name": "spender", "type": "address"},
                ],
                "name": "allowance",
                "outputs": [{"name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function",
            }
        ]
        token_contract = web3.eth.contract(address=token_address, abi=allowance_abi)

        decimals = int(asset_data.get("decimals", 18))
        try:
            amount_dec = Decimal(req.amount)
            amount_raw = int(amount_dec * (Decimal(10) ** Decimal(decimals)))
        except (InvalidOperation, ValueError):
            amount_raw = 0

        current_allowance_raw = token_contract.functions.allowance(
            web3.to_checksum_address(req.user_address) if req.user_address else "0x0000000000000000000000000000000000000000",
            checksum_vault,
        ).call()

        allowance_required = current_allowance_raw < amount_raw
        current_allowance = _scaled_token_amount(current_allowance_raw, decimals)

        return DepositPrepareResponse(
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="Allowance checked.",
            token=req.token,
            amount=req.amount,
            allowance_required=allowance_required,
            current_allowance=current_allowance,
            spender=vault_address,
        )
    except Exception as exc:
        return DepositPrepareResponse(
            status="degraded",
            status_code="DATA_FALLBACK",
            status_label="DATA_FALLBACK",
            status_reason=f"Allowance check failed: {exc}",
            token=req.token,
            amount=req.amount,
            allowance_required=True,
            current_allowance="0",
            spender=vault_address,
        )


@router.post("/flows/record", response_model=VaultFlowRecordResponse)
async def record_vault_flow(req: VaultFlowRecordRequest) -> VaultFlowRecordResponse:
    settings = get_settings()
    vault_address = settings.executor_vault_address
    if not vault_address:
        raise HTTPException(status_code=400, detail="ExecutorVault address is not configured.")
    if not req.user_address:
        raise HTTPException(status_code=400, detail="user_address is required.")

    flow_type = (req.flow_type or "deposit").strip().lower()
    if flow_type not in {"deposit", "withdrawal", "adjustment"}:
        raise HTTPException(status_code=400, detail="flow_type must be one of: deposit, withdrawal, adjustment.")

    usd_value = req.usd_value
    if usd_value is None:
        prices = []
        try:
            price_bundle = await get_price_service().fetch_latest_prices()
            prices = price_bundle.normalized_snapshots if price_bundle else []
        except Exception as exc:
            logger.warning("Vault flow price lookup failed: %s", exc)

        price_by_symbol = _price_by_symbol_from_snapshots(prices)
        asset_price = price_by_symbol.get(req.asset_symbol.lower())
        if asset_price is None:
            raise HTTPException(
                status_code=400,
                detail=f"usd_value is required when no latest price is available for {req.asset_symbol}.",
            )
        usd_value = _format_decimal(_safe_decimal(req.asset_amount) * asset_price)

    if req.tx_hash:
        try:
            web3 = _web3(settings.effective_http_rpc_url)
            receipt = web3.eth.get_transaction_receipt(req.tx_hash)
            if receipt is not None and receipt.get("status") != 1:
                raise HTTPException(
                    status_code=400,
                    detail="Failed to record flow: Transaction reverted on-chain.",
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Could not verify transaction status on-chain for tx_hash=%s: %s", req.tx_hash, exc)

    flow_id = f"vault_flow_{uuid4().hex}"
    occurred_at = req.occurred_at or utc_now()
    record = VaultFlowRepository().save_flow(
        flow_id=flow_id,
        vault_address=vault_address,
        user_address=req.user_address,
        flow_type=flow_type,
        asset_symbol=req.asset_symbol.upper(),
        asset_address=req.asset_address,
        asset_amount=req.asset_amount,
        usd_value=usd_value or "0",
        tx_hash=req.tx_hash,
        occurred_at=occurred_at,
        metadata=req.metadata,
    )

    try:
        await current_portfolio(wallet_address=req.user_address, force_refresh=True)
        logger.info("Portfolio snapshot refreshed after flow recording for user=%s", req.user_address)
    except Exception as exc:
        logger.warning("Portfolio snapshot refresh after flow recording failed: %s", exc)

    try:
        cache_key = f"dashboard_summary:{req.user_address.lower()}"
        clear_cached(cache_key)
    except Exception as exc:
        logger.warning("Dashboard cache invalidation after flow recording failed: %s", exc)

    return VaultFlowRecordResponse(
        status="ok",
        status_code="DATA_FRESH",
        status_label="DATA_FRESH",
        status_reason="Vault flow recorded.",
        flow_id=record.flow_id,
        vault_address=record.vault_address,
        user_address=record.user_address,
        flow_type=record.flow_type,
        asset_symbol=record.asset_symbol,
        asset_amount=record.asset_amount or req.asset_amount,
        usd_value=record.usd_value,
        tx_hash=record.tx_hash,
        occurred_at=record.occurred_at,
    )


@router.post("/withdraw/prepare", response_model=WithdrawPrepareResponse)
async def withdraw_prepare(req: WithdrawPrepareRequest) -> WithdrawPrepareResponse:
    settings = get_settings()
    vault_address = settings.executor_vault_address
    if not vault_address:
        return WithdrawPrepareResponse(
            status="degraded",
            status_code="DATA_MISSING",
            status_label="DATA_MISSING",
            status_reason="ExecutorVault address is not configured.",
            token=req.token,
            amount=req.amount,
            vault_balance="0",
            sufficient_balance=False,
        )

    try:
        web3 = _web3(settings.effective_http_rpc_url)
        vault_contract = _get_vault_contract(web3, vault_address)
        checksum_user = web3.to_checksum_address(req.user_address)
        token_addr = ZERO_ADDRESS
        decimals = 18

        if req.token.lower() in ("mnt", ZERO_ADDRESS, "native"):
            native_balance_raw = int(vault_contract.functions.getUserBalance(checksum_user, web3.to_checksum_address(ZERO_ADDRESS)).call())
            if native_balance_raw > 0:
                raw_balance = native_balance_raw
                token_addr = ZERO_ADDRESS
            else:
                registry = settings.active_portfolio_asset_registry
                wmnt_asset = next(
                    (a for a in registry.values() if str(a["symbol"]).lower() == "wmnt" and a.get("address")),
                    None,
                )
                if not wmnt_asset:
                    return WithdrawPrepareResponse(
                        status="degraded",
                        status_code="DATA_MISSING",
                        status_label="DATA_MISSING",
                        status_reason="WMNT address is not configured.",
                        token=req.token,
                        amount=req.amount,
                        vault_balance="0",
                        sufficient_balance=False,
                    )
                token_addr = str(wmnt_asset["address"])
                decimals = int(wmnt_asset.get("decimals", 18))
                raw_balance = int(vault_contract.functions.getUserBalance(checksum_user, web3.to_checksum_address(token_addr)).call())
        else:
            registry = settings.active_portfolio_asset_registry
            asset_data = next(
                (a for a in registry.values() if str(a["symbol"]).lower() == req.token.lower()),
                None,
            )
            if not asset_data or not asset_data.get("address"):
                return WithdrawPrepareResponse(
                    status="degraded",
                    status_code="DATA_MISSING",
                    status_label="DATA_MISSING",
                    status_reason=f"Asset {req.token} not found in registry.",
                    token=req.token,
                    amount=req.amount,
                    vault_balance="0",
                    sufficient_balance=False,
                )
            token_addr = str(asset_data["address"])
            decimals = int(asset_data.get("decimals", 18))
            raw_balance = int(vault_contract.functions.getUserBalance(checksum_user, web3.to_checksum_address(token_addr)).call())

        vault_balance_str = _scaled_token_amount(raw_balance, decimals)
        try:
            amount_dec = Decimal(req.amount)
            sufficient = raw_balance >= int(amount_dec * (Decimal(10) ** Decimal(decimals)))
        except (InvalidOperation, ValueError):
            sufficient = False

        return WithdrawPrepareResponse(
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="Vault balance checked.",
            token=req.token,
            amount=req.amount,
            vault_balance=vault_balance_str,
            sufficient_balance=sufficient,
        )
    except Exception as exc:
        logger.warning("Withdraw prepare failed: %s", exc)
        return WithdrawPrepareResponse(
            status="degraded",
            status_code="DATA_FALLBACK",
            status_label="DATA_FALLBACK",
            status_reason=f"Vault balance check failed: {exc}",
            token=req.token,
            amount=req.amount,
            vault_balance="0",
            sufficient_balance=False,
        )
