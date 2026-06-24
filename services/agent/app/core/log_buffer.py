from __future__ import annotations

import logging
import re
from collections import deque
from datetime import datetime, timezone
from threading import Lock
from typing import Any


_MAX_ENTRIES = 400
_LOG_BUFFER: deque[dict[str, Any]] = deque(maxlen=_MAX_ENTRIES)
_LOG_BUFFER_LOCK = Lock()
_SECRET_PATTERNS = [
    re.compile(r"(?i)\b(api[_-]?key|authorization|private[_-]?key|token|secret)\b\s*[:=]\s*([^\s,;]+)"),
    re.compile(r"(?i)\b(bearer)\s+[a-z0-9._\-]+"),
]


def _sanitize_message(message: str) -> str:
    sanitized = message
    for pattern in _SECRET_PATTERNS:
        sanitized = pattern.sub(lambda match: f"{match.group(1)}=[REDACTED]", sanitized)
    return sanitized


class InMemoryLogBufferHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            rendered = self.format(record)
            entry = {
                "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "message": _sanitize_message(rendered),
            }
            with _LOG_BUFFER_LOCK:
                _LOG_BUFFER.append(entry)
        except Exception:
            self.handleError(record)


def recent_log_entries(limit: int = 200) -> list[dict[str, Any]]:
    bounded = max(1, min(limit, _MAX_ENTRIES))
    with _LOG_BUFFER_LOCK:
        entries = list(_LOG_BUFFER)[-bounded:]
    return entries
