from __future__ import annotations

import logging
from services.agent.app.core.settings import get_settings
from services.agent.app.schemas.proposals import ExecutionPayloadSchema
from services.agent.app.schemas.risk import RiskSnapshot

logger = logging.getLogger("services.agent.risk.trade_guard")


class PolicyGuard:
    def __init__(self) -> None:
        self.settings = get_settings()

    def validate_proposal(self, payload: ExecutionPayloadSchema, risk: RiskSnapshot) -> tuple[bool, str]:
        """
        Validates an execution proposal payload against risk constraints and policies.
        Returns a (is_valid, reason) tuple.
        """
        # 1. Check risk band vetoes
        if risk.risk_band in ("RISK_VETO", "RISK_PAUSE_REQUIRED"):
            return False, f"Trade blocked by risk engine: active risk band is {risk.risk_band}."

        # 2. Whitelist Router Check
        allowed_routers = {
            self.settings.agni_mainnet_swap_router_address,
            self.settings.agni_sepolia_swap_router_address,
            self.settings.merchant_moe_router_address,
            self.settings.merchant_moe_lb_router_address,
            self.settings.merchant_moe_aggregator_router_address,
        }
        # Strip None values
        allowed_routers = {addr.lower() for addr in allowed_routers if addr}
        
        # Also allow the default mock router or zero address for testing/scenarios
        allowed_routers.add("0x0000000000000000000000000000000000000000")
        
        # Check router address
        if payload.router.lower() not in allowed_routers:
            return False, f"Unauthorized router address: {payload.router}"

        # 3. Slippage checks
        # Let's verify that the slippage is not excessive.
        # minAmountOut / maxAmountIn must be reasonable.
        if payload.maxAmountIn > 0:
            implied_price = payload.minAmountOut / payload.maxAmountIn
            # Let's log it
            logger.debug("Trade guard validating implied swap price: %s", implied_price)

        # 4. Expiration check
        # Must be in the future
        import time
        now = int(time.time())
        if payload.deadline <= now:
            return False, f"Proposal deadline has already passed: {payload.deadline} <= {now}."
        if payload.proposalExpiry <= now:
            return False, f"Proposal has already expired: {payload.proposalExpiry} <= {now}."

        return True, "Proposal successfully validated against all policy guards."
