from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal
from uuid import uuid4

from web3 import HTTPProvider, Web3

from services.agent.app.core.settings import Settings, get_settings
from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot, RawQuoteSnapshot, RouteDescriptor
from services.agent.modules.oracle.freshness import utc_now

logger = logging.getLogger("services.agent.modules.quotes.merchant_moe")

CLASSIC_ROUTER_ABI_GET_AMOUNTS_OUT = [
    {
        "inputs": [
            {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
            {"internalType": "address[]", "name": "path", "type": "address[]"},
        ],
        "name": "getAmountsOut",
        "outputs": [
            {"internalType": "uint256[]", "name": "amounts", "type": "uint256[]"},
        ],
        "stateMutability": "view",
        "type": "function",
    }
]


@dataclass(frozen=True)
class MerchantMoeQuoteAttempt:
    route: RouteDescriptor
    raw_snapshot: RawQuoteSnapshot
    normalized_snapshot: NormalizedQuoteSnapshot


class MerchantMoeQuoteService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.web3 = Web3(HTTPProvider(self.settings.effective_http_rpc_url))

    def _token_decimals(self, symbol: str) -> int:
        for entry in self.settings.asset_registry.values():
            if entry.get("symbol") == symbol:
                return int(entry.get("decimals", 18))
        return 18

    def quote_route(self, route: RouteDescriptor, amount_in: Decimal) -> MerchantMoeQuoteAttempt:
        now = utc_now()

        router_address = route.router_address or self.settings.merchant_moe_router_address
        if not router_address:
            raw = RawQuoteSnapshot(
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
                status="config_error",
                status_code=DataStatusCode.LIQUIDITY_UNKNOWN.value,
                status_reason="Merchant Moe router address is not configured.",
                raw_payload_json={
                    "router_address": route.router_address,
                    "pool_address": route.pool_address,
                    "verification_state": route.verification_state,
                },
            )
            norm = NormalizedQuoteSnapshot(
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
                freshness_status="config_error",
                status_code=DataStatusCode.LIQUIDITY_UNKNOWN.value,
                status_reason="Merchant Moe router address is not configured.",
                data_sources_used=["merchant_moe"],
            )
            return MerchantMoeQuoteAttempt(route=route, raw_snapshot=raw, normalized_snapshot=norm)

        decimals_in = self._token_decimals(route.token_in)
        decimals_out = self._token_decimals(route.token_out)
        amount_in_raw = int(amount_in * Decimal(10 ** decimals_in))

        tokens_in_path = route.route_path
        if not tokens_in_path or len(tokens_in_path) < 2:
            raw = RawQuoteSnapshot(
                snapshot_id=str(uuid4()),
                protocol="MERCHANT_MOE",
                route_type=route.route_type,
                chain_id=self.settings.effective_chain_id,
                token_in=route.token_in,
                token_out=route.token_out,
                amount_in_raw=str(amount_in),
                amount_out_raw=None,
                amount_in_decimals=decimals_in,
                amount_out_decimals=decimals_out,
                route_path_json=route.route_path,
                fee_tier_or_bin_step=route.fee_tier_or_bin_step,
                block_number=None,
                rpc_url=self.settings.effective_http_rpc_url,
                sample_timestamp=now,
                status="config_error",
                status_code=DataStatusCode.LIQUIDITY_UNKNOWN.value,
                status_reason="Merchant Moe route_path is missing or incomplete.",
                raw_payload_json={
                    "router_address": route.router_address,
                    "pool_address": route.pool_address,
                    "verification_state": route.verification_state,
                },
            )
            norm = NormalizedQuoteSnapshot(
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
                freshness_status="config_error",
                status_code=DataStatusCode.LIQUIDITY_UNKNOWN.value,
                status_reason="Merchant Moe route_path is missing or incomplete.",
                data_sources_used=["merchant_moe"],
            )
            return MerchantMoeQuoteAttempt(route=route, raw_snapshot=raw, normalized_snapshot=norm)

        checksummed_path = [self.web3.to_checksum_address(addr) for addr in tokens_in_path]

        try:
            router = self.web3.eth.contract(
                address=self.web3.to_checksum_address(router_address),
                abi=CLASSIC_ROUTER_ABI_GET_AMOUNTS_OUT,
            )
            amounts = router.functions.getAmountsOut(
                amount_in_raw,
                checksummed_path,
            ).call()

            if not amounts or len(amounts) < 2:
                raise ValueError(f"getAmountsOut returned insufficient results: {amounts}")

            amount_out_raw = amounts[-1]
            amount_out = Decimal(str(amount_out_raw)) / Decimal(10 ** decimals_out)

            if amount_out > 0:
                quoted_price = str(amount_in / amount_out)
            else:
                quoted_price = "0"

            slippage_bps = 10

            block_number = self.web3.eth.block_number

            status = "live_quote_ok"
            status_code = DataStatusCode.QUOTE_FRESH.value
            status_reason = (
                f"Merchant Moe router getAmountsOut returned amountOut={amount_out_raw}"
            )
            freshness_status = "fresh"

        except Exception as exc:
            logger.warning("MerchantMoe quote_route RPC error for %s->%s: %s", route.token_in, route.token_out, exc)
            amount_out = Decimal(0)
            amount_out_raw = None
            quoted_price = None
            slippage_bps = None
            block_number = None

            status = "rpc_error"
            status_code = DataStatusCode.LIQUIDITY_UNKNOWN.value
            status_reason = f"Merchant Moe getAmountsOut call failed: {exc}"
            freshness_status = "rpc_error"

        raw_snapshot = RawQuoteSnapshot(
            snapshot_id=str(uuid4()),
            protocol="MERCHANT_MOE",
            route_type=route.route_type,
            chain_id=self.settings.effective_chain_id,
            token_in=route.token_in,
            token_out=route.token_out,
            amount_in_raw=str(amount_in),
            amount_out_raw=str(amount_out_raw) if amount_out_raw is not None else None,
            amount_in_decimals=decimals_in,
            amount_out_decimals=decimals_out,
            route_path_json=route.route_path,
            fee_tier_or_bin_step=route.fee_tier_or_bin_step,
            block_number=block_number,
            rpc_url=self.settings.effective_http_rpc_url,
            sample_timestamp=now,
            status=status,
            status_code=status_code,
            status_reason=status_reason,
            raw_payload_json={
                "router_address": route.router_address,
                "pool_address": route.pool_address,
                "verification_state": route.verification_state,
                "amount_in_raw": str(amount_in_raw),
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
            amount_out=str(amount_out) if amount_out > 0 else None,
            quoted_price=quoted_price,
            estimated_slippage_bps=str(slippage_bps) if slippage_bps is not None else None,
            route_depth_usd=None,
            candidate_rank=None,
            sample_timestamp=now,
            freshness_status=freshness_status,
            status_code=status_code,
            status_reason=status_reason,
            data_sources_used=["merchant_moe"],
        )
        return MerchantMoeQuoteAttempt(route=route, raw_snapshot=raw_snapshot, normalized_snapshot=normalized_snapshot)
