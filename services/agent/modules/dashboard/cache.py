from __future__ import annotations

from services.agent.app.core.cache import clear_cache, dashboard_cache, get_cache, set_cache


def get_cached(key: str, ttl_seconds: int):
    del ttl_seconds
    return get_cache(dashboard_cache, key)


def set_cached(key: str, value):
    return set_cache(dashboard_cache, key, value)


def clear_cached(key: str | None = None):
    clear_cache(dashboard_cache, key)
