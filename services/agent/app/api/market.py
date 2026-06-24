from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Query

from services.agent.app.core.cache import get_cache, market_cache, set_cache
from services.agent.app.schemas.market_data import LatestPricesResponse, MarketIngestionStatusResponse, NormalizedPriceSnapshot, PriceHistoryPoint, PriceHistoryResponse
from services.agent.app.core.status_codes import TargetChain
from services.agent.app.schemas.oracle import OndoUsdyOracleStatus
from services.agent.app.schemas.quotes import LatestQuotesResponse, NormalizedQuoteSnapshot, RoutesResponse
from services.agent.modules.market_data import PRICE_SNAPSHOT_STORE, QUOTE_SNAPSHOT_STORE, get_price_service
from services.agent.modules.oracle import get_ondo_usdy_oracle_adapter
from services.agent.modules.oracle.freshness import utc_now
from services.agent.modules.quotes import get_quote_service
from services.agent.repositories.db.market_repository import MarketDataRepository


logger = logging.getLogger("services.agent.market_data.api")
router = APIRouter(prefix="/market", tags=["market"])
_MARKET_PRICES_CACHE_KEY = "market:prices:latest"
_MARKET_QUOTES_CACHE_KEY = "market:quotes:latest"


def _is_expected_sepolia_price(snapshot: NormalizedPriceSnapshot) -> bool:
    return snapshot.freshness_status == "simulation_only"


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


def _quote_response_from_snapshots(
    quotes: list[NormalizedQuoteSnapshot],
    *,
    reason_if_empty: str,
    target_chain: TargetChain,
) -> LatestQuotesResponse:
    status_code = "QUOTE_FRESH"
    status = "ok"
    status_reason = "Latest quote snapshots sampled successfully."
    if not quotes:
        if target_chain == TargetChain.MANTLE_SEPOLIA:
            status_reason = "No live Sepolia quote routes are configured for the active testnet assets."
        else:
            status_code = "DATA_MISSING"
            status = "degraded"
            status_reason = reason_if_empty
    elif any(snapshot.amount_out is None for snapshot in quotes):
        if target_chain == TargetChain.MANTLE_SEPOLIA:
            status_reason = "Sepolia quote surfaces are visible, but live sampling is still verification-gated."
        else:
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
    cached = get_cache(market_cache, _MARKET_PRICES_CACHE_KEY)
    if cached is not None:
        return cached
    service = get_price_service()
    prices = MarketDataRepository().latest_normalized_prices(include_null_prices=True)
    if not prices:
        return LatestPricesResponse(
            status="degraded",
            status_code="DATA_MISSING",
            status_label="DATA_MISSING",
            status_reason="No persisted price snapshots are available yet. Run a market refresh job first.",
            generated_at=utc_now(),
            prices=[],
        )
    status_code = "DATA_FRESH"
    status = "ok"
    status_reason = "Latest persisted price snapshots loaded."
    has_unhealthy_snapshot = any(
        snapshot.status_code not in {"DATA_FRESH", "ORACLE_FRESH", "QUOTE_FRESH"}
        and not (
            service.settings.target_chain == TargetChain.MANTLE_SEPOLIA
            and _is_expected_sepolia_price(snapshot)
        )
        for snapshot in prices
    )
    if has_unhealthy_snapshot:
        status_code = "DATA_PARTIAL"
        status = "degraded"
        status_reason = "Persisted price snapshots are available, but at least one asset is stale or degraded."
    response = LatestPricesResponse(
        status=status,
        status_code=status_code,
        status_label=status_code,
        status_reason=status_reason,
        generated_at=utc_now(),
        prices=prices,
    )
    set_cache(market_cache, _MARKET_PRICES_CACHE_KEY, response)
    return response


@router.get("/prices/{asset_symbol}", response_model=NormalizedPriceSnapshot)
async def latest_price_for_asset(asset_symbol: str) -> NormalizedPriceSnapshot:
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
    cached = get_cache(market_cache, _MARKET_QUOTES_CACHE_KEY)
    if cached is not None:
        return cached
    service = get_quote_service()
    quotes = MarketDataRepository().latest_normalized_quotes()
    response = _quote_response_from_snapshots(
        quotes,
        reason_if_empty="No persisted quote snapshots are available yet. Run a market refresh job first.",
        target_chain=service.settings.target_chain,
    )
    set_cache(market_cache, _MARKET_QUOTES_CACHE_KEY, response)
    return response


@router.get("/quotes/{token_in}/{token_out}", response_model=LatestQuotesResponse)
async def latest_quotes_for_pair(token_in: str, token_out: str) -> LatestQuotesResponse:
    service = get_quote_service()
    quotes = MarketDataRepository().latest_normalized_quotes_for_pair(token_in, token_out)
    return _quote_response_from_snapshots(
        quotes,
        reason_if_empty=f"No quote routes are currently discoverable for {token_in}/{token_out} on the configured target chain.",
        target_chain=service.settings.target_chain,
    )


@router.get("/quotes/{token_in}/{token_out}/best", response_model=NormalizedQuoteSnapshot)
async def best_quote_for_pair(token_in: str, token_out: str) -> NormalizedQuoteSnapshot:
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
    status_code = "DATA_FRESH"
    status = "ok"
    status_reason = "Discovered route descriptors from configured protocol surfaces."
    if not routes:
        if service.settings.target_chain == TargetChain.MANTLE_SEPOLIA:
            status_reason = "No Sepolia route descriptors are configured for the active testnet assets."
        else:
            status_code = "DATA_MISSING"
            status = "degraded"
            status_reason = "No configured route descriptors are available for the current target chain."
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
    has_unhealthy_input = any(
        not status.configured
        or (
            status.status != "ok"
            and not (
                service.settings.target_chain == TargetChain.MANTLE_SEPOLIA
                and status.status == "simulation_only"
            )
        )
        for status in asset_statuses
    )
    if has_unhealthy_input:
        overall_status_code = "DATA_PARTIAL"
        overall_status = "degraded"
        overall_reason = "Some market-data inputs are still missing or unverified."
    elif service.settings.target_chain == TargetChain.MANTLE_SEPOLIA and asset_statuses:
        overall_reason = "Sepolia market-data inputs are active with testnet-safe sources."

    return MarketIngestionStatusResponse(
        status=overall_status,
        status_code=overall_status_code,
        status_label=overall_status_code,
        status_reason=overall_reason,
        generated_at=utc_now(),
        assets=asset_statuses,
    )


@router.get("/price-history", response_model=PriceHistoryResponse)
async def price_history(
    asset: str = Query(..., description="Asset symbol (e.g. mETH, USDY, WMNT)"),
    time_range: str = Query("24h", alias="range", description="Time range: 1h, 6h, 24h, 7d"),
    bucket: str = Query("1h", description="Bucket size: 1m, 5m, 15m, 1h, 6h"),
) -> PriceHistoryResponse:
    range_seconds = {"1h": 3600, "6h": 21_600, "24h": 86_400, "7d": 604_800}
    bucket_seconds = {"1m": 1, "5m": 5, "15m": 15, "1h": 60, "6h": 360}

    range_hours = int(range_seconds.get(time_range, 86_400) / 3600)
    bucket_minutes = bucket_seconds.get(bucket, 60)

    try:
        repo = MarketDataRepository()
        points = repo.price_history(asset, range_hours=range_hours, bucket_minutes=bucket_minutes)
    except Exception as exc:
        logger.warning("Price history query failed: %s", exc)
        points = []

    demo = len(points) < 2
    if demo:
        import math
        now = utc_now()
        base_price = {
            "meth": 1835.0,
            "usdy": 1.02,
            "wmnt": 0.82,
            "mnt": 0.82,
        }.get(asset.lower(), 100.0)
        points = []
        buckets_count = {"1h": 1, "6h": 6, "24h": 24, "7d": 168}.get(time_range, 24)
        for i in range(buckets_count):
            t = now - timedelta(hours=(buckets_count - i - 1) * range_hours / max(buckets_count, 1))
            noise = base_price * 0.02 * math.sin(i * 0.5) + base_price * 0.005 * (i % 3 - 1)
            p = base_price + noise
            points.append(
                PriceHistoryPoint(
                    time=t,
                    open=p - 2,
                    high=p + 5,
                    low=p - 3,
                    close=p + 1,
                    avg=p,
                    samples=60,
                )
            )

    return PriceHistoryResponse(
        status="ok",
        status_code="DATA_FRESH",
        status_label="DATA_FRESH",
        status_reason="Price history retrieved successfully."
        if not demo
        else "Demo mode: showing simulated price history.",
        asset=asset,
        range=time_range,
        bucket=bucket,
        points=points,
        demo=demo,
    )
