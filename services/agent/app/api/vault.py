from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from fastapi import APIRouter, HTTPException

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
from services.agent.modules.market_data.balances import Erc20BalanceReader
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
        reader = Erc20BalanceReader(settings.effective_http_rpc_url)
        balances = reader.read_configured_balances(
            portfolio_address=wallet_address,
            asset_registry=settings.active_portfolio_asset_registry,
            chain_id=settings.effective_chain_id,
        )
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
        web3 = _web3(settings.effective_http_rpc_url)
        vault_contract = _get_vault_contract(web3, vault_address)
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

    asset_registry = settings.active_portfolio_asset_registry
    token_addresses: list[str] = []
    token_symbols: list[str] = []
    for asset in asset_registry.values():
        if int(asset["chain_id"]) != settings.effective_chain_id:
            continue
        if not asset.get("verified") or not asset.get("address"):
            continue
        token_addresses.append(str(asset["address"]))
        token_symbols.append(str(asset["symbol"]))

    try:
        checksum_user = web3.to_checksum_address(user_address)
        checksum_tokens = [web3.to_checksum_address(a) for a in token_addresses]
        raw_balances = vault_contract.functions.getUserBalances(checksum_user, checksum_tokens).call()
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
    try:
        price_bundle = await price_service.fetch_latest_prices()
        prices = price_bundle.normalized_snapshots if price_bundle else []
    except Exception:
        prices = []

    price_by_symbol = _price_by_symbol_from_snapshots(prices)

    items: list[VaultBalanceItem] = []
    total_value = Decimal("0")
    for i, symbol in enumerate(token_symbols):
        raw_bal = raw_balances[i]
        if raw_bal == 0:
            continue
        try:
            asset_data = next(
                (a for a in asset_registry.values() if str(a["symbol"]).lower() == symbol.lower()),
                None,
            )
            decimals = int(asset_data.get("decimals", 18)) if asset_data else 18
        except (ValueError, StopIteration):
            decimals = 18

        balance_str = _scaled_token_amount(raw_bal, decimals)
        try:
            bal_dec = Decimal(balance_str) if balance_str else Decimal("0")
        except (InvalidOperation, ValueError):
            bal_dec = Decimal("0")

        sym_lower = symbol.lower()
        price = price_by_symbol.get(sym_lower, Decimal("0"))
        value = bal_dec * price
        total_value += value
        items.append(
            VaultBalanceItem(
                asset_symbol=symbol,
                asset_address=token_addresses[i],
                balance=str(raw_bal),
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
        pnl_usd, pnl_percent = _compute_pnl(total_value, summary.net_invested_usd)
        metadata = _summary_metadata(summary)

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

    if req.token.lower() in ("mnt", "0x0000000000000000000000000000000000000000", "native"):
        token_addr = "0x0000000000000000000000000000000000000000"
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

    try:
        web3 = _web3(settings.effective_http_rpc_url)
        vault_contract = _get_vault_contract(web3, vault_address)
        checksum_user = web3.to_checksum_address(req.user_address)
        checksum_token = web3.to_checksum_address(token_addr)

        raw_balance = vault_contract.functions.getUserBalance(checksum_user, checksum_token).call()

        asset_data = None
        if token_addr == "0x0000000000000000000000000000000000000000":
            decimals = 18
        else:
            registry = settings.active_portfolio_asset_registry
            asset_data = next(
                (a for a in registry.values() if str(a["address"]).lower() == token_addr.lower()),
                None,
            )
            decimals = int(asset_data.get("decimals", 18)) if asset_data else 18

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
