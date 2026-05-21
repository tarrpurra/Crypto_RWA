from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class RouteDescriptor(BaseModel):
    protocol: str
    route_type: str
    token_in: str
    token_out: str
    route_path: list[str] = Field(default_factory=list)
    verification_state: str


class RawQuoteSnapshot(BaseModel):
    snapshot_id: str
    protocol: str
    route_type: str
    chain_id: int
    token_in: str
    token_out: str
    amount_in_raw: str
    amount_out_raw: str | None = None
    amount_in_decimals: int
    amount_out_decimals: int
    route_path_json: list[str] = Field(default_factory=list)
    fee_tier_or_bin_step: str | None = None
    block_number: int | None = None
    rpc_url: str | None = None
    sample_timestamp: datetime
    status: str
    status_code: str
    status_reason: str
    raw_payload_json: dict[str, Any] = Field(default_factory=dict)


class NormalizedQuoteSnapshot(BaseModel):
    snapshot_id: str
    protocol: str
    route_id: str
    route_label: str
    token_in_symbol: str
    token_out_symbol: str
    amount_in: str
    amount_out: str | None = None
    quoted_price: str | None = None
    estimated_slippage_bps: str | None = None
    route_depth_usd: str | None = None
    candidate_rank: int | None = None
    sample_timestamp: datetime
    freshness_status: str
    status_code: str
    status_reason: str
    data_sources_used: list[str] = Field(default_factory=list)
