from __future__ import annotations

import unittest
from datetime import datetime
from services.agent.app.schemas.portfolio import PortfolioSnapshot, AssetBalance
from services.agent.app.schemas.risk import RiskSnapshot
from services.agent.strategies.allocation.rebalance import compute_rebalance
from services.agent.strategies.allocation.clip_sizing import clip_trade_amount
from services.agent.strategies.allocation.profiles import get_allocation_profile_for_chain
from services.agent.modules.oracle.freshness import utc_now


from unittest.mock import MagicMock, patch


class AllocationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = utc_now()
        # Mock database session to prevent live DB connections in tests
        self.db_patcher = patch("services.agent.repositories.db.session.create_session")
        self.mock_create_session = self.db_patcher.start()
        self.mock_session = MagicMock()
        self.mock_session.__enter__.return_value = self.mock_session
        self.mock_session.scalar.return_value = None
        self.mock_create_session.return_value = self.mock_session

        # Override Balanced profile to contain USDC, USDY, and mETH for test compatibility
        from services.agent.strategies.allocation.profiles import ALLOCATION_PROFILES
        self.original_balanced = ALLOCATION_PROFILES["Balanced"]
        ALLOCATION_PROFILES["Balanced"] = {"USDC": 0.25, "USDY": 0.45, "mETH": 0.30}

        self.risk_normal = RiskSnapshot(
            snapshot_id="risk_test_normal",
            total_score=10.0,
            risk_band="RISK_NORMAL",
            status_code="RISK_NORMAL",
            status_reason="Risk is low.",
            bucket_scores={},
            prechecks={},
            notes=[],
            created_at=self.now
        )
        self.risk_veto = RiskSnapshot(
            snapshot_id="risk_test_veto",
            total_score=100.0,
            risk_band="RISK_VETO",
            status_code="RISK_VETO",
            status_reason="Oracle is stale.",
            bucket_scores={},
            prechecks={},
            notes=["Oracle is stale"],
            created_at=self.now
        )

    def tearDown(self) -> None:
        self.db_patcher.stop()
        from services.agent.strategies.allocation.profiles import ALLOCATION_PROFILES
        ALLOCATION_PROFILES["Balanced"] = self.original_balanced

    def test_no_rebalance_when_within_drift_tolerance(self) -> None:
        # Balanced target: USDC: 0.25, USDY: 0.45, mETH: 0.30
        # Current portfolio has exactly balanced weights
        balances = [
            AssetBalance(asset_symbol="USDC", balance=250000.0, value_usd=250000.0, weight=0.25),
            AssetBalance(asset_symbol="USDY", balance=428571.4, value_usd=450000.0, weight=0.45),
            AssetBalance(asset_symbol="mETH", balance=85.71, value_usd=300000.0, weight=0.30),
        ]
        portfolio = PortfolioSnapshot(
            snapshot_id="port_test_balanced",
            wallet_or_vault="0xvault",
            total_value_usd=1000000.0,
            balances=balances,
            weights={"USDC": 0.25, "USDY": 0.45, "mETH": 0.30},
            status_code="DATA_FRESH",
            status_reason="",
            created_at=self.now
        )

        decision, actions = compute_rebalance(portfolio, self.risk_normal, "Balanced")
        self.assertEqual(decision.recommended_action, "HOLD")
        self.assertEqual(len(actions), 0)

    def test_rebalance_triggered_when_outside_drift_tolerance(self) -> None:
        # Current portfolio is heavily skewed (mETH is 50%, USDC is 5%)
        balances = [
            AssetBalance(asset_symbol="USDC", balance=50000.0, value_usd=50000.0, weight=0.05),
            AssetBalance(asset_symbol="USDY", balance=428571.4, value_usd=450000.0, weight=0.45),
            AssetBalance(asset_symbol="mETH", balance=142.85, value_usd=500000.0, weight=0.50),
        ]
        portfolio = PortfolioSnapshot(
            snapshot_id="port_test_skewed",
            wallet_or_vault="0xvault",
            total_value_usd=1000000.0,
            balances=balances,
            weights={"USDC": 0.05, "USDY": 0.45, "mETH": 0.50},
            status_code="DATA_FRESH",
            status_reason="",
            created_at=self.now
        )

        decision, actions = compute_rebalance(portfolio, self.risk_normal, "Balanced")
        self.assertEqual(decision.recommended_action, "REBALANCE")
        # Should want to SELL mETH and BUY USDC
        self.assertGreater(len(actions), 0)
        
        sell_meth = next((a for a in actions if a.asset_symbol == "mETH" and a.action == "SELL"), None)
        buy_usdc = next((a for a in actions if a.asset_symbol == "USDC" and a.action == "BUY"), None)
        self.assertIsNotNone(sell_meth)
        self.assertIsNotNone(buy_usdc)

    def test_block_execution_during_veto(self) -> None:
        balances = [
            AssetBalance(asset_symbol="USDC", balance=50000.0, value_usd=50000.0, weight=0.05),
            AssetBalance(asset_symbol="USDY", balance=428571.4, value_usd=450000.0, weight=0.45),
            AssetBalance(asset_symbol="mETH", balance=142.85, value_usd=500000.0, weight=0.50),
        ]
        portfolio = PortfolioSnapshot(
            snapshot_id="port_test_skewed",
            wallet_or_vault="0xvault",
            total_value_usd=1000000.0,
            balances=balances,
            weights={"USDC": 0.05, "USDY": 0.45, "mETH": 0.50},
            status_code="DATA_FRESH",
            status_reason="",
            created_at=self.now
        )

        decision, actions = compute_rebalance(portfolio, self.risk_veto, "Balanced")
        self.assertEqual(decision.recommended_action, "PAUSE")
        self.assertEqual(len(actions), 0)

    def test_sepolia_test_profile_is_accepted(self) -> None:
        balances = [
            AssetBalance(asset_symbol="USDY", balance=500000.0, value_usd=500000.0, weight=0.50),
            AssetBalance(asset_symbol="mETH", balance=100.0, value_usd=500000.0, weight=0.50),
        ]
        portfolio = PortfolioSnapshot(
            snapshot_id="port_test_sepolia",
            wallet_or_vault="0xvault",
            total_value_usd=1000000.0,
            balances=balances,
            weights={"USDY": 0.50, "mETH": 0.50},
            status_code="DATA_FRESH",
            status_reason="",
            created_at=self.now
        )

        decision, actions = compute_rebalance(portfolio, self.risk_normal, "Sepolia Test")
        self.assertEqual(decision.profile_name, "Sepolia Test")
        self.assertEqual(decision.recommended_action, "HOLD")
        self.assertEqual(len(actions), 0)

    def test_missing_position_pricing_does_not_look_normal(self) -> None:
        balances = [
            AssetBalance(asset_symbol="USDC", balance=1.0, value_usd=0.0, weight=0.0),
            AssetBalance(asset_symbol="USDY", balance=1.0, value_usd=0.0, weight=0.0),
            AssetBalance(asset_symbol="mETH", balance=1.0, value_usd=0.0, weight=0.0),
        ]
        portfolio = PortfolioSnapshot(
            snapshot_id="port_test_missing_prices",
            wallet_or_vault="0xvault",
            total_value_usd=1000000.0,
            balances=balances,
            weights={"USDC": 0.0, "USDY": 0.0, "mETH": 0.0},
            status_code="DATA_FRESH",
            status_reason="",
            created_at=self.now
        )

        decision, actions = compute_rebalance(portfolio, self.risk_normal, "Balanced")
        self.assertEqual(actions, [])
        self.assertEqual(decision.recommended_action, "HOLD")
        self.assertEqual(decision.status_code, "RISK_REBALANCE_ONLY")

    def test_clip_sizing_rules(self) -> None:
        total_port_value = 1000000.0  # $1M
        # mETH limit: 10% of portfolio ($100k) or $30k -> should clip to $30k
        clipped_meth = clip_trade_amount("mETH", 50000.0, total_port_value)
        self.assertEqual(clipped_meth, 30000.0)

        # USDY limit: 15% of portfolio ($150k) or $50k -> should clip to $50k
        clipped_usdy = clip_trade_amount("USDY", 80000.0, total_port_value)
        self.assertEqual(clipped_usdy, 50000.0)

        # USDC limit: 20% of portfolio ($200k) or $75k -> should clip to $75k
        clipped_usdc = clip_trade_amount("USDC", 90000.0, total_port_value)
        self.assertEqual(clipped_usdc, 75000.0)

    def test_sepolia_chain_profiles_strip_usdc(self) -> None:
        profile_name, weights = get_allocation_profile_for_chain("Balanced", "mantle_sepolia")

        self.assertEqual(profile_name, "Balanced")
        self.assertNotIn("USDC", weights)
        self.assertAlmostEqual(weights["USDY"], 0.6)
        self.assertAlmostEqual(weights["mETH"], 0.4)
        self.assertAlmostEqual(sum(weights.values()), 1.0)


if __name__ == "__main__":
    unittest.main()
