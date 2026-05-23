from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from web3 import HTTPProvider, Web3

from services.agent.app.core.settings import Settings, TargetChain, get_settings
from services.agent.app.schemas.market_data import AssetMetadata
from services.agent.app.schemas.quotes import RouteDescriptor


CLASSIC_FACTORY_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "tokenA", "type": "address"},
            {"internalType": "address", "name": "tokenB", "type": "address"},
        ],
        "name": "getPair",
        "outputs": [{"internalType": "address", "name": "pair", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    }
]


@dataclass(frozen=True)
class MerchantMoeRouteCandidate:
    route_type: str
    pool_address: str | None
    status: str
    metadata: dict[str, Any]


class MerchantMoeDiscoveryService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.web3 = Web3(HTTPProvider(self.settings.effective_http_rpc_url))

    def discover_routes(self, token_in: AssetMetadata, token_out: AssetMetadata) -> list[RouteDescriptor]:
        if self.settings.target_chain != TargetChain.MANTLE_MAINNET:
            return []
        if not token_in.address or not token_out.address:
            return []

        routes: list[RouteDescriptor] = []
        classic = self._discover_classic_pair(token_in.address, token_out.address)
        if classic.pool_address:
            routes.append(
                RouteDescriptor(
                    protocol="MERCHANT_MOE",
                    route_type="classic_router",
                    token_in=token_in.symbol,
                    token_out=token_out.symbol,
                    route_path=[token_in.address, token_out.address],
                    verification_state="router_quote_required",
                    route_id=f"merchant-moe-classic:{token_in.symbol}:{token_out.symbol}",
                    router_address=self.settings.merchant_moe_router_address,
                    pool_address=classic.pool_address,
                )
            )

        if self.settings.merchant_moe_lb_router_address and self.settings.merchant_moe_lb_factory_address:
            routes.append(
                RouteDescriptor(
                    protocol="MERCHANT_MOE",
                    route_type="lb_router",
                    token_in=token_in.symbol,
                    token_out=token_out.symbol,
                    route_path=[token_in.address, token_out.address],
                    verification_state="lb_pair_verification_required",
                    route_id=f"merchant-moe-lb:{token_in.symbol}:{token_out.symbol}",
                    router_address=self.settings.merchant_moe_lb_router_address,
                    pool_address=None,
                )
            )

        if self.settings.merchant_moe_aggregator_router_address:
            routes.append(
                RouteDescriptor(
                    protocol="MERCHANT_MOE",
                    route_type="aggregator_router",
                    token_in=token_in.symbol,
                    token_out=token_out.symbol,
                    route_path=[token_in.address, token_out.address],
                    verification_state="aggregator_quote_required",
                    route_id=f"merchant-moe-agg:{token_in.symbol}:{token_out.symbol}",
                    router_address=self.settings.merchant_moe_aggregator_router_address,
                    pool_address=None,
                )
            )
        return routes

    def _discover_classic_pair(self, token_in: str, token_out: str) -> MerchantMoeRouteCandidate:
        if not self.settings.merchant_moe_factory_address:
            return MerchantMoeRouteCandidate(route_type="classic_router", pool_address=None, status="verification_required", metadata={})

        factory = self.web3.eth.contract(
            address=self.web3.to_checksum_address(self.settings.merchant_moe_factory_address),
            abi=CLASSIC_FACTORY_ABI,
        )
        try:
            pair = factory.functions.getPair(
                self.web3.to_checksum_address(token_in),
                self.web3.to_checksum_address(token_out),
            ).call()
        except Exception as exc:
            return MerchantMoeRouteCandidate(
                route_type="classic_router",
                pool_address=None,
                status="rpc_error",
                metadata={"error": str(exc)},
            )

        zero = "0x0000000000000000000000000000000000000000"
        if not pair or pair.lower() == zero.lower():
            return MerchantMoeRouteCandidate(route_type="classic_router", pool_address=None, status="no_route", metadata={})

        return MerchantMoeRouteCandidate(route_type="classic_router", pool_address=pair, status="discovered", metadata={})
