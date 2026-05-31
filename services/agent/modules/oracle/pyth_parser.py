from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any


@dataclass(frozen=True)
class PythPriceObservation:
    feed_id: str
    publish_time: datetime
    price: Decimal
    confidence: Decimal
    exponent: int


def _scaled_decimal(value: Any, exponent: int) -> Decimal:
    return Decimal(str(value)) * (Decimal(10) ** exponent)


def _extract_entries(payload: dict[str, Any]) -> list[dict[str, Any]]:
    entries = payload.get("parsed")
    if isinstance(entries, list):
        return [entry for entry in entries if isinstance(entry, dict)]
    entries = payload.get("price_feeds")
    if isinstance(entries, list):
        return [entry for entry in entries if isinstance(entry, dict)]
    return []


def _normalize_feed_id(feed_id: Any) -> str:
    return str(feed_id or "").removeprefix("0x").lower()


def parse_hermes_price_update(payload: dict[str, Any], feed_id: str) -> PythPriceObservation:
    expected_feed_id = _normalize_feed_id(feed_id)
    for entry in _extract_entries(payload):
        entry_feed_id = entry.get("id") or entry.get("price_feed", {}).get("id")
        if _normalize_feed_id(entry_feed_id) != expected_feed_id:
            continue

        price_block = entry.get("price") or entry.get("price_feed", {}).get("price")
        if not isinstance(price_block, dict):
            break

        exponent = int(price_block["expo"])
        publish_time = datetime.fromtimestamp(int(price_block["publish_time"]), UTC)
        price = _scaled_decimal(price_block["price"], exponent)
        confidence = _scaled_decimal(price_block["conf"], exponent)
        return PythPriceObservation(
            feed_id=feed_id,
            publish_time=publish_time,
            price=price,
            confidence=confidence,
            exponent=exponent,
        )

    raise ValueError(f"No parseable Hermes update found for feed id {feed_id}.")
