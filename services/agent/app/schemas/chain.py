from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ChainStatusResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    target_chain: str
    chain_id: int | None = None
    latest_block: int | None = None
    rpc_url: str
    websocket_enabled: bool
    rpc_error: str | None = None
    pause_guardian: dict[str, Any] | None = None
    trade_approval_manager: dict[str, Any] | None = None
    executor_vault: dict[str, Any] | None = None
