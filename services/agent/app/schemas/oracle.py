from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class HermesFetchResponse(BaseModel):
    requested_feed_ids: list[str] = Field(default_factory=list)
    source_url: str
    fetched_at: datetime
    payload: dict


class HermesConnectivityProbe(BaseModel):
    base_url: str
    host: str
    resolved_ips: list[str] = Field(default_factory=list)
    dns_ok: bool
    tcp_ok: bool
    tls_ok: bool
    http_ok: bool
    http_status: int | None = None
    error: str | None = None
    checked_at: datetime


class PythPricePoint(BaseModel):
    feed_id: str
    publish_time: datetime
    price: str
    confidence: str
    exponent: int


class OndoUsdyOracleStatus(BaseModel):
    asset: str
    source: str
    chain_id: int = Field(serialization_alias="chainId")
    address: str
    price: str | None = None
    scale: str | None = None
    updated_at: datetime | None = Field(default=None, serialization_alias="updatedAt")
    ingested_at: datetime = Field(serialization_alias="ingestedAt")
    status: str
