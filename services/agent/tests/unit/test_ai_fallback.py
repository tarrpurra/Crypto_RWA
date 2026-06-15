from __future__ import annotations

import unittest
import json
from datetime import datetime
from services.agent.app.core.settings import get_settings
from services.agent.app.schemas.portfolio import PortfolioSnapshot, AssetBalance
from services.agent.app.schemas.risk import RiskSnapshot
from services.agent.app.schemas.allocation import AllocationDecision, RebalanceAction
from services.agent.strategies.decision_templates.fallback_rules import generate_deterministic_explanation
from services.agent.strategies.decision_templates.prompt_builder import build_allocation_prompt, build_reasoning_prompt
from services.agent.strategies.decision_templates.parser import generate_recommendation_reasoning, _override_with_ai_decision
from services.agent.modules.oracle.freshness import utc_now


class AiFallbackTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = get_settings()
        self.original_ai_reasoning_enabled = self.settings.ai_reasoning_enabled
        self.settings.ai_reasoning_enabled = False
        self.now = utc_now()
        self.balances = [
            AssetBalance(asset_symbol="USDY", balance=550000.0, value_usd=550000.0, weight=0.55),
            AssetBalance(asset_symbol="mETH", balance=128.57, value_usd=450000.0, weight=0.45),
        ]
        self.portfolio = PortfolioSnapshot(
            snapshot_id="port_test_normal",
            wallet_or_vault="0xvault",
            total_value_usd=1000000.0,
            balances=self.balances,
            weights={"USDY": 0.55, "mETH": 0.45},
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
            current_weights={"USDY": 0.55, "mETH": 0.45},
            target_weights={"USDY": 0.55, "mETH": 0.45},
            recommended_action="HOLD",
            confidence=0.90,
            reasoning="Reason text",
            risk_snapshot_id="risk_test_normal",
            status_code="RISK_NORMAL",
            created_at=self.now
        )

    def tearDown(self) -> None:
        self.settings.ai_reasoning_enabled = self.original_ai_reasoning_enabled

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
        response = asyncio.run(generate_recommendation_reasoning(self.portfolio, self.risk, self.decision, []))
        self.assertEqual(response.recommended_action, "HOLD")
        self.assertEqual(response.confidence, 0.95)
        self.assertEqual(response.metadata["ai_reasoning_enabled"], False)
        self.assertEqual(response.metadata["mode"], "fallback_deterministic")

    def test_recommendation_parser_focuses_asset_field_on_actionable_legs(self) -> None:
        import asyncio

        rebalance_actions = [
            RebalanceAction(asset_symbol="USDY", action="BUY", amount=37.5, route_id="route-usdy"),
            RebalanceAction(asset_symbol="mETH", action="HOLD", amount=12.0, route_id=None),
        ]

        response = asyncio.run(
            generate_recommendation_reasoning(
                self.portfolio,
                self.risk,
                self.decision,
                rebalance_actions,
            )
        )

        self.assertEqual(response.asset, "USDY")

    def test_prompt_builder_decision_maker_mode_includes_action_field(self) -> None:
        prompt = build_reasoning_prompt(self.portfolio, self.risk, self.decision, [], ai_decision_maker=True)
        self.assertIn("recommended_action", prompt)
        self.assertIn("AI Decision Maker", prompt)
        self.assertIn("cannot override", prompt.lower())

    def test_prompt_builder_reasoning_mode_omits_action_field(self) -> None:
        prompt = build_reasoning_prompt(self.portfolio, self.risk, self.decision, [], ai_decision_maker=False)
        self.assertIn("AI Reasoning Layer", prompt)
        self.assertNotIn("recommended_action", prompt)

    def test_prompt_builder_includes_wallet_holdings_and_swap_routes(self) -> None:
        allocation_prompt = build_allocation_prompt(
            portfolio_value_usd=1000000.0,
            deposit_asset_symbol="MNT",
            deposit_amount=498.0,
            target_weights={"USDY": 0.6, "mETH": 0.4},
            risk_status="RISK_REBALANCE_ONLY",
            risk_score=24.5,
            risk_notes=["Risk scoring is deterministic and advisory."],
            profile_name="Balanced",
            portfolio_balances=[
                {"asset_symbol": "USDY", "balance": 450000.0, "value_usd": 450000.0, "weight": 0.45},
                {"asset_symbol": "mETH", "balance": 75.0, "value_usd": 300000.0, "weight": 0.30},
            ],
        )
        self.assertIn("Current Wallet Holdings", allocation_prompt)
        self.assertIn("USDY", allocation_prompt)
        self.assertIn("mETH", allocation_prompt)

        rebalance_actions = [
            RebalanceAction(
                asset_symbol="USDY",
                action="BUY",
                amount=37.5,
                route_id="route-usdy",
                token_in_symbol="WMNT",
                token_out_symbol="USDY",
                swap_pair_label="WMNT -> USDY",
            )
        ]
        reasoning_prompt = build_reasoning_prompt(
            self.portfolio,
            self.risk,
            self.decision,
            rebalance_actions,
            ai_decision_maker=True,
        )
        self.assertIn("swap_pair_label", reasoning_prompt)
        self.assertIn("token_in_symbol", reasoning_prompt)
        self.assertIn("WMNT -> USDY", reasoning_prompt)

    def test_override_with_ai_decision_preserves_deterministic_action(self) -> None:
        ai_output = {
            "recommended_action": "REBALANCE",
            "reasoning_summary": "AI thinks rebalance is warranted",
            "confidence": 0.85,
            "notes": ["note 1"],
        }
        overridden = _override_with_ai_decision(self.decision, ai_output)
        self.assertEqual(overridden.recommended_action, self.decision.recommended_action)
        self.assertEqual(overridden.confidence, self.decision.confidence)
        self.assertEqual(overridden.reasoning, self.decision.reasoning)

    def test_override_with_ai_decision_invalid_action_falls_back(self) -> None:
        ai_output = {
            "recommended_action": "INVALID_ACTION",
            "reasoning_summary": "bad",
            "confidence": 0.5,
            "notes": [],
        }
        overridden = _override_with_ai_decision(self.decision, ai_output)
        # Should fall back to original decision action
        self.assertEqual(overridden.recommended_action, self.decision.recommended_action)

    def test_override_with_ai_decision_missing_action_uses_original(self) -> None:
        ai_output = {
            "reasoning_summary": "no action field",
            "confidence": 0.5,
            "notes": [],
        }
        overridden = _override_with_ai_decision(self.decision, ai_output)
        self.assertEqual(overridden.recommended_action, self.decision.recommended_action)


if __name__ == "__main__":
    unittest.main()
