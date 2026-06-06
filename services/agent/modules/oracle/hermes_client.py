from __future__ import annotations

import asyncio
import socket
import ssl
from datetime import UTC, datetime
from urllib.parse import urlparse
from typing import Any

import httpx

from services.agent.app.schemas.oracle import HermesConnectivityProbe, HermesFetchResponse


class HermesClient:
    def __init__(self, base_url: str, latest_price_path: str, timeout: float = 20.0, max_feed_ids_per_request: int = 2) -> None:
        self.base_url = base_url.rstrip("/")
        self.latest_price_path = latest_price_path
        self.timeout = timeout
        self.max_feed_ids_per_request = max(1, max_feed_ids_per_request)

    async def fetch_latest_price_updates(self, feed_ids: list[str]) -> HermesFetchResponse:
        if not feed_ids:
            return HermesFetchResponse(
                requested_feed_ids=[],
                source_url=f"{self.base_url}{self.latest_price_path}",
                fetched_at=datetime.now(UTC),
                payload={},
            )

        payload = await self._fetch_latest_price_payload(feed_ids)

        return HermesFetchResponse(
            requested_feed_ids=feed_ids,
            source_url=f"{self.base_url}{self.latest_price_path}",
            fetched_at=datetime.now(UTC),
            payload=payload,
        )

    async def _fetch_latest_price_payload(self, feed_ids: list[str]) -> dict[str, Any]:
        chunks = [feed_ids[i : i + self.max_feed_ids_per_request] for i in range(0, len(feed_ids), self.max_feed_ids_per_request)]
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            responses = await asyncio.gather(*(self._fetch_chunk(client, chunk) for chunk in chunks))
        return self._merge_payloads(responses)

    async def _fetch_chunk(self, client: httpx.AsyncClient, feed_ids: list[str]) -> dict[str, Any]:
        params = [("ids[]", feed_id) for feed_id in feed_ids]
        params.append(("parsed", "true"))
        response = await client.get(f"{self.base_url}{self.latest_price_path}", params=params)
        response.raise_for_status()
        return response.json()

    @staticmethod
    def _merge_payloads(payloads: list[dict[str, Any]]) -> dict[str, Any]:
        merged: dict[str, Any] = {}
        parsed_entries: list[dict[str, Any]] = []
        price_feed_entries: list[dict[str, Any]] = []
        other_keys: dict[str, Any] = {}

        for payload in payloads:
            for key, value in payload.items():
                if key == "parsed" and isinstance(value, list):
                    parsed_entries.extend(entry for entry in value if isinstance(entry, dict))
                elif key == "price_feeds" and isinstance(value, list):
                    price_feed_entries.extend(entry for entry in value if isinstance(entry, dict))
                elif key not in {"parsed", "price_feeds"} and key not in other_keys:
                    other_keys[key] = value

        merged.update(other_keys)
        if parsed_entries:
            merged["parsed"] = parsed_entries
        if price_feed_entries:
            merged["price_feeds"] = price_feed_entries
        return merged

    async def probe_connectivity(self) -> HermesConnectivityProbe:
        checked_at = datetime.now(UTC)
        parsed = urlparse(self.base_url)
        host = parsed.hostname or self.base_url
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        resolved_ips: list[str] = []
        dns_ok = tcp_ok = tls_ok = http_ok = False
        http_status: int | None = None
        error: str | None = None

        try:
            resolved_ips = sorted({info[4][0] for info in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)})
            dns_ok = bool(resolved_ips)
        except Exception as exc:
            error = f"dns:{exc}"

        try:
            with socket.create_connection((host, port), timeout=self.timeout):
                tcp_ok = True
        except Exception as exc:
            error = f"tcp:{exc}"

        if parsed.scheme == "https" and tcp_ok:
            try:
                ctx = ssl.create_default_context()
                with socket.create_connection((host, port), timeout=self.timeout) as sock:
                    with ctx.wrap_socket(sock, server_hostname=host):
                        tls_ok = True
            except Exception as exc:
                error = f"tls:{exc}"
        elif parsed.scheme != "https" and tcp_ok:
            tls_ok = True

        if tcp_ok:
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.get(f"{self.base_url}{self.latest_price_path}", params={"parsed": "true"})
                    http_status = response.status_code
                    http_ok = response.is_success
            except Exception as exc:
                error = f"http:{exc}"

        return HermesConnectivityProbe(
            base_url=self.base_url,
            host=host,
            resolved_ips=resolved_ips,
            dns_ok=dns_ok,
            tcp_ok=tcp_ok,
            tls_ok=tls_ok,
            http_ok=http_ok,
            http_status=http_status,
            error=error,
            checked_at=checked_at,
        )
