from __future__ import annotations

import unittest
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from services.agent.app.api.investment_scope import InvestmentScopeInput, build_scoped_allocation_response
from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import TargetChain


class InvestmentScopeTests(unittest.TestCase):
    @patch("services.agent.app.api.investment_scope._build_planned_swaps")
    @patch("services.agent.app.api.investment_scope._latest_price_map")
    def test_scoped_allocation_uses_fallback_pricing_for_stable_targets(self, mock_latest_prices, mock_build_swaps) -> None:
        mock_latest_prices.return_value = {"MNT": Decimal("1.5"), "USDY": Decimal("1"), "mETH": Decimal("2500")}
        mock_build_swaps.return_value = [
            SimpleNamespace(
                target_asset_symbol="USDY",
                quote=SimpleNamespace(route_id="route-usdy"),
            )
        ]

        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            simulation_fallback_enabled=True,
        )
        scope = InvestmentScopeInput(
            wallet_address="0xwallet",
            deposit_asset_symbol="MNT",
            deposit_amount=100.0,
            risk_profile="Balanced",
        )

        response = build_scoped_allocation_response(scope, settings)

        buy_usdy = next(
            action
            for action in response.rebalance_actions
            if action.asset_symbol == "USDY" and action.action == "BUY"
        )

        self.assertGreater(buy_usdy.amount, 0.0)
        self.assertNotIn("USDC", response.decision.target_weights)
        self.assertIn("USDC is excluded", response.decision.reasoning)
        self.assertEqual(response.decision.recommended_action, "REBALANCE")


if __name__ == "__main__":
    unittest.main()
