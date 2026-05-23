from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from web3 import HTTPProvider, Web3

from services.agent.app.core.settings import Settings, TargetChain, get_settings
from services.agent.app.schemas.market_data import AssetMetadata
from services.agent.app.schemas.quotes import RouteDescriptor


FACTORY_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "tokenA", "type": "address"},
            {"internalType": "address", "name": "tokenB", "type": "address"},
            {"internalType": "uint24", "name": "fee", "type": "uint24"},
        ],
        "name": "getPool",
        "outputs": [{"internalType": "address", "name": "pool", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    }
]


@dataclass(frozen=True)
class AgniPoolCandidate:
    fee_tier: int
    pool_address: str | None
    status: str
    metadata: dict[str, Any]


class AgniDiscoveryService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.web3 = Web3(HTTPProvider(self.settings.effective_http_rpc_url))

    def discover_exact_input_single_routes(self, token_in: AssetMetadata, token_out: AssetMetadata) -> list[RouteDescriptor]:
        if self.settings.target_chain != TargetChain.MANTLE_MAINNET:
            return []
        if not self.settings.effective_agni_factory_address:
            return []
        if not token_in.address or not token_out.address:
            return []

        factory = self.web3.eth.contract(
            address=self.web3.to_checksum_address(self.settings.effective_agni_factory_address),
            abi=FACTORY_ABI,
        )
        routes: list[RouteDescriptor] = []
        for fee_tier in self.settings.parsed_agni_fee_tiers:
            candidate = self._discover_pool(factory, token_in.address, token_out.address, fee_tier)
            if candidate.pool_address:
                routes.append(
                    RouteDescriptor(
                        protocol="AGNI",
                        route_type="v3_exact_input_single",
                        token_in=token_in.symbol,
                        token_out=token_out.symbol,
                        route_path=[token_in.address, token_out.address],
                        verification_state="quoter_v2_quote_required",
                        route_id=f"agni:{token_in.symbol}:{token_out.symbol}:{fee_tier}",
                        fee_tier_or_bin_step=str(fee_tier),
                        router_address=self.settings.effective_agni_swap_router_address,
                        pool_address=candidate.pool_address,
                    )
                )
        return routes

    def _discover_pool(self, factory, token_in: str, token_out: str, fee_tier: int) -> AgniPoolCandidate:
        try:
            pool = factory.functions.getPool(
                self.web3.to_checksum_address(token_in),
                self.web3.to_checksum_address(token_out),
                fee_tier,
            ).call()
        except Exception as exc:
            return AgniPoolCandidate(
                fee_tier=fee_tier,
                pool_address=None,
                status="rpc_error",
                metadata={"error": str(exc)},
            )

        zero = "0x0000000000000000000000000000000000000000"
        if not pool or pool.lower() == zero.lower():
            return AgniPoolCandidate(
                fee_tier=fee_tier,
                pool_address=None,
                status="no_route",
                metadata={},
            )

        return AgniPoolCandidate(
            fee_tier=fee_tier,
            pool_address=pool,
            status="discovered",
            metadata={},
        )
