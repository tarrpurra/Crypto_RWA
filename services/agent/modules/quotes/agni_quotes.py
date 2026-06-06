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

logger = logging.getLogger("services.agent.modules.quotes.agni")

QUOTER_V2_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "tokenIn", "type": "address"},
            {"internalType": "address", "name": "tokenOut", "type": "address"},
            {"internalType": "uint24", "name": "fee", "type": "uint24"},
            {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
            {"internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160"},
        ],
        "name": "quoteExactInputSingle",
        "outputs": [
            {"internalType": "uint256", "name": "amountOut", "type": "uint256"},
            {"internalType": "uint160", "name": "sqrtPriceX96After", "type": "uint160"},
            {"internalType": "uint32", "name": "initializedTicksCrossed", "type": "uint32"},
            {"internalType": "uint256", "name": "gasEstimate", "type": "uint256"},
        ],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]


@dataclass(frozen=True)
class AgniQuoteAttempt:
    route: RouteDescriptor
    raw_snapshot: RawQuoteSnapshot
    normalized_snapshot: NormalizedQuoteSnapshot


class AgniQuoteService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.web3 = Web3(HTTPProvider(self.settings.effective_http_rpc_url))

    def _token_decimals(self, symbol: str) -> int:
        for entry in self.settings.asset_registry.values():
            if entry.get("symbol") == symbol:
                return int(entry.get("decimals", 18))
        return 18

    @staticmethod
    def _is_expected_quote_revert(exc: Exception) -> bool:
        message = " ".join(str(part) for part in getattr(exc, "args", ()) if part is not None) or str(exc)
        lowered = message.lower()
        return "execution reverted" in lowered or lowered.strip() == "0x"

    def quote_route(self, route: RouteDescriptor, amount_in: Decimal) -> AgniQuoteAttempt:
        now = utc_now()
        quoter_address = self.settings.effective_agni_quoter_v2_address
        if not quoter_address:
            raw = RawQuoteSnapshot(
                snapshot_id=str(uuid4()),
                protocol="AGNI",
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
                status_reason="QuoterV2 address is not configured.",
                raw_payload_json={
                    "router_address": route.router_address,
                    "pool_address": route.pool_address,
                    "verification_state": route.verification_state,
                },
            )
            norm = NormalizedQuoteSnapshot(
                snapshot_id=str(uuid4()),
                protocol="AGNI",
                route_id=route.route_id or f"agni:{route.token_in}:{route.token_out}:{route.fee_tier_or_bin_step or route.route_type}",
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
                status_reason="QuoterV2 address is not configured.",
                data_sources_used=["agni"],
            )
            return AgniQuoteAttempt(route=route, raw_snapshot=raw, normalized_snapshot=norm)

        decimals_in = self._token_decimals(route.token_in)
        decimals_out = self._token_decimals(route.token_out)
        amount_in_raw = int(amount_in * Decimal(10 ** decimals_in))

        fee_tier = 3000
        if route.fee_tier_or_bin_step:
            try:
                fee_tier = int(route.fee_tier_or_bin_step)
            except (ValueError, TypeError):
                fee_tier = 3000

        try:
            quoter = self.web3.eth.contract(
                address=self.web3.to_checksum_address(quoter_address),
                abi=QUOTER_V2_ABI,
            )
            tokens_in_path = route.route_path
            if not tokens_in_path or len(tokens_in_path) < 2:
                raise ValueError("route_path must contain at least tokenIn and tokenOut addresses")

            token_in_addr = self.web3.to_checksum_address(tokens_in_path[0])
            token_out_addr = self.web3.to_checksum_address(tokens_in_path[1])

            result = quoter.functions.quoteExactInputSingle(
                token_in_addr,
                token_out_addr,
                fee_tier,
                amount_in_raw,
                0,
            ).call()

            amount_out_raw = result[0]
            sqrt_price_x96_after = result[1]
            initialized_ticks_crossed = result[2]
            gas_estimate = result[3]

            amount_out = Decimal(str(amount_out_raw)) / Decimal(10 ** decimals_out)

            if amount_out > 0:
                quoted_price = str(amount_in / amount_out)
            else:
                quoted_price = "0"

            slippage_bps = min(initialized_ticks_crossed * 10, 500)
            if slippage_bps < 5:
                slippage_bps = 5

            block_number = self.web3.eth.block_number

            status = "live_quote_ok"
            status_code = DataStatusCode.QUOTE_FRESH.value
            status_reason = (
                f"AGNI QuoterV2 returned amountOut={amount_out_raw}, "
                f"ticksCrossed={initialized_ticks_crossed}, gasEst={gas_estimate}"
            )
            freshness_status = "fresh"

        except Exception as exc:
            expected_revert = self._is_expected_quote_revert(exc)
            if expected_revert:
                logger.info("AGNI quote_route reverted for %s->%s: %s", route.token_in, route.token_out, exc)
            else:
                logger.warning("AGNI quote_route RPC error for %s->%s: %s", route.token_in, route.token_out, exc)
            amount_out = Decimal(0)
            amount_out_raw = None
            quoted_price = None
            slippage_bps = None
            block_number = None
            initialized_ticks_crossed = None
            gas_estimate = None
            sqrt_price_x96_after = None

            status = "quote_failed" if expected_revert else "rpc_error"
            status_code = DataStatusCode.LIQUIDITY_UNKNOWN.value
            status_reason = (
                f"AGNI QuoterV2 reverted for route {route.token_in}->{route.token_out}: {exc}"
                if expected_revert
                else f"AGNI QuoterV2 call failed: {exc}"
            )
            freshness_status = "quote_failed" if expected_revert else "rpc_error"

        raw_snapshot = RawQuoteSnapshot(
            snapshot_id=str(uuid4()),
            protocol="AGNI",
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
                "fee_tier": fee_tier,
                "sqrt_price_x96_after": str(sqrt_price_x96_after) if sqrt_price_x96_after is not None else None,
                "initialized_ticks_crossed": initialized_ticks_crossed,
                "gas_estimate": gas_estimate,
                "amount_in_raw": str(amount_in_raw),
            },
        )
        normalized_snapshot = NormalizedQuoteSnapshot(
            snapshot_id=str(uuid4()),
            protocol="AGNI",
            route_id=route.route_id or f"agni:{route.token_in}:{route.token_out}:{route.fee_tier_or_bin_step or route.route_type}",
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
            data_sources_used=["agni"],
        )
        return AgniQuoteAttempt(route=route, raw_snapshot=raw_snapshot, normalized_snapshot=normalized_snapshot)
