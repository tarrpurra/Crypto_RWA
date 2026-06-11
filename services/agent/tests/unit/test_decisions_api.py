from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from services.agent.app.api.decisions import get_latest_decisions
from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.schemas.allocation import AllocationDecision
from services.agent.app.schemas.recommendations import AIDebugPayload, RecommendationResponse
from services.agent.modules.oracle.freshness import utc_now


class DecisionsApiTests(unittest.IsolatedAsyncioTestCase):
    @patch("services.agent.app.api.decisions.generate_recommendation_reasoning", new_callable=AsyncMock)
    @patch("services.agent.app.api.decisions.compute_rebalance")
    @patch("services.agent.modules.decisions.build_decision_context", new_callable=AsyncMock)
    async def test_get_latest_decisions_accepts_typed_ai_debug_payload(
        self,
        mock_build_context,
        mock_compute_rebalance,
        mock_generate_reasoning,
    ) -> None:
        mock_context = MagicMock()
        mock_context.portfolio = MagicMock()
        mock_context.risk_snapshot = MagicMock()
        mock_context.profile_name = "Balanced"
        mock_context.actual_portfolio = None
        mock_build_context.return_value = mock_context

        decision = AllocationDecision(
            decision_id="decision-1",
            wallet_or_vault="wallet-1",
            profile_name="Balanced",
            current_weights={"WMNT": 1.0},
            target_weights={"USDY": 0.5, "mETH": 0.5},
            recommended_action="REBALANCE",
            confidence=0.9,
            reasoning="Deterministic decision.",
            status_code=DataStatusCode.DATA_FRESH.value,
            created_at=utc_now(),
        )
        mock_compute_rebalance.return_value = (decision, [])
        mock_generate_reasoning.return_value = RecommendationResponse(
            asset="USDY, mETH",
            recommended_action="REBALANCE",
            risk_score=25.0,
            confidence=0.9,
            reasoning_summary="Reasoning available.",
            data_sources_used=["test"],
            hard_veto_status="NONE",
            required_human_approval_status="NOT_REQUIRED",
            status="ok",
            status_code=DataStatusCode.DATA_FRESH.value,
            status_label=DataStatusCode.DATA_FRESH.value,
            status_reason="All good.",
            runtime_mode="monitor_only",
            target_chain="mantle_sepolia",
            freshness_status=DataStatusCode.DATA_FRESH.value,
            constraints_applied=[],
            notes=[],
            ai_debug=AIDebugPayload(
                prompt="test prompt",
                mode="fallback_deterministic",
                used_fallback=True,
            ),
            metadata={},
        )

        response = await get_latest_decisions(wallet_address="0xabc")

        self.assertEqual(response.recommended_action, "REBALANCE")
        self.assertEqual(response.ai_debug.mode, "fallback_deterministic")
        mock_build_context.assert_awaited_once()
        mock_generate_reasoning.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
