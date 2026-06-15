from __future__ import annotations

import unittest
from datetime import timedelta
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch

from services.agent.app.api.decisions import get_latest_decisions, list_proposals
from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.schemas.allocation import AllocationDecision
from services.agent.app.schemas.recommendations import AIDebugPayload, RecommendationResponse
from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.models import InvestmentPlanRecord, TradeProposalRecord
from services.agent.repositories.db.session import create_session, init_db


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

    async def test_list_proposals_filters_by_wallet_address(self) -> None:
        init_db()
        now = utc_now()
        proposal_a = f"0xproposal_a_{uuid4().hex}"
        proposal_b = f"0xproposal_b_{uuid4().hex}"
        with create_session() as session:
            session.query(TradeProposalRecord).delete()
            session.query(InvestmentPlanRecord).delete()
            session.commit()
        with create_session() as session:
            session.add_all([
                TradeProposalRecord(
                    proposal_id=proposal_a,
                    plan_hash="0xplan_a",
                    wallet_or_vault="0xwallet_a",
                    router="0xrouter",
                    selector="0x12345678",
                    calldata_hash="0xhash_a",
                    token_in="0xtoken_in",
                    token_out="0xtoken_out",
                    recipient="0xrecipient",
                    max_amount_in="10",
                    min_amount_out="9",
                    native_value="0",
                    deadline=123,
                    proposal_expiry=456,
                    nonce=1,
                    status_code="PROPOSAL_PENDING_APPROVAL",
                    risk_snapshot_id="risk-a",
                    calldata="0xabc",
                    created_at=now - timedelta(minutes=1),
                    updated_at=now - timedelta(minutes=1),
                ),
                TradeProposalRecord(
                    proposal_id=proposal_b,
                    plan_hash="0xplan_b",
                    wallet_or_vault="0xwallet_b",
                    router="0xrouter",
                    selector="0x12345678",
                    calldata_hash="0xhash_b",
                    token_in="0xtoken_in",
                    token_out="0xtoken_out",
                    recipient="0xrecipient",
                    max_amount_in="20",
                    min_amount_out="18",
                    native_value="0",
                    deadline=123,
                    proposal_expiry=456,
                    nonce=2,
                    status_code="PROPOSAL_PENDING_APPROVAL",
                    risk_snapshot_id="risk-b",
                    calldata="0xdef",
                    created_at=now,
                    updated_at=now,
                ),
                InvestmentPlanRecord(
                    proposal_id=proposal_a,
                    plan_id="plan-a",
                    portfolio_address="0xwallet_a",
                    deposit_asset_symbol="WMNT",
                    deposit_amount="10",
                    deposit_value_usd="10",
                    plan_json={
                        "deposit_asset_symbol": "WMNT",
                        "deposit_amount": 10,
                        "risk_profile": "Balanced",
                        "allocation_mode": "AI Suggested",
                        "approval_enabled": True,
                        "approval_blockers": [],
                        "risk_assessment": {
                            "recommended_action": "REBALANCE",
                            "confidence": 88.3,
                            "reasoning_summary": "Move capital into the target basket.",
                        },
                        "linked_proposals": [
                            {
                                "proposal_id": proposal_a,
                                "token_in_symbol": "WMNT",
                                "token_out_symbol": "USDY",
                                "amount": 10,
                                "status_code": "PROPOSAL_PENDING_APPROVAL",
                            }
                        ],
                    },
                ),
            ])
            session.commit()

        response = await list_proposals(wallet_address="0xwallet_a")

        self.assertEqual(len(response.proposals), 1)
        self.assertEqual(response.proposals[0].proposal_id, proposal_a)
        self.assertEqual(response.proposals[0].token_in_symbol, "WMNT")
        self.assertEqual(response.proposals[0].token_out_symbol, "USDY")
        self.assertEqual(response.proposals[0].recommended_action, "REBALANCE")
        self.assertEqual(response.proposals[0].confidence, 88.3)
        self.assertEqual(response.proposals[0].reasoning_summary, "Move capital into the target basket.")


if __name__ == "__main__":
    unittest.main()
