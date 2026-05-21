from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AssetMetadata(BaseModel):
    asset_key: str
    symbol: str
    chain_id: int
    address: str | None
    verified: bool
    price_strategy: str
    primary_reference_source: str
    dex_quote_required: bool
    pyth_feed_id: str | None = None
    ratio_feed_id: str | None = None
    ondo_oracle_address: str | None = None


class RawPriceSnapshot(BaseModel):
    snapshot_id: str
    asset_key: str
    asset_symbol: str
    asset_address: str | None
    chain_id: int
    feed_id: str | None
    source: str
    source_url: str | None
    raw_payload_json: dict[str, Any] = Field(default_factory=dict)
    fetch_timestamp: datetime
    publish_timestamp: datetime | None = None
    price_raw: str | None = None
    confidence_raw: str | None = None
    exponent: int | None = None
    status: str
    status_code: str
    status_reason: str


class NormalizedPriceSnapshot(BaseModel):
    snapshot_id: str
    asset_key: str
    asset_symbol: str
    asset_address: str | None
    chain_id: int
    price_usd: str | None = None
    confidence_interval_usd: str | None = None
    publish_timestamp: datetime | None = None
    observed_timestamp: datetime
    age_seconds: int | None = None
    freshness_status: str
    status_code: str
    status_reason: str
    derivation_method: str | None = None
    data_sources_used: list[str] = Field(default_factory=list)
    raw_snapshot_ids: list[str] = Field(default_factory=list)


class LatestPricesResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    prices: list[NormalizedPriceSnapshot] = Field(default_factory=list)


class AssetIngestionStatus(BaseModel):
    asset_key: str
    asset_symbol: str
    configured: bool
    status: str
    status_code: str
    status_reason: str
    required_sources: list[str] = Field(default_factory=list)


class MarketIngestionStatusResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    assets: list[AssetIngestionStatus] = Field(default_factory=list)
