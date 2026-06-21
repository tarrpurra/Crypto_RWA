from __future__ import annotations

import unittest
from datetime import timedelta
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch

from services.agent.app.api.decisions import get_latest_decisions, list_proposals
from services.agent.app.api.decisions import execute_proposal
from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import TargetChain
from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.schemas.allocation import AllocationDecision
from services.agent.app.schemas.recommendations import AIDebugPayload, RecommendationResponse
from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.models import InvestmentPlanRecord, TradeExecutionRecord, TradeProposalRecord
from services.agent.repositories.db.session import create_session, init_db
import services.agent.repositories.db.session as db_session


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

    @patch("services.agent.repositories.db.session.get_settings")
    @patch("services.agent.app.api.decisions.submit_executor_vault_trade")
    @patch("services.agent.app.api.decisions.get_settings")
    async def test_execute_proposal_submits_vault_transaction(
        self,
        get_settings,
        submit_executor_vault_trade,
        db_get_settings,
    ) -> None:
        db_get_settings.return_value = Settings(
            _env_file=None,
            app_env="test",
            target_chain=TargetChain.MANTLE_SEPOLIA,
            database_url="sqlite+pysqlite:///:memory:",
        )
        db_session._ENGINE = None
        db_session._SESSION_FACTORY = None
        init_db()
        now = utc_now()
        proposal_id = f"0xproposal_{uuid4().hex}"
        with create_session() as session:
            session.query(TradeExecutionRecord).delete()
            session.query(TradeProposalRecord).delete()
            session.query(InvestmentPlanRecord).delete()
            session.add(
                TradeProposalRecord(
                    proposal_id=proposal_id,
                    plan_hash="0xplan",
                    wallet_or_vault="0xwallet",
                    router="0xrouter",
                    selector="0x12345678",
                    calldata_hash="0xcalldatahash",
                    token_in="0xtoken_in",
                    token_out="0xtoken_out",
                    recipient="0xrecipient",
                    max_amount_in="10",
                    min_amount_out="9",
                    native_value="0",
                    deadline=123,
                    proposal_expiry=456,
                    nonce=1,
                    status_code="PROPOSAL_APPROVED",
                    risk_snapshot_id=None,
                    calldata="0x1234",
                    created_at=now,
                    updated_at=now,
                )
            )
            session.commit()

        get_settings.return_value = Settings(
            _env_file=None,
            target_chain=TargetChain.MANTLE_SEPOLIA,
            executor_vault_address="0x301e982dbc40f4aa42C291427E7cB0E9491102F1",
            executor_private_key="0x" + "11" * 32,
            mantle_sepolia_rpc_url="http://example",
        )
        submit_executor_vault_trade.return_value = MagicMock(tx_hash="0xabc123", receipt_status=None)

        response = await execute_proposal(proposal_id)

        self.assertEqual(response.status_code, "EXECUTION_SUBMITTED")
        self.assertEqual(response.tx_hash, "0xabc123")
        with create_session() as session:
            proposal = session.query(TradeProposalRecord).filter_by(proposal_id=proposal_id).one()
            execution = session.query(TradeExecutionRecord).filter_by(proposal_id=proposal_id).one()
        self.assertEqual(proposal.status_code, "PROPOSAL_EXECUTING")
        self.assertEqual(execution.status_code, "EXECUTION_SUBMITTED")
        self.assertEqual(execution.tx_hash, "0xabc123")

    @patch("services.agent.repositories.db.session.get_settings")
    @patch("services.agent.app.api.decisions.submit_executor_vault_trade")
    @patch("services.agent.app.api.decisions.get_settings")
    async def test_execute_proposal_marks_confirmed_when_receipt_mines(
        self,
        get_settings,
        submit_executor_vault_trade,
        db_get_settings,
    ) -> None:
        db_get_settings.return_value = Settings(
            _env_file=None,
            app_env="test",
            target_chain=TargetChain.MANTLE_SEPOLIA,
            database_url="sqlite+pysqlite:///:memory:",
        )
        db_session._ENGINE = None
        db_session._SESSION_FACTORY = None
        init_db()
        now = utc_now()
        proposal_id = f"0xproposal_confirmed_{uuid4().hex}"
        with create_session() as session:
            session.query(TradeExecutionRecord).delete()
            session.query(TradeProposalRecord).delete()
            session.query(InvestmentPlanRecord).delete()
            session.add(
                TradeProposalRecord(
                    proposal_id=proposal_id,
                    plan_hash="0xplan",
                    wallet_or_vault="0xwallet",
                    router="0xrouter",
                    selector="0x12345678",
                    calldata_hash="0xcalldatahash",
                    token_in="0xtoken_in",
                    token_out="0xtoken_out",
                    recipient="0xrecipient",
                    max_amount_in="10",
                    min_amount_out="9",
                    native_value="0",
                    deadline=123,
                    proposal_expiry=456,
                    nonce=1,
                    status_code="PROPOSAL_APPROVED",
                    risk_snapshot_id=None,
                    calldata="0x1234",
                    created_at=now,
                    updated_at=now,
                )
            )
            session.commit()

        get_settings.return_value = Settings(
            _env_file=None,
            target_chain=TargetChain.MANTLE_SEPOLIA,
            executor_vault_address="0x301e982dbc40f4aa42C291427E7cB0E9491102F1",
            executor_private_key="0x" + "11" * 32,
            mantle_sepolia_rpc_url="http://example",
        )
        submit_executor_vault_trade.return_value = MagicMock(
            tx_hash="0xdef456",
            receipt_status=1,
            receipt_block_number=123,
        )

        response = await execute_proposal(proposal_id)

        self.assertEqual(response.status_code, "EXECUTION_CONFIRMED")
        self.assertEqual(response.tx_hash, "0xdef456")
        with create_session() as session:
            proposal = session.query(TradeProposalRecord).filter_by(proposal_id=proposal_id).one()
            execution = session.query(TradeExecutionRecord).filter_by(proposal_id=proposal_id).one()
        self.assertEqual(proposal.status_code, "PROPOSAL_EXECUTED")
        self.assertEqual(execution.status_code, "EXECUTION_CONFIRMED")
        self.assertEqual(execution.tx_hash, "0xdef456")

    @patch("services.agent.repositories.db.session.get_settings")
    @patch("services.agent.app.api.decisions.submit_executor_vault_trade")
    @patch("services.agent.app.api.decisions.get_settings")
    async def test_execute_proposal_marks_reverted_when_receipt_reverts(
        self,
        get_settings,
        submit_executor_vault_trade,
        db_get_settings,
    ) -> None:
        db_get_settings.return_value = Settings(
            _env_file=None,
            app_env="test",
            target_chain=TargetChain.MANTLE_SEPOLIA,
            database_url="sqlite+pysqlite:///:memory:",
        )
        db_session._ENGINE = None
        db_session._SESSION_FACTORY = None
        init_db()
        now = utc_now()
        proposal_id = f"0xproposal_reverted_{uuid4().hex}"
        with create_session() as session:
            session.query(TradeExecutionRecord).delete()
            session.query(TradeProposalRecord).delete()
            session.query(InvestmentPlanRecord).delete()
            session.add(
                TradeProposalRecord(
                    proposal_id=proposal_id,
                    plan_hash="0xplan",
                    wallet_or_vault="0xwallet",
                    router="0xrouter",
                    selector="0x12345678",
                    calldata_hash="0xcalldatahash",
                    token_in="0xtoken_in",
                    token_out="0xtoken_out",
                    recipient="0xrecipient",
                    max_amount_in="10",
                    min_amount_out="9",
                    native_value="0",
                    deadline=123,
                    proposal_expiry=456,
                    nonce=1,
                    status_code="PROPOSAL_APPROVED",
                    risk_snapshot_id=None,
                    calldata="0x1234",
                    created_at=now,
                    updated_at=now,
                )
            )
            session.commit()

        get_settings.return_value = Settings(
            _env_file=None,
            target_chain=TargetChain.MANTLE_SEPOLIA,
            executor_vault_address="0x301e982dbc40f4aa42C291427E7cB0E9491102F1",
            executor_private_key="0x" + "11" * 32,
            mantle_sepolia_rpc_url="http://example",
        )
        submit_executor_vault_trade.return_value = MagicMock(
            tx_hash="0xghi789",
            receipt_status=0,
            receipt_block_number=124,
        )

        response = await execute_proposal(proposal_id)

        self.assertEqual(response.status_code, "EXECUTION_REVERTED")
        self.assertEqual(response.tx_hash, "0xghi789")
        with create_session() as session:
            proposal = session.query(TradeProposalRecord).filter_by(proposal_id=proposal_id).one()
            execution = session.query(TradeExecutionRecord).filter_by(proposal_id=proposal_id).one()
        self.assertEqual(proposal.status_code, "PROPOSAL_FAILED")
        self.assertEqual(execution.status_code, "EXECUTION_REVERTED")
        self.assertEqual(execution.tx_hash, "0xghi789")


if __name__ == "__main__":
    unittest.main()
