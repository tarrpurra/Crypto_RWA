from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from uuid import uuid4

from services.agent.app.core.settings import Settings, TargetChain, get_settings
from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.schemas.market_data import AssetMetadata
from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot, RawQuoteSnapshot, RouteDescriptor
from services.agent.modules.market_data.snapshots import PRICE_SNAPSHOT_STORE, QuoteIngestionBundle
from services.agent.modules.oracle.freshness import age_seconds, utc_now
from services.agent.modules.quotes.agni_discovery import AgniDiscoveryService
from services.agent.modules.quotes.agni_quotes import AgniQuoteService
from services.agent.modules.quotes.merchant_moe_discovery import MerchantMoeDiscoveryService
from services.agent.modules.quotes.merchant_moe_quotes import MerchantMoeQuoteService
from services.agent.modules.quotes.route_ranker import rank_quotes
from services.agent.repositories.db.market_repository import MarketDataRepository


@dataclass(frozen=True)
class QuotePair:
    token_in: AssetMetadata
    token_out: AssetMetadata
    amount_in: Decimal


class QuoteService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._cached_routes: list[RouteDescriptor] = []
        self._cached_routes_expires_at = None
        self.agni_discovery = AgniDiscoveryService(self.settings)
        self.agni_quotes = AgniQuoteService(self.settings)
        self.merchant_moe_discovery = MerchantMoeDiscoveryService(self.settings)
        self.merchant_moe_quotes = MerchantMoeQuoteService(self.settings)

    def _assets_for_target_chain(self) -> list[AssetMetadata]:
        target_chain_id = self.settings.effective_chain_id
        assets: list[AssetMetadata] = []
        for raw_asset in self.settings.asset_registry.values():
            if raw_asset["chain_id"] == target_chain_id:
                if raw_asset["price_strategy"] == "sepolia_mock_fixed":
                    continue
                assets.append(AssetMetadata(**raw_asset))
        return assets

    def discover_routes(self, refresh: bool = False) -> list[RouteDescriptor]:
        now = utc_now()
        if not refresh and self._cached_routes_expires_at and now < self._cached_routes_expires_at:
            return list(self._cached_routes)

        routes: list[RouteDescriptor] = []
        for pair in self._quote_pairs():
            routes.extend(self.agni_discovery.discover_exact_input_single_routes(pair.token_in, pair.token_out))
            routes.extend(self.merchant_moe_discovery.discover_routes(pair.token_in, pair.token_out))

        routes.extend(self._aiyield_sepolia_routes())

        if not routes and self.settings.target_chain == TargetChain.MANTLE_SEPOLIA:
            routes.extend(self._mock_sepolia_routes())

        self._cached_routes = routes
        from datetime import timedelta
        self._cached_routes_expires_at = now + timedelta(seconds=self.settings.route_cache_ttl_seconds)
        return list(routes)

    def sample_latest_quotes(self, routes: list[RouteDescriptor] | None = None) -> QuoteIngestionBundle:
        routes = routes if routes is not None else self.discover_routes()
        raw_snapshots: list[RawQuoteSnapshot] = []
        normalized_snapshots: list[NormalizedQuoteSnapshot] = []
        amount_by_symbol = {pair.token_in.symbol: pair.amount_in for pair in self._quote_pairs()}

        for route in routes:
            amount_in = amount_by_symbol.get(route.token_in, self._default_amount_in(route.token_in))
            if self._is_mock_route(route):
                attempt = self._mock_quote_attempt(route, amount_in)
            elif route.protocol == "AIYIELD":
                attempt = self._mock_quote_attempt(route, amount_in)
            elif route.protocol == "AGNI":
                if self._should_attempt_live_agni_quote(route):
                    attempt = self.agni_quotes.quote_route(route, amount_in)
                else:
                    attempt = self._unsupported_attempt(route, amount_in)
            elif route.protocol == "MERCHANT_MOE":
                attempt = self.merchant_moe_quotes.quote_route(route, amount_in)
            else:
                attempt = self._unsupported_attempt(route, amount_in)
            raw_snapshots.append(attempt.raw_snapshot)
            normalized_snapshots.append(attempt.normalized_snapshot)

        return QuoteIngestionBundle(raw_snapshots=raw_snapshots, normalized_snapshots=rank_quotes(normalized_snapshots))

    def latest_quotes_for_pair(self, token_in: str, token_out: str) -> list[NormalizedQuoteSnapshot]:
        bundle = self.sample_latest_quotes()
        filtered = [
            snapshot
            for snapshot in bundle.normalized_snapshots
            if snapshot.token_in_symbol.lower() == token_in.lower() and snapshot.token_out_symbol.lower() == token_out.lower()
        ]
        return rank_quotes(filtered)

    def best_quote_for_pair(self, token_in: str, token_out: str) -> NormalizedQuoteSnapshot | None:
        quotes = self.latest_quotes_for_pair(token_in, token_out)
        if quotes:
            best_live = self._with_quote_freshness(quotes[0])
            if best_live.status_code in {DataStatusCode.QUOTE_FRESH.value, DataStatusCode.QUOTE_STALE.value}:
                return best_live

        try:
            persisted = MarketDataRepository().latest_best_quote_for_pair(token_in, token_out)
        except Exception:
            persisted = None
        if persisted is not None:
            return self._with_quote_freshness(persisted)
        return self._with_quote_freshness(quotes[0]) if quotes else None

    def best_quote_attempt_for_pair(self, token_in: str, token_out: str):
        routes = [
            route
            for route in self.discover_routes()
            if route.token_in.lower() == token_in.lower() and route.token_out.lower() == token_out.lower()
        ]
        attempts = []
        amount_in = self._default_amount_in(token_in)
        for route in routes:
            if self._is_mock_route(route):
                attempt = self._mock_quote_attempt(route, amount_in)
            elif route.protocol == "AIYIELD":
                attempt = self._mock_quote_attempt(route, amount_in)
            elif route.protocol == "AGNI":
                if self._should_attempt_live_agni_quote(route):
                    attempt = self.agni_quotes.quote_route(route, amount_in)
                else:
                    attempt = self._unsupported_attempt(route, amount_in)
            elif route.protocol == "MERCHANT_MOE":
                attempt = self.merchant_moe_quotes.quote_route(route, amount_in)
            else:
                attempt = self._unsupported_attempt(route, amount_in)
            attempts.append(attempt)
        if not attempts:
            return None
        ranked = rank_quotes([attempt.normalized_snapshot for attempt in attempts])
        if not ranked:
            return None
        best_snapshot = ranked[0]
        return next(
            (
                attempt
                for attempt in attempts
                if attempt.normalized_snapshot.route_id == best_snapshot.route_id
                and attempt.normalized_snapshot.token_in_symbol.lower() == token_in.lower()
                and attempt.normalized_snapshot.token_out_symbol.lower() == token_out.lower()
            ),
            None,
        )

    def _mock_sepolia_routes(self) -> list[RouteDescriptor]:
        assets = {a.symbol: a for a in self._assets_for_target_chain()}
        mock_routes: list[RouteDescriptor] = []
        pairs = [
            ("WMNT", "USDY", 3000),
            ("WMNT", "USDY", 10000),
            ("WMNT", "mETH", 3000),
            ("mETH", "USDY", 3000),
            ("USDY", "mETH", 3000),
        ]
        for token_in_sym, token_out_sym, fee in pairs:
            token_in = assets.get(token_in_sym)
            token_out = assets.get(token_out_sym)
            if not token_in or not token_out or not token_in.address or not token_out.address:
                continue
            mock_routes.append(
                RouteDescriptor(
                    protocol="AGNI",
                    route_type="v3_exact_input_single",
                    token_in=token_in_sym,
                    token_out=token_out_sym,
                    route_path=[token_in.address, token_out.address],
                    verification_state="quoter_v2_quote_required",
                    route_id=f"mock_agni:{token_in_sym}:{token_out_sym}:{fee}",
                    fee_tier_or_bin_step=str(fee),
                    router_address=self.settings.effective_agni_swap_router_address,
                    pool_address="0x0000000000000000000000000000000000000001",
                )
            )
        return mock_routes

    def _aiyield_sepolia_routes(self) -> list[RouteDescriptor]:
        if self.settings.target_chain != TargetChain.MANTLE_SEPOLIA:
            return []

        router_address = self.settings.effective_aiyield_swap_router_address
        if not router_address:
            return []

        assets = {a.symbol: a for a in self._assets_for_target_chain()}
        routes: list[RouteDescriptor] = []
        for token_in_sym, token_out_sym in [
            ("WMNT", "USDY"),
            ("USDY", "WMNT"),
            ("WMNT", "mETH"),
            ("mETH", "WMNT"),
            ("USDY", "mETH"),
            ("mETH", "USDY"),
        ]:
            token_in = assets.get(token_in_sym)
            token_out = assets.get(token_out_sym)
            if not token_in or not token_out or not token_in.address or not token_out.address:
                continue
            routes.append(
                RouteDescriptor(
                    protocol="AIYIELD",
                    route_type="test_swap_router",
                    token_in=token_in_sym,
                    token_out=token_out_sym,
                    route_path=[token_in.address, token_out.address],
                    verification_state="router_configured",
                    route_id=f"aiyield:{token_in_sym}:{token_out_sym}",
                    fee_tier_or_bin_step="0",
                    router_address=router_address,
                    pool_address=router_address,
                )
            )
        return routes

    def _mock_quote_attempt(self, route: RouteDescriptor, amount_in: Decimal):
        now = utc_now()
        mock_rates = {
            ("WMNT", "USDY"): Decimal("0.51"),
            ("USDY", "WMNT"): Decimal("1.96"),
            ("WMNT", "mETH"): Decimal("0.000151"),
            ("mETH", "WMNT"): Decimal("6622.5"),
            ("USDY", "mETH"): Decimal("0.00059"),
            ("mETH", "USDY"): Decimal("1694.915"),
        }
        rate = mock_rates.get((route.token_in, route.token_out), Decimal("1"))
        if route.protocol == "AIYIELD":
            live_prices = self._latest_price_map()
            price_in = live_prices.get(route.token_in.upper())
            price_out = live_prices.get(route.token_out.upper())
            if price_in is not None and price_out is not None and price_out > 0:
                rate = (price_in / price_out).quantize(Decimal("0.00000001"))
        amount_out = (amount_in * rate).quantize(Decimal("0.0001"))
        slippage_bps = 30
        raw_snapshot_id = str(uuid4())
        normalized_snapshot_id = str(uuid4())
        raw = RawQuoteSnapshot(
            snapshot_id=raw_snapshot_id,
            protocol=route.protocol,
            route_type=route.route_type,
            chain_id=self.settings.effective_chain_id,
            token_in=route.token_in,
            token_out=route.token_out,
            amount_in_raw=str(amount_in),
            amount_out_raw=str(amount_out),
            amount_in_decimals=18,
            amount_out_decimals=18,
            route_path_json=route.route_path,
            fee_tier_or_bin_step=route.fee_tier_or_bin_step,
            block_number=None,
            rpc_url=self.settings.effective_http_rpc_url,
            sample_timestamp=now,
            status="mock_sepolia_quote",
            status_code=DataStatusCode.QUOTE_FRESH.value,
            status_reason="Mock Sepolia quote (no real pool exists on testnet).",
            raw_payload_json={
                "router_address": route.router_address,
                "pool_address": route.pool_address,
                "source": "mock_sepolia",
            },
        )
        norm = NormalizedQuoteSnapshot(
            snapshot_id=normalized_snapshot_id,
            protocol=route.protocol,
            route_id=route.route_id or f"{route.protocol.lower()}:{route.token_in}:{route.token_out}:{route.fee_tier_or_bin_step}",
            route_label=route.route_type,
            chain_id=self.settings.effective_chain_id,
            token_in_symbol=route.token_in,
            token_out_symbol=route.token_out,
            amount_in=str(amount_in),
            amount_out=str(amount_out),
            quoted_price=str(rate),
            estimated_slippage_bps=str(slippage_bps),
            route_depth_usd=None,
            candidate_rank=1,
            sample_timestamp=now,
            freshness_status="fresh",
            status_code=DataStatusCode.QUOTE_FRESH.value,
            status_reason="Mock Sepolia quote for testnet.",
            data_sources_used=["mock_sepolia"],
        )
        return type("Attempt", (), {"raw_snapshot": raw, "normalized_snapshot": norm})

    def _latest_price_map(self) -> dict[str, Decimal]:
        prices: dict[str, Decimal] = {}
        try:
            for snapshot in PRICE_SNAPSHOT_STORE.latest().normalized_snapshots:
                if snapshot.price_usd:
                    prices[snapshot.asset_symbol.upper()] = Decimal(snapshot.price_usd)
        except Exception:
            prices = {}
        if prices:
            try:
                for snapshot in MarketDataRepository().latest_normalized_prices():
                    if snapshot.price_usd and snapshot.asset_symbol.upper() not in prices:
                        prices[snapshot.asset_symbol.upper()] = Decimal(snapshot.price_usd)
            except Exception:
                pass
            return prices
        try:
            for snapshot in MarketDataRepository().latest_normalized_prices():
                if snapshot.price_usd:
                    prices[snapshot.asset_symbol.upper()] = Decimal(snapshot.price_usd)
        except Exception:
            return prices
        return prices

    def _is_mock_route(self, route: RouteDescriptor) -> bool:
        return route.route_id is not None and route.route_id.startswith("mock_")

    def _with_quote_freshness(self, quote: NormalizedQuoteSnapshot | None) -> NormalizedQuoteSnapshot | None:
        if quote is None:
            return None

        freshness_limit = max(1, int(self.settings.dex_quote_fresh_limit_seconds))
        quote_age = age_seconds(quote.sample_timestamp, utc_now())
        if quote_age is None:
            return quote.model_copy(
                update={
                    "freshness_status": "stale",
                    "status_code": DataStatusCode.QUOTE_STALE.value,
                    "status_reason": "Quote freshness timestamp is missing.",
                }
            )
        if quote_age > freshness_limit or quote.status_code == DataStatusCode.QUOTE_STALE.value or quote.freshness_status == "stale":
            return quote.model_copy(
                update={
                    "freshness_status": "stale",
                    "status_code": DataStatusCode.QUOTE_STALE.value,
                    "status_reason": f"Quote is stale at {quote_age} seconds old.",
                }
            )

        return quote

    def _quote_pairs(self) -> list[QuotePair]:
        assets = self._assets_for_target_chain()
        asset_by_key = {asset.asset_key: asset for asset in assets}
        pairs: list[QuotePair] = []
        seen: set[tuple[str, str]] = set()
        for token_in in assets:
            for token_out in assets:
                if token_in.asset_key == token_out.asset_key:
                    continue
                pair_key = (token_in.asset_key, token_out.asset_key)
                if pair_key in seen:
                    continue
                seen.add(pair_key)
                pairs.append(
                    QuotePair(
                        token_in=token_in,
                        token_out=token_out,
                        amount_in=self._default_amount_in(token_in.symbol),
                    )
                )
        return pairs

    def _should_attempt_live_agni_quote(self, route: RouteDescriptor) -> bool:
        if self.settings.target_chain != TargetChain.MANTLE_SEPOLIA:
            return True
        allowed_pairs = {
            ("WMNT", "mETH"),
            ("mETH", "WMNT"),
            ("mETH", "USDY"),
            ("USDY", "mETH"),
        }
        return (route.token_in, route.token_out) in allowed_pairs

    def _unsupported_attempt(self, route: RouteDescriptor, amount_in: Decimal):
        now = utc_now()
        raw_snapshot = RawQuoteSnapshot(
            snapshot_id=str(uuid4()),
            protocol=route.protocol,
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
            status="unsupported_route",
            status_code=DataStatusCode.LIQUIDITY_UNKNOWN.value,
            status_reason=f"{route.protocol} quote read surface is configured but not yet supported.",
            raw_payload_json={"router_address": route.router_address, "verification_state": route.verification_state},
        )
        normalized_snapshot = NormalizedQuoteSnapshot(
            snapshot_id=str(uuid4()),
            protocol=route.protocol,
            route_id=route.route_id or f"{route.protocol}:{route.token_in}:{route.token_out}:{route.fee_tier_or_bin_step or route.route_type}",
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
            status_reason=f"{route.protocol} live quote method is not verified in the repository yet.",
            data_sources_used=[route.protocol.lower()],
        )
        return type("Attempt", (), {"raw_snapshot": raw_snapshot, "normalized_snapshot": normalized_snapshot})

    @staticmethod
    def _default_amount_in(symbol: str) -> Decimal:
        if symbol.upper() == "USDY":
            return Decimal("1000")
        if symbol.upper() in {"WMNT", "MNT"}:
            return Decimal("10")
        return Decimal("1")


@lru_cache(maxsize=1)
def get_quote_service() -> QuoteService:
    return QuoteService()
