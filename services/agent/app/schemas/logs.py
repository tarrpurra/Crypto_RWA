from __future__ import annotations

from pydantic import BaseModel


class BackendLogEntry(BaseModel):
    timestamp: str
    level: str
    logger: str
    message: str


class BackendLogsResponse(BaseModel):
    status: str
    entries: list[BackendLogEntry]
