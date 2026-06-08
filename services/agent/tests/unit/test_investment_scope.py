from __future__ import annotations

import asyncio
import unittest
from decimal import Decimal
from unittest.mock import AsyncMock, patch, MagicMock

from services.agent.app.api.investment_scope import InvestmentScopeInput, build_scoped_allocation_response, build_scoped_decision_response
from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import TargetChain, RiskStatusCode, DataStatusCode
from services.agent.app.schemas.allocation import AllocationDecision, AllocationDecisionResponse
from services.agent.app.schemas.risk import RiskAssessmentResponse, RiskBucket
from services.agent.app.schemas.recommendations import AIDebugPayload, RecommendationResponse
from services.agent.modules.oracle.freshness import utc_now


def _make_risk_assessment(status_code: str = RiskStatusCode.RISK_NORMAL.value, hard_veto: bool = False) -> RiskAssessmentResponse:
    return RiskAssessmentResponse(
        asset="portfolio",
        recommended_action="monitor" if not hard_veto else "pause",
        risk_score=100.0 if hard_veto else 25.0,
        risk_band=status_code,
        confidence=0.25 if hard_veto else 0.85,
        reasoning_summary="Test risk",
        data_sources_used=["test"],
        hard_veto_status="active" if hard_veto else "inactive",
        required_human_approval_status="required",
        status="degraded" if hard_veto else "ok",
        status_code=status_code,
        status_label=status_code,
        status_reason="Test risk reason",
        generated_at=utc_now(),
        runtime_mode="monitor_only",
        target_chain="mantle_sepolia",
        freshness_status=DataStatusCode.DATA_FRESH.value,
        buckets=[
            RiskBucket(
                bucket="test",
                score=100.0 if hard_veto else 10.0,
                weight=1.0,
                status="blocked" if hard_veto else "ok",
                status_code=status_code,
                reason="test",
                hard_veto=hard_veto,
                data_sources_used=["test"],
            )
        ],
        notes=["test note"],
        metadata={"risk_snapshot_id": "test_risk_id"},
    )


class InvestmentScopeTests(unittest.IsolatedAsyncioTestCase):
    @patch("services.agent.modules.decisions.context._latest_market_context_best_effort_async", new_callable=AsyncMock)
    @patch("services.agent.modules.decisions.context.current_portfolio", new_callable=AsyncMock)
    async def test_build_decision_context_reuses_parallel_market_and_portfolio_reads(
        self,
        mock_current_portfolio,
        mock_market_context,
    ) -> None:
        from services.agent.modules.decisions.context import build_decision_context
        from services.agent.app.schemas.portfolio import PortfolioSnapshotResponse

        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            simulation_fallback_enabled=True,
        )

        portfolio_response = PortfolioSnapshotResponse(
            snapshot_id="portfolio-1",
            generated_at=utc_now(),
            portfolio_address="0xwallet",
            chain_id=5003,
            base_currency="USD",
            total_value_usd="100",
            positions=[],
            data_sources_used=[],
            status="ok",
            status_code=DataStatusCode.DATA_FRESH.value,
            status_label=DataStatusCode.DATA_FRESH.value,
            status_reason="fresh",
        )
        mock_current_portfolio.return_value = portfolio_response
        mock_market_context.return_value = ([], [])

        context = await build_decision_context(wallet_address="0xwallet")

        self.assertEqual(context.portfolio_response.snapshot_id, "portfolio-1")
        mock_current_portfolio.assert_awaited_once()
        mock_market_context.assert_awaited_once()

    @patch("services.agent.app.api.investment_scope.generate_ai_allocation")
    @patch("services.agent.modules.decisions.build_decision_context")
    async def test_scoped_allocation_calls_ai_with_context(self, mock_build_ctx, mock_ai_alloc) -> None:
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

        mock_ctx = MagicMock()
        mock_ctx.portfolio.total_value_usd = 100.0
        mock_ctx.portfolio.weights = {"MNT": 0.0, "USDY": 0.50, "mETH": 0.50}
        mock_ctx.profile_name = "Balanced"
        mock_ctx.risk_assessment = _make_risk_assessment()
        mock_build_ctx.return_value = mock_ctx

        mock_ai_alloc.return_value = (
            AllocationDecision(
                decision_id="test_dec",
                wallet_or_vault="investment_scope",
                profile_name="Balanced",
                current_weights={"MNT": 1.0},
                target_weights={"MNT": 0.0, "USDY": 0.50, "mETH": 0.50},
                recommended_action="REBALANCE",
                confidence=0.90,
                reasoning="AI test allocation",
                status_code=DataStatusCode.DATA_FRESH.value,
                created_at=utc_now(),
            ),
            [],
        )

        response = await build_scoped_allocation_response(scope, settings)

        self.assertIsInstance(response, AllocationDecisionResponse)
        self.assertEqual(response.decision.recommended_action, "REBALANCE")
        mock_build_ctx.assert_called_once()
        mock_ai_alloc.assert_called_once()

    @patch("services.agent.app.api.investment_scope.generate_ai_allocation")
    @patch("services.agent.modules.decisions.build_decision_context")
    async def test_scoped_allocation_pause_on_veto(self, mock_build_ctx, mock_ai_alloc) -> None:
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

        mock_ctx = MagicMock()
        mock_ctx.portfolio.total_value_usd = 100.0
        mock_ctx.portfolio.weights = {"MNT": 0.0, "USDY": 0.50, "mETH": 0.50}
        mock_ctx.profile_name = "Balanced"
        mock_ctx.risk_assessment = _make_risk_assessment(RiskStatusCode.RISK_VETO.value, hard_veto=True)
        mock_build_ctx.return_value = mock_ctx

        mock_ai_alloc.return_value = (
            AllocationDecision(
                decision_id="test_dec",
                wallet_or_vault="investment_scope",
                profile_name="Balanced",
                current_weights={"MNT": 1.0},
                target_weights={"MNT": 0.0, "USDY": 0.50, "mETH": 0.50},
                recommended_action="PAUSE",
                confidence=0.99,
                reasoning="Blocked by RISK_VETO",
                status_code=RiskStatusCode.RISK_VETO.value,
                created_at=utc_now(),
            ),
            [],
        )

        response = await build_scoped_allocation_response(scope, settings)

        self.assertEqual(response.decision.recommended_action, "PAUSE")
        self.assertEqual(response.status, "degraded")

    @patch("services.agent.app.api.investment_scope.generate_recommendation_reasoning")
    @patch("services.agent.app.api.investment_scope.generate_ai_allocation")
    @patch("services.agent.modules.decisions.build_decision_context")
    async def test_scoped_decision_uses_canonical_risk(self, mock_build_ctx, mock_ai_alloc, mock_reasoning) -> None:
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

        mock_ctx = MagicMock()
        mock_ctx.portfolio.total_value_usd = 100.0
        mock_ctx.portfolio.weights = {"MNT": 0.0, "USDY": 0.50, "mETH": 0.50}
        mock_ctx.profile_name = "Balanced"
        mock_ctx.risk_assessment = _make_risk_assessment()
        mock_ctx.risk_snapshot = MagicMock()
        mock_ctx.risk_snapshot.total_score = 25.0
        mock_ctx.risk_snapshot.risk_band = RiskStatusCode.RISK_NORMAL.value
        mock_build_ctx.return_value = mock_ctx

        mock_ai_alloc.return_value = (
            AllocationDecision(
                decision_id="test_dec",
                wallet_or_vault="investment_scope",
                profile_name="Balanced",
                current_weights={"MNT": 1.0},
                target_weights={"MNT": 0.0, "USDY": 0.50, "mETH": 0.50},
                recommended_action="REBALANCE",
                confidence=0.90,
                reasoning="AI test",
                status_code=DataStatusCode.DATA_FRESH.value,
                created_at=utc_now(),
            ),
            [],
        )
        mock_reasoning.return_value = RecommendationResponse(
            asset="USDY",
            recommended_action="REBALANCE",
            risk_score=25.0,
            confidence=0.90,
            reasoning_summary="AI reasoning",
            hard_veto_status="NONE",
            required_human_approval_status="NOT_REQUIRED",
            status="ok",
            status_code=DataStatusCode.DATA_FRESH.value,
            status_label=DataStatusCode.DATA_FRESH.value,
            status_reason="All good",
            runtime_mode="monitor_only",
            target_chain="mantle_sepolia",
            freshness_status=DataStatusCode.DATA_FRESH.value,
            constraints_applied=[],
            notes=[],
            ai_debug=AIDebugPayload(prompt="test", mode="test", used_fallback=False),
            metadata={},
        )

        response = await build_scoped_decision_response(scope, settings)

        self.assertIsInstance(response, RecommendationResponse)
        self.assertEqual(response.recommended_action, "REBALANCE")
        mock_build_ctx.assert_called_once()
        mock_ai_alloc.assert_called_once()
        mock_reasoning.assert_called_once()


class AllocationGuardrailsTests(unittest.TestCase):
    def setUp(self):
        from services.agent.strategies.decision_templates.parser import _apply_allocation_guardrails, _deterministic_allocation
        self._apply_guardrails = _apply_allocation_guardrails
        self._deterministic = _deterministic_allocation

    def test_deterministic_allocates_by_weight(self):
        decision, actions = self._deterministic(
            deposit_asset_symbol="MNT",
            deposit_amount=100.0,
            target_weights={"MNT": 0.0, "USDY": 0.50, "mETH": 0.50},
            risk_assessment=_make_risk_assessment(),
            profile_name="Balanced",
        )
        self.assertEqual(decision.recommended_action, "REBALANCE")
        buy_assets = {a.asset_symbol for a in actions if a.action == "BUY"}
        self.assertIn("USDY", buy_assets)
        self.assertIn("mETH", buy_assets)

    def test_deterministic_pauses_on_veto(self):
        decision, actions = self._deterministic(
            deposit_asset_symbol="MNT",
            deposit_amount=100.0,
            target_weights={"MNT": 0.0, "USDY": 0.50, "mETH": 0.50},
            risk_assessment=_make_risk_assessment(RiskStatusCode.RISK_VETO.value, hard_veto=True),
            profile_name="Balanced",
        )
        self.assertEqual(decision.recommended_action, "PAUSE")
        self.assertEqual(len(actions), 0)

    def test_guardrails_block_veto(self):
        risk = _make_risk_assessment(RiskStatusCode.RISK_VETO.value, hard_veto=True)
        decision, actions = self._apply_guardrails(
            ai_response={"recommended_action": "REBALANCE", "allocations": [{"asset": "USDY", "action": "BUY", "amount": 50}]},
            deposit_amount=100.0,
            deposit_asset_symbol="MNT",
            target_weights={"MNT": 0.0, "USDY": 0.50, "mETH": 0.50},
            risk_assessment=risk,
            profile_name="Balanced",
        )
        self.assertEqual(decision.recommended_action, "PAUSE")
        self.assertEqual(len(actions), 0)

    def test_guardrails_pass_through_valid_allocations(self):
        risk = _make_risk_assessment()
        decision, actions = self._apply_guardrails(
            ai_response={
                "recommended_action": "REBALANCE",
                "allocations": [
                    {"asset": "MNT", "action": "HOLD", "amount": 10.0},
                    {"asset": "USDY", "action": "BUY", "amount": 45.0},
                    {"asset": "mETH", "action": "BUY", "amount": 45.0},
                ],
                "confidence": 0.90,
                "reasoning_summary": "test",
                "notes": ["note"],
            },
            deposit_amount=100.0,
            deposit_asset_symbol="MNT",
            target_weights={"MNT": 0.0, "USDY": 0.50, "mETH": 0.50},
            risk_assessment=risk,
            profile_name="Balanced",
        )
        self.assertEqual(decision.recommended_action, "REBALANCE")
        self.assertGreater(len(actions), 0)
        self.assertIn(DataStatusCode.DATA_FRESH.value, decision.status_code)


if __name__ == "__main__":
    unittest.main()
