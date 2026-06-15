from __future__ import annotations

import asyncio
import logging
import random
import socket
import ssl
from datetime import UTC, datetime
from urllib.parse import urlparse
from typing import Any

import httpx

from services.agent.app.schemas.oracle import HermesConnectivityProbe, HermesFetchResponse

logger = logging.getLogger("services.agent.oracle.hermes_client")

# Timeouts: a short connect ceiling prevents one slow TCP handshake from
# blocking all in-flight coroutines.  The read timeout is generous enough
# for the Hermes REST response body.
_CONNECT_TIMEOUT = 15.0   # seconds — fail fast if the server is unreachable
_READ_TIMEOUT    = 45.0  # seconds — generous window for Hermes under load

# Retry policy for transient network errors (ConnectTimeout, NetworkError …)
_RETRY_ATTEMPTS    = 3
_RETRY_BASE_DELAY  = 0.5   # seconds
_RETRY_MAX_DELAY   = 8.0   # seconds
_RETRY_JITTER      = 0.3   # ±30 % random jitter on each backoff

# Cap concurrent chunk requests to avoid flooding a slow Hermes endpoint
_CHUNK_SEMAPHORE   = asyncio.Semaphore(2)  # max 2 in-flight chunk requests


class HermesClient:
    def __init__(
        self,
        base_url: str,
        latest_price_path: str,
        timeout: float = _READ_TIMEOUT,
        max_feed_ids_per_request: int = 2,
        retry_attempts: int = _RETRY_ATTEMPTS,
        connect_timeout: float = _CONNECT_TIMEOUT,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.latest_price_path = latest_price_path
        self.timeout = timeout
        self.connect_timeout = connect_timeout
        self.max_feed_ids_per_request = max(1, max_feed_ids_per_request)
        self.retry_attempts = max(1, retry_attempts)

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
        chunks = [
            feed_ids[i : i + self.max_feed_ids_per_request]
            for i in range(0, len(feed_ids), self.max_feed_ids_per_request)
        ]
        # Use a single shared AsyncClient across all chunks in one call so
        # the underlying connection pool is reused rather than re-established.
        http_timeout = httpx.Timeout(connect=self.connect_timeout, read=self.timeout, write=5.0, pool=5.0)
        async with httpx.AsyncClient(timeout=http_timeout) as client:
            responses = await asyncio.gather(
                *(self._fetch_chunk_with_retry(client, chunk) for chunk in chunks)
            )
        return self._merge_payloads(responses)

    async def _fetch_chunk_with_retry(
        self,
        client: httpx.AsyncClient,
        feed_ids: list[str],
    ) -> dict[str, Any]:
        """Fetch one chunk of feed IDs with exponential backoff on transient errors."""
        async with _CHUNK_SEMAPHORE:
            return await self._with_retry(client, feed_ids)

    async def _with_retry(
        self,
        client: httpx.AsyncClient,
        feed_ids: list[str],
    ) -> dict[str, Any]:
        last_exc: Exception | None = None
        for attempt in range(self.retry_attempts):
            try:
                return await self._fetch_chunk(client, feed_ids)
            except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError) as exc:
                last_exc = exc
                if attempt + 1 >= self.retry_attempts:
                     break
                # Exponential backoff: 0.5 s, 1 s, 2 s … capped at _RETRY_MAX_DELAY
                base = min(_RETRY_BASE_DELAY * (2 ** attempt), _RETRY_MAX_DELAY)
                jitter = base * _RETRY_JITTER * (random.random() * 2 - 1)  # ±jitter %
                delay = max(0.0, base + jitter)
                logger.warning(
                    "Hermes chunk fetch attempt %d/%d failed (%s: %r) — retrying in %.2f s",
                    attempt + 1,
                    self.retry_attempts,
                    type(exc).__name__,
                    exc,
                    delay,
                )
                await asyncio.sleep(delay)
            except httpx.HTTPStatusError as exc:
                # 4xx/5xx — don't retry, propagate immediately
                logger.warning(
                    "Hermes returned HTTP %d for feed chunk — not retrying.",
                    exc.response.status_code,
                )
                raise
            except Exception as exc:
                # Unexpected error — log and propagate without retry
                logger.warning("Hermes unexpected error (%s): %r", type(exc).__name__, exc)
                raise

        logger.warning(
            "Hermes chunk fetch failed after %d attempts: %s: %r",
            self.retry_attempts,
            type(last_exc).__name__,
            last_exc,
        )
        raise last_exc  # type: ignore[misc]

    async def _fetch_chunk(self, client: httpx.AsyncClient, feed_ids: list[str]) -> dict[str, Any]:
        params = [(("ids[]"), feed_id) for feed_id in feed_ids]
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
            with socket.create_connection((host, port), timeout=self.connect_timeout):
                tcp_ok = True
        except Exception as exc:
            error = f"tcp:{exc}"

        if parsed.scheme == "https" and tcp_ok:
            try:
                ctx = ssl.create_default_context()
                with socket.create_connection((host, port), timeout=self.connect_timeout) as sock:
                    with ctx.wrap_socket(sock, server_hostname=host):
                        tls_ok = True
            except Exception as exc:
                error = f"tls:{exc}"
        elif parsed.scheme != "https" and tcp_ok:
            tls_ok = True

        if tcp_ok:
            try:
                http_timeout = httpx.Timeout(connect=self.connect_timeout, read=self.timeout, write=5.0, pool=5.0)
                async with httpx.AsyncClient(timeout=http_timeout) as client:
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

