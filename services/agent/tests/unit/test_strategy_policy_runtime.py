from __future__ import annotations

import unittest
from unittest.mock import patch

from services.agent.modules.strategy_policy.runtime import derive_target_weights, resolve_requested_profile_name, resolve_target_weights
from services.agent.modules.strategy_policy.schemas import StrategyHardLimits, StrategyPolicyConfig, StrategyRiskWeights


class StrategyPolicyRuntimeTests(unittest.TestCase):
    def test_derive_target_weights_prefers_stable_reserve_for_conservative_policy(self) -> None:
        policy = StrategyPolicyConfig(
            strategy_version="v-test",
            objective="capital_preservation_first",
            allowed_assets=["USDY", "mETH"],
            risk_weights=StrategyRiskWeights(),
            hard_limits=StrategyHardLimits(
                max_slippage_bps=50,
                max_gas_gwei=50,
                max_asset_exposure_pct=35,
                max_issuer_exposure_pct=60,
                min_stable_reserve_pct=40,
                max_llm_influence_pct=35,
                max_risk_score_for_fresh_allocation=45,
                force_human_approval_risk_score=65,
                pause_risk_score=80,
                global_circuit_breaker=True,
            ),
            market_check_interval_seconds=300,
            quote_refresh_interval_seconds=120,
            risk_recompute_interval_seconds=300,
            proposal_expiry_seconds=180,
        )

        weights = derive_target_weights(policy)

        self.assertEqual(set(weights.keys()), {"USDY", "mETH"})
        self.assertAlmostEqual(sum(weights.values()), 1.0, places=5)
        self.assertGreaterEqual(weights["USDY"], 0.40)
        self.assertLessEqual(weights["mETH"], 0.35)

    def test_derive_target_weights_returns_full_weight_for_single_allowed_asset(self) -> None:
        policy = StrategyPolicyConfig(
            strategy_version="v-test",
            objective="emergency_defensive",
            allowed_assets=["USDY"],
            risk_weights=StrategyRiskWeights(),
            hard_limits=StrategyHardLimits(),
            market_check_interval_seconds=300,
            quote_refresh_interval_seconds=120,
            risk_recompute_interval_seconds=300,
            proposal_expiry_seconds=180,
        )

        weights = derive_target_weights(policy)

        self.assertEqual(weights, {"USDY": 1.0})

    @patch("services.agent.modules.strategy_policy.runtime.resolve_active_strategy_target_weights")
    def test_resolve_target_weights_prefers_active_strategy(self, mock_active_strategy) -> None:
        policy = StrategyPolicyConfig(
            strategy_version="v-active",
            objective="balanced_yield",
            allowed_assets=["USDY", "mETH"],
            risk_weights=StrategyRiskWeights(),
            hard_limits=StrategyHardLimits(),
            market_check_interval_seconds=300,
            quote_refresh_interval_seconds=120,
            risk_recompute_interval_seconds=300,
            proposal_expiry_seconds=180,
        )
        mock_active_strategy.return_value = ("Custom Strategy v-active", {"USDY": 0.6, "mETH": 0.4}, policy)

        profile_name, weights, resolved_policy = resolve_target_weights(
            "Balanced",
            "mantle_sepolia",
            user_address="0xabc",
        )

        self.assertEqual(profile_name, "Custom Strategy v-active")
        self.assertEqual(weights, {"USDY": 0.6, "mETH": 0.4})
        self.assertIs(resolved_policy, policy)
        mock_active_strategy.assert_called_once_with(user_address="0xabc")

    @patch("services.agent.modules.strategy_policy.runtime.resolve_active_strategy_target_weights")
    def test_resolve_requested_profile_name_accepts_custom_strategy_alias(self, mock_active_strategy) -> None:
        policy = StrategyPolicyConfig(
            strategy_version="v-active",
            objective="balanced_yield",
            allowed_assets=["USDY", "mETH"],
            risk_weights=StrategyRiskWeights(),
            hard_limits=StrategyHardLimits(),
            market_check_interval_seconds=300,
            quote_refresh_interval_seconds=120,
            risk_recompute_interval_seconds=300,
            proposal_expiry_seconds=180,
        )
        mock_active_strategy.return_value = ("Custom Strategy v-active", {"USDY": 0.6, "mETH": 0.4}, policy)

        resolved = resolve_requested_profile_name(
            "Custom Strategy",
            "mantle_sepolia",
            user_address="0xabc",
        )

        self.assertEqual(resolved, "Custom Strategy v-active")
        mock_active_strategy.assert_called_once_with(user_address="0xabc")


if __name__ == "__main__":
    unittest.main()
