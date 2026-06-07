from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, HTTPException, Response

from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.core.settings import get_settings
from services.agent.app.schemas.portfolio import PortfolioSnapshotHistoryResponse, PortfolioSnapshotResponse
from services.agent.modules.market_data import get_price_service
from services.agent.modules.market_data.balances import Erc20BalanceReader, PortfolioSnapshotEngine, fetch_portfolio_snapshot
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.repositories.db.portfolio_repository import PortfolioSnapshotRepository


logger = logging.getLogger("services.agent.portfolio.api")
router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _resolve_portfolio_address(wallet_address: str | None, *, allow_env_fallback: bool = False) -> str | None:
    settings = get_settings()
    if wallet_address:
        return wallet_address
    if allow_env_fallback:
        return settings.portfolio_wallet_address or settings.executor_vault_address
    return None


def _save_snapshot_best_effort(snapshot: PortfolioSnapshotResponse) -> None:
    try:
        PortfolioSnapshotRepository().save_snapshot(snapshot)
    except Exception as exc:
        logger.warning("Portfolio snapshot persistence failed: %s", exc)


def _save_prices_best_effort(bundle) -> None:
    try:
        MarketDataRepository().save_price_bundle(bundle)
    except Exception as exc:
        logger.warning("Portfolio price persistence failed: %s", exc)


def _decimal_string_value(value: str | None) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _snapshot_is_all_zero(snapshot: PortfolioSnapshotResponse) -> bool:
    if _decimal_string_value(snapshot.total_value_usd) > 0:
        return False
    if not snapshot.positions:
        return True
    return all(
        _decimal_string_value(position.balance) == 0
        and _decimal_string_value(position.value_usd) == 0
        for position in snapshot.positions
    )


def _decimal_or_none(value: str | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(value)
    except (InvalidOperation, TypeError, ValueError):
        return None


def _format_decimal(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value.normalize(), "f")


def _normalize_zero_position(position):
    if _decimal_string_value(position.balance) != 0 or _decimal_string_value(position.value_usd) != 0:
        return position

    target = _decimal_or_none(position.target_weight)
    weight = Decimal("0")
    drift = weight - target if target is not None else None
    drift_status = "not_configured"
    if target is not None:
        drift_status = "within_target" if abs(drift) <= Decimal("0.01") else "drifted"

    return position.model_copy(
        update={
            "value_usd": "0",
            "weight": "0",
            "valuation_status": "valued",
            "status_code": "DATA_FRESH",
            "status_reason": "Zero-balance position valued at 0 without requiring a price snapshot.",
            "weight_drift": _format_decimal(drift),
            "drift_status": drift_status,
        }
    )


def _normalize_zero_snapshot(snapshot: PortfolioSnapshotResponse) -> PortfolioSnapshotResponse:
    if not snapshot.positions or snapshot.status_code == DataStatusCode.DATA_FRESH.value:
        return snapshot
    if not _snapshot_is_all_zero(snapshot):
        return snapshot

    normalized_positions = [_normalize_zero_position(position) for position in snapshot.positions]
    normalized_metadata = dict(snapshot.metadata)
    normalized_metadata.update({"all_positions_valued": True, "demo_normalized": True})
    return snapshot.model_copy(
        update={
            "total_value_usd": "0",
            "positions": normalized_positions,
            "status": "ok",
            "status_code": DataStatusCode.DATA_FRESH.value,
            "status_label": DataStatusCode.DATA_FRESH.value,
            "status_reason": "Zero-balance portfolio normalized for demo readiness.",
            "metadata": normalized_metadata,
        }
    )


@router.get("/current", response_model=PortfolioSnapshotResponse)
async def current_portfolio(wallet_address: str | None = None, allow_env_fallback: bool = False) -> PortfolioSnapshotResponse:
    settings = get_settings()
    portfolio_address = _resolve_portfolio_address(wallet_address, allow_env_fallback=allow_env_fallback)
    if not portfolio_address:
        snapshot = PortfolioSnapshotEngine().build_snapshot(
            balances=[],
            prices=[],
            portfolio_address=None,
            chain_id=settings.effective_chain_id,
            base_currency=settings.portfolio_base_currency,
            target_weights=settings.parsed_portfolio_target_weights,
            missing_reason=(
                "No wallet_address was provided. Backend env fallback is disabled for user-facing portfolio reads."
                if not allow_env_fallback
                else "No wallet_address or backend env fallback address is available."
            ),
        )
        _save_snapshot_best_effort(snapshot)
        return snapshot

    persisted_snapshot = None
    try:
        persisted_snapshot = PortfolioSnapshotRepository().latest_snapshot(portfolio_address=portfolio_address)
    except Exception as exc:
        logger.warning("Portfolio snapshot lookup failed before live refresh: %s", exc)

    try:
        balances = Erc20BalanceReader(settings.effective_http_rpc_url).read_configured_balances(
            portfolio_address=portfolio_address,
            asset_registry=settings.active_portfolio_asset_registry,
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
        price_bundle = None
        try:
            price_bundle = await get_price_service().fetch_latest_prices()
            prices = price_bundle.normalized_snapshots
            _save_prices_best_effort(price_bundle)
        except Exception as exc:
            logger.warning("Live price refresh failed for portfolio valuation: %s", exc)
            persisted_prices = MarketDataRepository().latest_normalized_prices()
            if persisted_prices:
                prices = persisted_prices
                logger.info("Using persisted normalized prices for portfolio valuation after live refresh failure.")
            else:
                logger.warning("No persisted normalized prices were available, continuing with an empty price set.")

    snapshot = PortfolioSnapshotEngine().build_snapshot(
        balances=balances,
        prices=prices,
        portfolio_address=portfolio_address,
        chain_id=settings.effective_chain_id,
        base_currency=settings.portfolio_base_currency,
        target_weights=settings.parsed_portfolio_target_weights,
        missing_reason="No verified asset addresses are configured for portfolio balance reads on the current chain.",
    )

    if (
        persisted_snapshot is not None
        and _snapshot_is_all_zero(snapshot)
        and snapshot.status_code != DataStatusCode.DATA_FRESH.value
        and not _snapshot_is_all_zero(persisted_snapshot)
    ):
        logger.info(
            "Serving persisted portfolio snapshot for %s because live refresh returned zero balances without fresh valuation.",
            portfolio_address,
        )
        merged_metadata = dict(persisted_snapshot.metadata)
        merged_metadata.update(
            {
                "live_refresh_status": snapshot.status_code,
                "live_refresh_reason": snapshot.status_reason,
                "served_from": "persisted_snapshot",
            }
        )
        return persisted_snapshot.model_copy(update={"metadata": merged_metadata})

    _save_snapshot_best_effort(snapshot)
    return snapshot


@router.get("/snapshot", response_model=dict, deprecated=True)
async def legacy_portfolio_snapshot(response: Response) -> dict:
    response.headers["Deprecation"] = "true"
    response.headers["Link"] = '</portfolio/current>; rel="successor-version"'
    snapshot = fetch_portfolio_snapshot(allow_env_fallback=True)
    return {"snapshot": snapshot.model_dump(mode="json")}


@router.get("/snapshots/latest", response_model=PortfolioSnapshotResponse)
def latest_portfolio_snapshot(wallet_address: str | None = None) -> PortfolioSnapshotResponse:
    portfolio_address = _resolve_portfolio_address(wallet_address, allow_env_fallback=False)
    if not portfolio_address:
        raise HTTPException(status_code=400, detail="wallet_address is required for latest portfolio snapshot lookup.")
    try:
        snapshot = PortfolioSnapshotRepository().latest_snapshot(portfolio_address=portfolio_address)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Portfolio snapshot repository unavailable: {exc}") from exc
    if snapshot is None:
        raise HTTPException(status_code=404, detail="No persisted portfolio snapshots are available.")
    return _normalize_zero_snapshot(snapshot)


@router.get("/snapshots", response_model=PortfolioSnapshotHistoryResponse)
def portfolio_snapshot_history(limit: int = 20, wallet_address: str | None = None) -> PortfolioSnapshotHistoryResponse:
    portfolio_address = _resolve_portfolio_address(wallet_address, allow_env_fallback=False)
    if not portfolio_address:
        return PortfolioSnapshotHistoryResponse(
            status="degraded",
            status_code=DataStatusCode.DATA_MISSING.value,
            status_label=DataStatusCode.DATA_MISSING.value,
            status_reason="wallet_address is required for portfolio snapshot history lookup.",
            snapshots=[],
        )
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
