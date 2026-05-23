from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from uuid import uuid4

from services.agent.app.core.settings import Settings, get_settings
from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot, RawQuoteSnapshot, RouteDescriptor
from services.agent.modules.oracle.freshness import utc_now


@dataclass(frozen=True)
class MerchantMoeQuoteAttempt:
    route: RouteDescriptor
    raw_snapshot: RawQuoteSnapshot
    normalized_snapshot: NormalizedQuoteSnapshot


class MerchantMoeQuoteService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def quote_route(self, route: RouteDescriptor, amount_in: Decimal) -> MerchantMoeQuoteAttempt:
        now = utc_now()
        raw_snapshot = RawQuoteSnapshot(
            snapshot_id=str(uuid4()),
            protocol="MERCHANT_MOE",
            route_type=route.route_type,
            chain_id=self.settings.effective_chain_id,
            token_in=route.token_in,
            token_out=route.token_out,
            amount_in_raw=str(amount_in),
            amount_out_raw=None,
            amount_in_decimals=18,
            amount_out_decimals=18,
            route_path_json=route.route_path,
            fee_tier_or_bin_step=route.fee_tier_or_bin_step,
            block_number=None,
            rpc_url=self.settings.effective_http_rpc_url,
            sample_timestamp=now,
            status="verification_required",
            status_code=DataStatusCode.LIQUIDITY_UNKNOWN.value,
            status_reason="Merchant Moe route was discovered, but quote decoding remains verification-gated for this route family.",
            raw_payload_json={
                "router_address": route.router_address,
                "pool_address": route.pool_address,
                "verification_state": route.verification_state,
            },
        )
        normalized_snapshot = NormalizedQuoteSnapshot(
            snapshot_id=str(uuid4()),
            protocol="MERCHANT_MOE",
            route_id=route.route_id or f"merchant-moe:{route.token_in}:{route.token_out}:{route.route_type}",
            route_label=route.route_type,
            chain_id=self.settings.effective_chain_id,
            token_in_symbol=route.token_in,
            token_out_symbol=route.token_out,
            amount_in=str(amount_in),
            amount_out=None,
            quoted_price=None,
            estimated_slippage_bps=None,
            route_depth_usd=None,
            candidate_rank=None,
            sample_timestamp=now,
            freshness_status="verification_required",
            status_code=DataStatusCode.LIQUIDITY_UNKNOWN.value,
            status_reason="Merchant Moe discovered a route surface, but the live quote adapter is still verification-gated.",
            data_sources_used=["merchant_moe"],
        )
        return MerchantMoeQuoteAttempt(route=route, raw_snapshot=raw_snapshot, normalized_snapshot=normalized_snapshot)
