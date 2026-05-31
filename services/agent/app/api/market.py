from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from services.agent.app.schemas.market_data import LatestPricesResponse, MarketIngestionStatusResponse, NormalizedPriceSnapshot
from services.agent.app.schemas.oracle import OndoUsdyOracleStatus
from services.agent.app.schemas.quotes import LatestQuotesResponse, NormalizedQuoteSnapshot, RoutesResponse
from services.agent.modules.market_data import PRICE_SNAPSHOT_STORE, QUOTE_SNAPSHOT_STORE, get_price_service
from services.agent.modules.oracle import get_ondo_usdy_oracle_adapter
from services.agent.modules.oracle.freshness import utc_now
from services.agent.modules.quotes import get_quote_service
from services.agent.repositories.db.market_repository import MarketDataRepository


logger = logging.getLogger("services.agent.market_data.api")
router = APIRouter(prefix="/market", tags=["market"])


def _save_prices_best_effort(bundle) -> None:
    try:
        MarketDataRepository().save_price_bundle(bundle)
    except Exception as exc:
        logger.warning("Price snapshot persistence failed: %s", exc)


def _save_quotes_best_effort(bundle) -> None:
    try:
        MarketDataRepository().save_quote_bundle(bundle)
    except Exception as exc:
        logger.warning("Quote snapshot persistence failed: %s", exc)


def _quote_response_from_snapshots(quotes: list[NormalizedQuoteSnapshot], *, reason_if_empty: str) -> LatestQuotesResponse:
    status_code = "QUOTE_FRESH"
    status = "ok"
    status_reason = "Latest quote snapshots sampled successfully."
    if not quotes:
        status_code = "DATA_MISSING"
        status = "degraded"
        status_reason = reason_if_empty
    elif any(snapshot.amount_out is None for snapshot in quotes):
        status_code = "LIQUIDITY_UNKNOWN"
        status = "degraded"
        status_reason = "Quote surfaces are configured, but live sampling is still verification-gated."

    return LatestQuotesResponse(
        status=status,
        status_code=status_code,
        status_label=status_code,
        status_reason=status_reason,
        generated_at=utc_now(),
        quotes=quotes,
    )


@router.get("/prices/latest", response_model=LatestPricesResponse)
async def latest_prices() -> LatestPricesResponse:
    service = get_price_service()
    bundle = await service.fetch_latest_prices()
    PRICE_SNAPSHOT_STORE.write(bundle)
    _save_prices_best_effort(bundle)

    status_code = "DATA_FRESH"
    status = "ok"
    status_reason = "Latest price snapshots fetched successfully."
    if any(snapshot.status_code not in {"DATA_FRESH", "ORACLE_FRESH", "QUOTE_FRESH"} for snapshot in bundle.normalized_snapshots):
        status_code = "DATA_PARTIAL"
        status = "degraded"
        status_reason = "At least one asset is missing, unverified, or stale."

    return LatestPricesResponse(
        status=status,
        status_code=status_code,
        status_label=status_code,
        status_reason=status_reason,
        generated_at=utc_now(),
        prices=bundle.normalized_snapshots,
    )


@router.get("/prices/{asset_symbol}", response_model=NormalizedPriceSnapshot)
async def latest_price_for_asset(asset_symbol: str) -> NormalizedPriceSnapshot:
    service = get_price_service()
    bundle = await service.fetch_latest_prices()
    PRICE_SNAPSHOT_STORE.write(bundle)
    _save_prices_best_effort(bundle)

    for snapshot in bundle.normalized_snapshots:
        if snapshot.asset_symbol.lower() == asset_symbol.lower() or snapshot.asset_key.lower() == asset_symbol.lower():
            return snapshot

    try:
        persisted = MarketDataRepository().latest_normalized_price_for_asset(asset_symbol)
        if persisted is not None:
            return persisted
    except Exception as exc:
        logger.warning("Price snapshot lookup failed: %s", exc)

    raise HTTPException(status_code=404, detail=f"Unknown asset symbol: {asset_symbol}")


@router.get("/oracles/usdy", response_model=OndoUsdyOracleStatus)
def latest_usdy_oracle_status() -> OndoUsdyOracleStatus:
    return get_ondo_usdy_oracle_adapter().read().status


@router.get("/quotes/latest", response_model=LatestQuotesResponse)
async def latest_quotes() -> LatestQuotesResponse:
    service = get_quote_service()
    bundle = service.sample_latest_quotes()
    QUOTE_SNAPSHOT_STORE.write(bundle)
    _save_quotes_best_effort(bundle)
    return _quote_response_from_snapshots(
        bundle.normalized_snapshots,
        reason_if_empty="No quote routes are currently discoverable for the configured target chain.",
    )


@router.get("/quotes/{token_in}/{token_out}", response_model=LatestQuotesResponse)
def latest_quotes_for_pair(token_in: str, token_out: str) -> LatestQuotesResponse:
    service = get_quote_service()
    quotes = service.latest_quotes_for_pair(token_in, token_out)
    return _quote_response_from_snapshots(
        quotes,
        reason_if_empty=f"No quote routes are currently discoverable for {token_in}/{token_out} on the configured target chain.",
    )


@router.get("/quotes/{token_in}/{token_out}/best", response_model=NormalizedQuoteSnapshot)
def best_quote_for_pair(token_in: str, token_out: str) -> NormalizedQuoteSnapshot:
    service = get_quote_service()
    best_quote = service.best_quote_for_pair(token_in, token_out)
    if best_quote is not None:
        return best_quote

    try:
        persisted = MarketDataRepository().latest_best_quote_for_pair(token_in, token_out)
        if persisted is not None:
            return persisted
    except Exception as exc:
        logger.warning("Best quote lookup failed: %s", exc)

    raise HTTPException(status_code=404, detail=f"No quote route available for {token_in}/{token_out}")


@router.get("/routes", response_model=RoutesResponse)
async def market_routes() -> RoutesResponse:
    service = get_quote_service()
    routes = service.discover_routes()
    status_code = "DATA_FRESH" if routes else "DATA_MISSING"
    status = "ok" if routes else "degraded"
    status_reason = "Discovered route descriptors from configured protocol surfaces." if routes else "No configured route descriptors are available for the current target chain."
    return RoutesResponse(
        status=status,
        status_code=status_code,
        status_label=status_code,
        status_reason=status_reason,
        generated_at=utc_now(),
        routes=routes,
    )


@router.get("/ingestion/status", response_model=MarketIngestionStatusResponse)
async def ingestion_status() -> MarketIngestionStatusResponse:
    service = get_price_service()
    asset_statuses = service.ingestion_status()

    overall_status_code = "DATA_FRESH"
    overall_status = "ok"
    overall_reason = "All configured market-data inputs are ready."
    if any(not status.configured or status.status != "ok" for status in asset_statuses):
        overall_status_code = "DATA_PARTIAL"
        overall_status = "degraded"
        overall_reason = "Some market-data inputs are still missing or unverified."

    return MarketIngestionStatusResponse(
        status=overall_status,
        status_code=overall_status_code,
        status_label=overall_status_code,
        status_reason=overall_reason,
        generated_at=utc_now(),
        assets=asset_statuses,
    )
