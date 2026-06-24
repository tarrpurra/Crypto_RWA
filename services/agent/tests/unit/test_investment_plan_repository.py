import unittest

from services.agent.repositories.db.investment_plan_repository import InvestmentPlanRepository
from services.agent.repositories.db.models import TradeExecutionRecord, TradeProposalRecord
from services.agent.modules.oracle.freshness import utc_now


class InvestmentPlanRepositoryTests(unittest.TestCase):
    def test_hydrate_statuses_uses_execution_records_for_runtime_states(self) -> None:
        plan_json = {
            "status": "ok",
            "status_code": "EXECUTION_READY",
            "status_label": "EXECUTION_READY",
            "status_reason": "AI auto-approved the trade proposal. Execution is pending through the ExecutorVault on-chain path.",
            "generated_at": utc_now().isoformat(),
            "plan_id": "plan-1",
            "deposit_asset_symbol": "WMNT",
            "deposit_amount": 10.0,
            "risk_profile": "Balanced",
            "allocation_mode": "AI Suggested",
            "approval_enabled": True,
            "approval_blockers": [],
            "ai_target_allocations": [],
            "selected_target_allocations": [],
            "warning_messages": [],
            "guard_checks": [],
            "transaction_steps": [],
            "linked_proposals": [
                {
                    "proposal_id": "0xproposal",
                    "asset_symbol": "USDY",
                    "action": "BUY",
                    "token_in_symbol": "WMNT",
                    "token_out_symbol": "USDY",
                    "amount": 10.0,
                    "status_code": "PROPOSAL_APPROVED",
                }
            ],
            "risk_assessment": {},
            "metadata": {},
        }
        trade_record = TradeProposalRecord(
            proposal_id="0xproposal",
            plan_hash="0xplanhash",
            wallet_or_vault="0xwallet",
            router="0xrouter",
            selector="0x12345678",
            calldata_hash="0xhash",
            token_in="0xtokenin",
            token_out="0xtokenout",
            recipient="0xrecipient",
            max_amount_in="10",
            min_amount_out="9",
            native_value="0",
            deadline=123,
            proposal_expiry=456,
            nonce=1,
            status_code="PROPOSAL_EXECUTING",
            risk_snapshot_id=None,
            calldata="0x1234",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        execution_record = TradeExecutionRecord(
            proposal_id="0xproposal",
            tx_hash="0xabc123",
            quoted_amount_out=None,
            actual_amount_out=None,
            gas_used=None,
            realized_slippage_bps=None,
            status_code="EXECUTION_SUBMITTED",
            failure_reason=None,
            executed_at=utc_now(),
        )

        response = InvestmentPlanRepository._hydrate_statuses(
            plan_json,
            [trade_record],
            [execution_record],
            "0xproposal",
        )

        self.assertEqual(response.status_code, "PROPOSAL_EXECUTING")
        self.assertFalse(response.approval_enabled)
        self.assertEqual(response.status_reason, "Execution submitted on-chain (0xabc123).")

    def test_hydrate_statuses_uses_failure_reason_for_failed_execution(self) -> None:
        plan_json = {
            "status": "ok",
            "status_code": "EXECUTION_READY",
            "status_label": "EXECUTION_READY",
            "status_reason": "AI auto-approved the trade proposal. Execution is pending through the ExecutorVault on-chain path.",
            "generated_at": utc_now().isoformat(),
            "plan_id": "plan-1",
            "deposit_asset_symbol": "WMNT",
            "deposit_amount": 10.0,
            "risk_profile": "Balanced",
            "allocation_mode": "AI Suggested",
            "approval_enabled": True,
            "approval_blockers": [],
            "ai_target_allocations": [],
            "selected_target_allocations": [],
            "warning_messages": [],
            "guard_checks": [],
            "transaction_steps": [],
            "linked_proposals": [
                {
                    "proposal_id": "0xproposal",
                    "asset_symbol": "USDY",
                    "action": "BUY",
                    "token_in_symbol": "WMNT",
                    "token_out_symbol": "USDY",
                    "amount": 10.0,
                    "status_code": "PROPOSAL_APPROVED",
                }
            ],
            "risk_assessment": {},
            "metadata": {},
        }
        trade_record = TradeProposalRecord(
            proposal_id="0xproposal",
            plan_hash="0xplanhash",
            wallet_or_vault="0xwallet",
            router="0xrouter",
            selector="0x12345678",
            calldata_hash="0xhash",
            token_in="0xtokenin",
            token_out="0xtokenout",
            recipient="0xrecipient",
            max_amount_in="10",
            min_amount_out="9",
            native_value="0",
            deadline=123,
            proposal_expiry=456,
            nonce=1,
            status_code="PROPOSAL_FAILED",
            risk_snapshot_id=None,
            calldata="0x1234",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        execution_record = TradeExecutionRecord(
            proposal_id="0xproposal",
            tx_hash="failed:0xproposal",
            quoted_amount_out=None,
            actual_amount_out=None,
            gas_used=None,
            realized_slippage_bps=None,
            status_code="EXECUTION_FAILED",
            failure_reason="EXECUTOR_PRIVATE_KEY is not configured.",
            executed_at=utc_now(),
        )

        response = InvestmentPlanRepository._hydrate_statuses(
            plan_json,
            [trade_record],
            [execution_record],
            "0xproposal",
        )

        self.assertEqual(response.status_code, "PROPOSAL_FAILED")
        self.assertFalse(response.approval_enabled)
        self.assertEqual(response.status_reason, "EXECUTOR_PRIVATE_KEY is not configured.")


if __name__ == "__main__":
    unittest.main()
