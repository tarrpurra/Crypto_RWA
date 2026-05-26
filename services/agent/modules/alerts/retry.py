from __future__ import annotations

from collections.abc import Callable
from time import sleep
from typing import TypeVar


T = TypeVar("T")


def bounded_retry(operation: Callable[[], T], *, attempts: int = 2, delay_seconds: float = 0.0) -> T:
    last_error: Exception | None = None
    for index in range(max(1, attempts)):
        try:
            return operation()
        except Exception as exc:
            last_error = exc
            if index < attempts - 1 and delay_seconds > 0:
                sleep(delay_seconds)
    if last_error is not None:
        raise last_error
    raise RuntimeError("Retry operation failed without an exception.")
