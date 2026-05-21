from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class HermesFetchResponse(BaseModel):
    requested_feed_ids: list[str] = Field(default_factory=list)
    source_url: str
    fetched_at: datetime
    payload: dict


class PythPricePoint(BaseModel):
    feed_id: str
    publish_time: datetime
    price: str
    confidence: str
    exponent: int
