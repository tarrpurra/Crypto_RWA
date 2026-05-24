from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.core.settings import get_settings
from services.agent.app.schemas.portfolio import PortfolioSnapshotHistoryResponse, PortfolioSnapshotResponse
from services.agent.modules.market_data import get_price_service
from services.agent.modules.market_data.balances import Erc20BalanceReader, PortfolioSnapshotEngine
from services.agent.repositories.db.portfolio_repository import PortfolioSnapshotRepository


logger = logging.getLogger("services.agent.portfolio.api")
router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _save_snapshot_best_effort(snapshot: PortfolioSnapshotResponse) -> None:
    try:
        PortfolioSnapshotRepository().save_snapshot(snapshot)
    except Exception as exc:
        logger.warning("Portfolio snapshot persistence failed: %s", exc)


@router.get("/current", response_model=PortfolioSnapshotResponse)
async def current_portfolio() -> PortfolioSnapshotResponse:
    settings = get_settings()
    portfolio_address = settings.portfolio_wallet_address or settings.executor_vault_address
    if not portfolio_address:
        snapshot = PortfolioSnapshotEngine().build_snapshot(
            balances=[],
            prices=[],
            portfolio_address=None,
            chain_id=settings.effective_chain_id,
            base_currency=settings.portfolio_base_currency,
            target_weights=settings.parsed_portfolio_target_weights,
            missing_reason="No portfolio wallet or executor vault address is configured for balance reads.",
        )
        _save_snapshot_best_effort(snapshot)
        return snapshot

    try:
        balances = Erc20BalanceReader(settings.effective_http_rpc_url).read_configured_balances(
            portfolio_address=portfolio_address,
            asset_registry=settings.asset_registry,
            chain_id=settings.effective_chain_id,
        )
    except Exception as exc:
        snapshot = PortfolioSnapshotEngine().build_snapshot(
            balances=[],
            prices=[],
            portfolio_address=portfolio_address,
            chain_id=settings.effective_chain_id,
            base_currency=settings.portfolio_base_currency,
            target_weights=settings.parsed_portfolio_target_weights,
            missing_reason=f"Portfolio balance source could not be initialized: {exc}",
        )
        _save_snapshot_best_effort(snapshot)
        return snapshot

    prices = []
    if balances:
        price_bundle = await get_price_service().fetch_latest_prices()
        prices = price_bundle.normalized_snapshots

    snapshot = PortfolioSnapshotEngine().build_snapshot(
        balances=balances,
        prices=prices,
        portfolio_address=portfolio_address,
        chain_id=settings.effective_chain_id,
        base_currency=settings.portfolio_base_currency,
        target_weights=settings.parsed_portfolio_target_weights,
        missing_reason="No verified asset addresses are configured for portfolio balance reads on the current chain.",
    )
    _save_snapshot_best_effort(snapshot)
    return snapshot


@router.get("/snapshots/latest", response_model=PortfolioSnapshotResponse)
def latest_portfolio_snapshot() -> PortfolioSnapshotResponse:
    settings = get_settings()
    portfolio_address = settings.portfolio_wallet_address or settings.executor_vault_address
    try:
        snapshot = PortfolioSnapshotRepository().latest_snapshot(portfolio_address=portfolio_address)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Portfolio snapshot repository unavailable: {exc}") from exc
    if snapshot is None:
        raise HTTPException(status_code=404, detail="No persisted portfolio snapshots are available.")
    return snapshot


@router.get("/snapshots", response_model=PortfolioSnapshotHistoryResponse)
def portfolio_snapshot_history(limit: int = 20) -> PortfolioSnapshotHistoryResponse:
    settings = get_settings()
    portfolio_address = settings.portfolio_wallet_address or settings.executor_vault_address
    safe_limit = max(1, min(limit, 100))
    try:
        snapshots = PortfolioSnapshotRepository().recent_snapshots(portfolio_address=portfolio_address, limit=safe_limit)
    except Exception as exc:
        return PortfolioSnapshotHistoryResponse(
            status="degraded",
            status_code=DataStatusCode.DATA_MISSING.value,
            status_label=DataStatusCode.DATA_MISSING.value,
            status_reason=f"Portfolio snapshot repository unavailable: {exc}",
            snapshots=[],
        )
    status_code = DataStatusCode.DATA_FRESH.value if snapshots else DataStatusCode.DATA_MISSING.value
    return PortfolioSnapshotHistoryResponse(
        status="ok" if snapshots else "degraded",
        status_code=status_code,
        status_label=status_code,
        status_reason="Recent portfolio snapshots loaded." if snapshots else "No persisted portfolio snapshots are available.",
        snapshots=snapshots,
    )
