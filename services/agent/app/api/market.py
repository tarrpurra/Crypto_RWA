from __future__ import annotations

from fastapi import APIRouter, HTTPException

from services.agent.app.schemas.market_data import LatestPricesResponse, MarketIngestionStatusResponse, NormalizedPriceSnapshot
from services.agent.modules.market_data import PRICE_SNAPSHOT_STORE, get_price_service
from services.agent.modules.oracle.freshness import utc_now


router = APIRouter(prefix="/market", tags=["market"])


@router.get("/prices/latest", response_model=LatestPricesResponse)
async def latest_prices() -> LatestPricesResponse:
    service = get_price_service()
    bundle = await service.fetch_latest_prices()
    PRICE_SNAPSHOT_STORE.write(bundle)

    status_code = "DATA_FRESH"
    status = "ok"
    status_reason = "Latest price snapshots fetched successfully."
    if any(snapshot.status_code != "ORACLE_FRESH" for snapshot in bundle.normalized_snapshots):
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

    for snapshot in bundle.normalized_snapshots:
        if snapshot.asset_symbol.lower() == asset_symbol.lower() or snapshot.asset_key.lower() == asset_symbol.lower():
            return snapshot

    raise HTTPException(status_code=404, detail=f"Unknown asset symbol: {asset_symbol}")


@router.get("/ingestion/status", response_model=MarketIngestionStatusResponse)
async def ingestion_status() -> MarketIngestionStatusResponse:
    service = get_price_service()
    asset_statuses = service.ingestion_status()

    overall_status_code = "DATA_FRESH"
    overall_status = "ok"
    overall_reason = "All configured market-data inputs are ready."
    if any(not status.configured for status in asset_statuses):
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
