from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx

from services.agent.app.schemas.oracle import HermesFetchResponse


class HermesClient:
    def __init__(self, base_url: str, latest_price_path: str, timeout: float = 10.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.latest_price_path = latest_price_path
        self.timeout = timeout

    async def fetch_latest_price_updates(self, feed_ids: list[str]) -> HermesFetchResponse:
        if not feed_ids:
            return HermesFetchResponse(
                requested_feed_ids=[],
                source_url=f"{self.base_url}{self.latest_price_path}",
                fetched_at=datetime.now(UTC),
                payload={},
            )

        params = [("ids[]", feed_id) for feed_id in feed_ids]
        params.append(("parsed", "true"))

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.base_url}{self.latest_price_path}", params=params)
            response.raise_for_status()
            payload: dict[str, Any] = response.json()

        return HermesFetchResponse(
            requested_feed_ids=feed_ids,
            source_url=str(response.request.url),
            fetched_at=datetime.now(UTC),
            payload=payload,
        )
