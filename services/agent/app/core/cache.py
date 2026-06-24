from __future__ import annotations

from collections.abc import MutableMapping
from threading import RLock
from typing import Any

from cachetools import TTLCache


_CACHE_LOCK = RLock()

portfolio_cache: TTLCache[str, Any] = TTLCache(maxsize=128, ttl=60)
risk_cache: TTLCache[str, Any] = TTLCache(maxsize=128, ttl=90)
market_cache: TTLCache[str, Any] = TTLCache(maxsize=128, ttl=300)
allocation_cache: TTLCache[str, Any] = TTLCache(maxsize=128, ttl=120)
decision_cache: TTLCache[str, Any] = TTLCache(maxsize=128, ttl=300)
alerts_cache: TTLCache[str, Any] = TTLCache(maxsize=128, ttl=30)
system_cache: TTLCache[str, Any] = TTLCache(maxsize=128, ttl=30)
dashboard_cache: TTLCache[str, Any] = TTLCache(maxsize=128, ttl=15)


def get_cache(cache: MutableMapping[str, Any], key: str) -> Any | None:
    with _CACHE_LOCK:
        return cache.get(key)


def set_cache(cache: MutableMapping[str, Any], key: str, value: Any) -> Any:
    with _CACHE_LOCK:
        cache[key] = value
    return value


def clear_cache(cache: MutableMapping[str, Any], key: str | None = None) -> None:
    with _CACHE_LOCK:
        if key is None:
            cache.clear()
            return
        cache.pop(key, None)


def clear_all_caches() -> None:
    for cache in (
        portfolio_cache,
        risk_cache,
        market_cache,
        allocation_cache,
        decision_cache,
        alerts_cache,
        system_cache,
        dashboard_cache,
    ):
        clear_cache(cache)
