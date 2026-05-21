from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from uuid import uuid4

from services.agent.app.core.settings import Settings, TargetChain, get_settings
from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.schemas.market_data import AssetMetadata
from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot, RawQuoteSnapshot, RouteDescriptor
from services.agent.modules.market_data.snapshots import QuoteIngestionBundle
from services.agent.modules.oracle.freshness import utc_now
from services.agent.modules.quotes.route_ranker import rank_quotes


@dataclass(frozen=True)
class QuotePair:
    token_in: AssetMetadata
    token_out: AssetMetadata
    amount_in: Decimal


class QuoteService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def _assets_for_target_chain(self) -> list[AssetMetadata]:
        target_chain_id = self.settings.effective_chain_id
        assets: list[AssetMetadata] = []
        for raw_asset in self.settings.asset_registry.values():
            if raw_asset["chain_id"] == target_chain_id:
                assets.append(AssetMetadata(**raw_asset))
        return assets

    def discover_routes(self) -> list[RouteDescriptor]:
        pairs = self._quote_pairs()
        routes: list[RouteDescriptor] = []
        for pair in pairs:
            routes.extend(self._discover_agni_routes(pair))
            routes.extend(self._discover_merchant_moe_routes(pair))
        return routes

    def sample_latest_quotes(self) -> QuoteIngestionBundle:
        routes = self.discover_routes()
        raw_snapshots: list[RawQuoteSnapshot] = []
        normalized_snapshots: list[NormalizedQuoteSnapshot] = []
        now = utc_now()
        for route in routes:
            raw = RawQuoteSnapshot(
                snapshot_id=str(uuid4()),
                protocol=route.protocol,
                route_type=route.route_type,
                chain_id=self.settings.effective_chain_id,
                token_in=route.token_in,
                token_out=route.token_out,
                amount_in_raw=str(self._default_amount_in(route.token_in)),
                amount_out_raw=None,
                amount_in_decimals=18,
                amount_out_decimals=18,
                route_path_json=route.route_path,
                fee_tier_or_bin_step=route.fee_tier_or_bin_step,
                block_number=None,
                rpc_url=self.settings.effective_http_rpc_url,
                sample_timestamp=now,
                status="unsupported_route",
                status_code=DataStatusCode.LIQUIDITY_UNKNOWN.value,
                status_reason=f"{route.protocol} quote read surface is configured but not yet verified for live sampling.",
                raw_payload_json={"router_address": route.router_address, "verification_state": route.verification_state},
            )
            normalized = NormalizedQuoteSnapshot(
                snapshot_id=str(uuid4()),
                protocol=route.protocol,
                route_id=route.route_id or f"{route.protocol}:{route.token_in}:{route.token_out}:{route.fee_tier_or_bin_step or route.route_type}",
                route_label=route.route_type,
                token_in_symbol=route.token_in,
                token_out_symbol=route.token_out,
                amount_in=str(self._default_amount_in(route.token_in)),
                amount_out=None,
                quoted_price=None,
                estimated_slippage_bps=None,
                route_depth_usd=None,
                candidate_rank=None,
                sample_timestamp=now,
                freshness_status="missing",
                status_code=DataStatusCode.LIQUIDITY_UNKNOWN.value,
                status_reason=f"{route.protocol} live quote method is not verified in the repository yet.",
                data_sources_used=[route.protocol.lower()],
            )
            raw_snapshots.append(raw)
            normalized_snapshots.append(normalized)
        return QuoteIngestionBundle(raw_snapshots=raw_snapshots, normalized_snapshots=rank_quotes(normalized_snapshots))

    def _quote_pairs(self) -> list[QuotePair]:
        assets = self._assets_for_target_chain()
        asset_by_symbol = {asset.symbol: asset for asset in assets}
        pairs: list[QuotePair] = []
        if self.settings.target_chain == TargetChain.MANTLE_MAINNET and {"USDY", "mETH"}.issubset(asset_by_symbol):
            pairs.append(QuotePair(token_in=asset_by_symbol["USDY"], token_out=asset_by_symbol["mETH"], amount_in=Decimal("1000")))
            pairs.append(QuotePair(token_in=asset_by_symbol["mETH"], token_out=asset_by_symbol["USDY"], amount_in=Decimal("1")))
        return pairs

    def _discover_agni_routes(self, pair: QuotePair) -> list[RouteDescriptor]:
        if not self.settings.effective_agni_quoter_v2_address:
            return []
        routes: list[RouteDescriptor] = []
        for fee_tier in self.settings.parsed_agni_fee_tiers:
            routes.append(
                RouteDescriptor(
                    protocol="AGNI",
                    route_type="v3_exact_input_single",
                    token_in=pair.token_in.symbol,
                    token_out=pair.token_out.symbol,
                    route_path=[pair.token_in.address or pair.token_in.symbol, pair.token_out.address or pair.token_out.symbol],
                    verification_state="quoter_method_todo_verify",
                    route_id=f"agni:{pair.token_in.symbol}:{pair.token_out.symbol}:{fee_tier}",
                    fee_tier_or_bin_step=str(fee_tier),
                    router_address=self.settings.effective_agni_swap_router_address,
                )
            )
        return routes

    def _discover_merchant_moe_routes(self, pair: QuotePair) -> list[RouteDescriptor]:
        if self.settings.target_chain != TargetChain.MANTLE_MAINNET:
            return []
        routes: list[RouteDescriptor] = []
        if self.settings.merchant_moe_router_address:
            routes.append(
                RouteDescriptor(
                    protocol="MERCHANT_MOE",
                    route_type="classic_router",
                    token_in=pair.token_in.symbol,
                    token_out=pair.token_out.symbol,
                    route_path=[pair.token_in.address or pair.token_in.symbol, pair.token_out.address or pair.token_out.symbol],
                    verification_state="router_method_todo_verify",
                    route_id=f"merchant-moe-classic:{pair.token_in.symbol}:{pair.token_out.symbol}",
                    router_address=self.settings.merchant_moe_router_address,
                )
            )
        if self.settings.merchant_moe_lb_router_address:
            routes.append(
                RouteDescriptor(
                    protocol="MERCHANT_MOE",
                    route_type="lb_router",
                    token_in=pair.token_in.symbol,
                    token_out=pair.token_out.symbol,
                    route_path=[pair.token_in.address or pair.token_in.symbol, pair.token_out.address or pair.token_out.symbol],
                    verification_state="lb_method_todo_verify",
                    route_id=f"merchant-moe-lb:{pair.token_in.symbol}:{pair.token_out.symbol}",
                    router_address=self.settings.merchant_moe_lb_router_address,
                )
            )
        if self.settings.merchant_moe_aggregator_router_address:
            routes.append(
                RouteDescriptor(
                    protocol="MERCHANT_MOE",
                    route_type="aggregator_router",
                    token_in=pair.token_in.symbol,
                    token_out=pair.token_out.symbol,
                    route_path=[pair.token_in.address or pair.token_in.symbol, pair.token_out.address or pair.token_out.symbol],
                    verification_state="aggregator_method_todo_verify",
                    route_id=f"merchant-moe-agg:{pair.token_in.symbol}:{pair.token_out.symbol}",
                    router_address=self.settings.merchant_moe_aggregator_router_address,
                )
            )
        return routes

    @staticmethod
    def _default_amount_in(symbol: str) -> Decimal:
        if symbol.upper() == "USDY":
            return Decimal("1000")
        return Decimal("1")


def get_quote_service() -> QuoteService:
    return QuoteService()
