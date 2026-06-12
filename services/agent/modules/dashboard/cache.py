from __future__ import annotations

import time
from typing import Any


_CACHE: dict[str, dict[str, Any]] = {}


def get_cached(key: str, ttl_seconds: int):
    item = _CACHE.get(key)
    if not item:
        return None
    if time.time() - item["created_at"] > ttl_seconds:
        return None
    return item["value"]


def set_cached(key: str, value: Any):
    _CACHE[key] = {
        "created_at": time.time(),
        "value": value,
    }


def clear_cached(key: str | None = None):
    if key is None:
        _CACHE.clear()
        return
    _CACHE.pop(key, None)
