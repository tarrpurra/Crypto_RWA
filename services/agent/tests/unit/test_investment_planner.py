from __future__ import annotations

import unittest
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import TargetChain
from services.agent.app.schemas.portfolio import PortfolioSnapshotResponse
from services.agent.app.schemas.proposals import (
    ExecutionPayloadSchema,
    InvestmentPlanRequest,
    LinkedProposalSummary,
    TradeProposal,
)
from services.agent.app.schemas.risk import RiskAssessmentResponse
from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot
from services.agent.modules.oracle.freshness import utc_now
from services.agent.modules.proposals.investment_planner import PlannedSwap, _build_planned_swaps, build_investment_plan


class InvestmentPlannerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = utc_now()

    def _fresh_quote(self, token_in: str, token_out: str) -> NormalizedQuoteSnapshot:
        return NormalizedQuoteSnapshot(
            snapshot_id=f"persisted-{token_in}-{token_out}",
            protocol="AGNI",
            route_id=f"agni:{token_in}:{token_out}:500",
            route_label="v3_exact_input_single",
            chain_id=5003,
            token_in_symbol=token_in,
            token_out_symbol=token_out,
            amount_in="10",
            amount_out="9.8",
            quoted_price="0.98",
            estimated_slippage_bps="12",
            route_depth_usd="100000",
            candidate_rank=1,
            sample_timestamp=self.now,
            freshness_status="ok",
            status_code=DataStatusCode.QUOTE_FRESH.value,
            status_reason="Persisted quote is fresh.",
            data_sources_used=["persisted_quote"],
        )

    def _live_attempt(self, token_in: str, token_out: str):
        unsupported_quote = NormalizedQuoteSnapshot(
            snapshot_id=f"live-{token_in}-{token_out}",
            protocol="AGNI",
            route_id=f"agni:{token_in}:{token_out}:500",
            route_label="v3_exact_input_single",
            chain_id=5003,
            token_in_symbol=token_in,
            token_out_symbol=token_out,
            amount_in="10",
            amount_out=None,
            quoted_price=None,
            estimated_slippage_bps=None,
            route_depth_usd=None,
            candidate_rank=None,
            sample_timestamp=self.now,
            freshness_status="verification_required",
            status_code=DataStatusCode.LIQUIDITY_UNKNOWN.value,
            status_reason="Live quote attempt is not actionable.",
            data_sources_used=["agni_live_quote"],
        )
        return SimpleNamespace(
            normalized_snapshot=unsupported_quote,
            raw_snapshot=SimpleNamespace(raw_payload_json={}),
        )

    @patch("services.agent.modules.proposals.investment_planner.get_quote_service")
    def test_build_planned_swaps_uses_persisted_quote_when_live_attempt_is_unusable(self, mock_get_quote_service) -> None:
        quote_service = MagicMock()
        quote_service.best_quote_attempt_for_pair.side_effect = self._live_attempt
        quote_service.best_quote_for_pair.side_effect = self._fresh_quote
        mock_get_quote_service.return_value = quote_service

        swaps = _build_planned_swaps(
            deposit_asset_symbol="MNT",
            deposit_amount=Decimal("100"),
            target_weights={"USDC": 0.25, "USDY": 0.45, "mETH": 0.30},
        )

        self.assertEqual(quote_service.best_quote_attempt_for_pair.call_count, 3)
        self.assertEqual(quote_service.best_quote_for_pair.call_count, 3)
        self.assertTrue(all(swap.quote is not None for swap in swaps))
        self.assertTrue(all(swap.quote.status_code == DataStatusCode.QUOTE_FRESH.value for swap in swaps if swap.quote))
        self.assertEqual([swap.quote.token_out_symbol for swap in swaps if swap.quote], ["USDC", "USDY", "mETH"])

    @patch("services.agent.modules.proposals.investment_planner._encode_agni_trade_proposal")
    @patch("services.agent.modules.proposals.investment_planner._build_guard_checks")
    @patch("services.agent.modules.proposals.investment_planner._build_planned_swaps")
    @patch("services.agent.modules.proposals.investment_planner._latest_price_map")
    def test_build_investment_plan_marks_steps_ai_managed_when_full_access_enabled(
        self,
        mock_latest_prices,
        mock_build_swaps,
        mock_build_guard_checks,
        mock_encode_proposal,
    ) -> None:
        mock_latest_prices.return_value = {"MNT": Decimal("1"), "WMNT": Decimal("1"), "USDC": Decimal("1")}
        mock_build_swaps.return_value = [
            PlannedSwap(
                target_asset_symbol="USDC",
                amount_in=Decimal("100"),
                token_in_symbol="WMNT",
                token_out_symbol="USDC",
                quote=self._fresh_quote("WMNT", "USDC"),
                gas_estimate=Decimal("1"),
                uses_native_value=False,
            )
        ]
        mock_build_guard_checks.return_value = ([], [])

        proposal = TradeProposal(
            proposal_id="0xproposal",
            plan_hash="0xplan",
            wallet_or_vault="0xwallet",
            payload=ExecutionPayloadSchema(
                proposalId="0xproposal",
                planHash="0xplan",
                router="0xrouter",
                selector="0x414bf389",
                calldataHash="0xcalldatahash",
                tokenIn="0xwallettokenin",
                tokenOut="0xwallettokenout",
                recipient="0xrecipient",
                maxAmountIn=100,
                minAmountOut=98,
                nativeValue=0,
                deadline=1234567890,
                proposalExpiry=1234567990,
                nonce=1,
            ),
            status_code="PROPOSAL_PENDING_APPROVAL",
            risk_snapshot_id=None,
            created_at=self.now,
            updated_at=self.now,
        )
        mock_encode_proposal.return_value = (
            proposal,
            LinkedProposalSummary(
                proposal_id="0xproposal",
                asset_symbol="USDC",
                action="BUY",
                token_in_symbol="WMNT",
                token_out_symbol="USDC",
                amount=100.0,
                status_code="PROPOSAL_PENDING_APPROVAL",
            ),
            "0x1234",
        )

        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            ai_decision_maker_enabled=True,
            native_mnt_enabled=True,
            sepolia_wmnt_address="0x0000000000000000000000000000000000000001",
            sepolia_usdc_address="0x0000000000000000000000000000000000000002",
        )
        portfolio = PortfolioSnapshotResponse(
            snapshot_id="portfolio-1",
            generated_at=self.now,
            portfolio_address="0xwallet",
            chain_id=5003,
            base_currency="USD",
            total_value_usd="100",
            positions=[],
            data_sources_used=[],
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="Portfolio is ready.",
            metadata={},
        )
        risk = RiskAssessmentResponse(
            asset="portfolio",
            recommended_action="REBALANCE",
            risk_score=27.5,
            risk_band="RISK_REBALANCE_ONLY",
            confidence=0.9,
            reasoning_summary="Rebalance recommended.",
            data_sources_used=[],
            hard_veto_status="inactive",
            required_human_approval_status="not_required",
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="Risk engine permits rebalance.",
            generated_at=self.now,
            runtime_mode="monitor_only",
            target_chain="mantle_sepolia",
            freshness_status="fresh",
            buckets=[],
            notes=[],
            metadata={},
        )
        request = InvestmentPlanRequest(
            wallet_address="0xwallet",
            deposit_asset_symbol="MNT",
            deposit_amount=100.0,
            risk_profile="Balanced",
            allocation_mode="Manual",
            manual_target_weights={"USDC": 1.0},
        )

        response, proposal_pairs = build_investment_plan(
            settings=settings,
            request=request,
            portfolio=portfolio,
            risk=risk,
        )

        self.assertTrue(response.approval_enabled)
        self.assertIn("automatic execution", response.status_reason)
        self.assertTrue(proposal_pairs)
        self.assertTrue(response.transaction_steps)
        self.assertTrue(all(not step.requires_user_action for step in response.transaction_steps))

    @patch("services.agent.modules.proposals.investment_planner._encode_agni_trade_proposal")
    @patch("services.agent.modules.proposals.investment_planner._build_guard_checks")
    @patch("services.agent.modules.proposals.investment_planner._build_planned_swaps")
    @patch("services.agent.modules.proposals.investment_planner._latest_price_map")
    def test_build_investment_plan_strips_usdc_from_sepolia_ai_profile(
        self,
        mock_latest_prices,
        mock_build_swaps,
        mock_build_guard_checks,
        mock_encode_proposal,
    ) -> None:
        mock_latest_prices.return_value = {"MNT": Decimal("1"), "WMNT": Decimal("1"), "USDY": Decimal("1"), "mETH": Decimal("2500")}
        mock_build_swaps.return_value = []
        mock_build_guard_checks.return_value = ([], [])
        mock_encode_proposal.return_value = (
            TradeProposal(
                proposal_id="0xproposal",
                plan_hash="0xplan",
                wallet_or_vault="0xwallet",
                payload=ExecutionPayloadSchema(
                    proposalId="0xproposal",
                    planHash="0xplan",
                    router="0xrouter",
                    selector="0x414bf389",
                    calldataHash="0xcalldatahash",
                    tokenIn="0xwallettokenin",
                    tokenOut="0xwallettokenout",
                    recipient="0xrecipient",
                    maxAmountIn=100,
                    minAmountOut=98,
                    nativeValue=0,
                    deadline=1234567890,
                    proposalExpiry=1234567990,
                    nonce=1,
                ),
                status_code="PROPOSAL_PENDING_APPROVAL",
                risk_snapshot_id=None,
                created_at=self.now,
                updated_at=self.now,
            ),
            LinkedProposalSummary(
                proposal_id="0xproposal",
                asset_symbol="USDY",
                action="BUY",
                token_in_symbol="WMNT",
                token_out_symbol="USDY",
                amount=100.0,
                status_code="PROPOSAL_PENDING_APPROVAL",
            ),
            "0x1234",
        )

        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            ai_decision_maker_enabled=True,
            native_mnt_enabled=True,
            sepolia_wmnt_address="0x0000000000000000000000000000000000000001",
            sepolia_usdy_address="0x0000000000000000000000000000000000000002",
            sepolia_meth_address="0x0000000000000000000000000000000000000003",
        )
        portfolio = PortfolioSnapshotResponse(
            snapshot_id="portfolio-1",
            generated_at=self.now,
            portfolio_address="0xwallet",
            chain_id=5003,
            base_currency="USD",
            total_value_usd="100",
            positions=[],
            data_sources_used=[],
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="Portfolio is ready.",
            metadata={},
        )
        risk = RiskAssessmentResponse(
            asset="portfolio",
            recommended_action="REBALANCE",
            risk_score=27.5,
            risk_band="RISK_REBALANCE_ONLY",
            confidence=0.9,
            reasoning_summary="Rebalance recommended.",
            data_sources_used=[],
            hard_veto_status="inactive",
            required_human_approval_status="not_required",
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="Risk engine permits rebalance.",
            generated_at=self.now,
            runtime_mode="monitor_only",
            target_chain="mantle_sepolia",
            freshness_status="fresh",
            buckets=[],
            notes=[],
            metadata={},
        )
        request = InvestmentPlanRequest(
            wallet_address="0xwallet",
            deposit_asset_symbol="MNT",
            deposit_amount=100.0,
            risk_profile="Balanced",
            allocation_mode="AI Suggested",
        )

        response, _ = build_investment_plan(
            settings=settings,
            request=request,
            portfolio=portfolio,
            risk=risk,
        )

        selected_weights = mock_build_swaps.call_args.kwargs["target_weights"]
        self.assertNotIn("USDC", selected_weights)
        self.assertAlmostEqual(selected_weights["USDY"], 0.6)
        self.assertAlmostEqual(selected_weights["mETH"], 0.4)
        self.assertTrue(any("USDC is excluded" in warning for warning in response.warning_messages))
        self.assertTrue(all(item.asset_symbol != "USDC" for item in response.selected_target_allocations))


if __name__ == "__main__":
    unittest.main()
