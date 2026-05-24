from __future__ import annotations

import unittest
from datetime import datetime
from services.agent.app.schemas.portfolio import PortfolioSnapshot, AssetBalance
from services.agent.app.schemas.risk import RiskSnapshot
from services.agent.app.schemas.allocation import AllocationDecision, RebalanceAction
from services.agent.strategies.decision_templates.fallback_rules import generate_deterministic_explanation
from services.agent.strategies.decision_templates.parser import generate_recommendation_reasoning
from services.agent.modules.oracle.freshness import utc_now


class AiFallbackTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = utc_now()
        self.balances = [
            AssetBalance(asset_symbol="USDC", balance=250000.0, value_usd=250000.0, weight=0.25),
            AssetBalance(asset_symbol="USDY", balance=428571.4, value_usd=450000.0, weight=0.45),
            AssetBalance(asset_symbol="mETH", balance=85.71, value_usd=300000.0, weight=0.30),
        ]
        self.portfolio = PortfolioSnapshot(
            snapshot_id="port_test_normal",
            wallet_or_vault="0xvault",
            total_value_usd=1000000.0,
            balances=self.balances,
            weights={"USDC": 0.25, "USDY": 0.45, "mETH": 0.30},
            status_code="DATA_FRESH",
            status_reason="",
            created_at=self.now
        )
        self.risk = RiskSnapshot(
            snapshot_id="risk_test_normal",
            total_score=10.0,
            risk_band="RISK_NORMAL",
            status_code="RISK_NORMAL",
            status_reason="",
            bucket_scores={},
            prechecks={},
            notes=[],
            created_at=self.now
        )
        self.decision = AllocationDecision(
            decision_id="dec_test",
            wallet_or_vault="0xvault",
            profile_name="Balanced",
            current_weights={"USDC": 0.25, "USDY": 0.45, "mETH": 0.30},
            target_weights={"USDC": 0.25, "USDY": 0.45, "mETH": 0.30},
            recommended_action="HOLD",
            confidence=0.90,
            reasoning="Reason text",
            risk_snapshot_id="risk_test_normal",
            status_code="RISK_NORMAL",
            created_at=self.now
        )

    def test_deterministic_explanation_hold(self) -> None:
        explanation = generate_deterministic_explanation(self.portfolio, self.risk, self.decision, [])
        self.assertIn("No portfolio adjustments are recommended at this time", explanation["reasoning_summary"])
        self.assertEqual(explanation["confidence"], 0.95)
        self.assertGreater(len(explanation["notes"]), 0)

    def test_deterministic_explanation_pause(self) -> None:
        self.decision.recommended_action = "PAUSE"
        self.risk.risk_band = "RISK_VETO"
        self.risk.notes = ["Oracle stale"]
        explanation = generate_deterministic_explanation(self.portfolio, self.risk, self.decision, [])
        self.assertIn("Vault operations are PAUSED", explanation["reasoning_summary"])
        self.assertEqual(explanation["confidence"], 0.99)
        self.assertIn("Risk alert: Oracle stale", explanation["notes"])

    def test_recommendation_parser_returns_valid_schema(self) -> None:
        import asyncio
        # Generate the full recommendation via parser (which will hit fallback because Ollama is not running)
        response = asyncio.run(generate_recommendation_reasoning(self.portfolio, self.risk, self.decision, []))
        self.assertEqual(response.recommended_action, "HOLD")
        self.assertEqual(response.confidence, 0.95)
        self.assertEqual(response.metadata["ai_reasoning_enabled"], False)
        self.assertEqual(response.metadata["mode"], "fallback_deterministic")


if __name__ == "__main__":
    unittest.main()
