from __future__ import annotations

import unittest
from decimal import Decimal
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import RuntimeMode, TargetChain
from services.agent.app.schemas.allocation import RebalanceAction
from services.agent.app.schemas.portfolio import PortfolioPosition, PortfolioSnapshotResponse
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
from services.agent.modules.proposals.investment_planner import (
    PlannedSwap,
    _build_guard_checks,
    _build_planned_swaps,
    _build_rebalance_swaps,
    _encode_trade_proposal,
    build_investment_plan,
)


class InvestmentPlannerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = utc_now()
        # Mock Web3 in investment_planner to prevent live RPC queries
        self.web3_patcher = patch("services.agent.modules.proposals.investment_planner.Web3")
        self.mock_web3 = self.web3_patcher.start()
        # Mock gas price to return 50 Gwei
        self.mock_web3.return_value.eth.gas_price = 50000000

        # Delegate Web3 utility methods to their original implementations to avoid Pydantic validation errors
        from web3 import Web3 as RealWeb3
        self.mock_web3.to_hex.side_effect = RealWeb3.to_hex
        self.mock_web3.to_checksum_address.side_effect = RealWeb3.to_checksum_address
        self.mock_web3.to_bytes.side_effect = RealWeb3.to_bytes

        # Override Balanced profile to contain USDC, USDY, and mETH for test compatibility
        from services.agent.strategies.allocation.profiles import ALLOCATION_PROFILES
        self.original_balanced = ALLOCATION_PROFILES["Balanced"]
        ALLOCATION_PROFILES["Balanced"] = {"USDC": 0.25, "USDY": 0.45, "mETH": 0.30}

    def tearDown(self) -> None:
        self.web3_patcher.stop()
        from services.agent.strategies.allocation.profiles import ALLOCATION_PROFILES
        ALLOCATION_PROFILES["Balanced"] = self.original_balanced

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

    def _fresh_attempt(self, token_in: str, token_out: str, *, gas_estimate: str = "123") -> SimpleNamespace:
        fresh_quote = self._fresh_quote(token_in, token_out).model_copy(
            update={
                "amount_in": "10",
                "amount_out": "9.8",
                "quoted_price": "0.98",
                "freshness_status": "fresh",
                "status_code": DataStatusCode.QUOTE_FRESH.value,
                "status_reason": "Live quote is fresh.",
            }
        )
        return SimpleNamespace(
            normalized_snapshot=fresh_quote,
            raw_snapshot=SimpleNamespace(raw_payload_json={"gas_estimate": gas_estimate}),
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
            prices={"WMNT": Decimal("1"), "USDC": Decimal("1"), "USDY": Decimal("1"), "mETH": Decimal("2500")},
        )

        self.assertEqual(quote_service.best_quote_attempt_for_pair.call_count, 3)
        self.assertEqual(quote_service.best_quote_for_pair.call_count, 3)
        self.assertTrue(all(swap.quote is not None for swap in swaps))
        self.assertTrue(all(swap.quote.status_code == DataStatusCode.QUOTE_FRESH.value for swap in swaps if swap.quote))
        self.assertEqual([swap.quote.token_out_symbol for swap in swaps if swap.quote], ["USDC", "USDY", "mETH"])

    @patch("services.agent.modules.proposals.investment_planner.get_quote_service")
    def test_build_planned_swaps_skips_dust_legs(self, mock_get_quote_service) -> None:
        quote_service = MagicMock()
        quote_service.best_quote_attempt_for_pair.side_effect = AssertionError("dust swap should not reach live quote lookup")
        quote_service.best_quote_for_pair.side_effect = AssertionError("dust swap should not reach persisted quote lookup")
        mock_get_quote_service.return_value = quote_service

        swaps = _build_planned_swaps(
            deposit_asset_symbol="MNT",
            deposit_amount=Decimal("0.5"),
            target_weights={"USDY": 1.0},
            prices={"WMNT": Decimal("1"), "USDY": Decimal("1")},
        )

        self.assertEqual(swaps, [])
        quote_service.best_quote_attempt_for_pair.assert_not_called()
        quote_service.best_quote_for_pair.assert_not_called()

    @patch("services.agent.modules.proposals.investment_planner.get_quote_service")
    def test_build_rebalance_swaps_uses_held_asset_route_for_buy_actions(self, mock_get_quote_service) -> None:
        quote_service = MagicMock()
        quote_service.best_quote_attempt_for_pair.return_value = self._fresh_attempt("USDY", "mETH")
        quote_service.best_quote_for_pair.return_value = self._fresh_quote("USDY", "mETH")
        mock_get_quote_service.return_value = quote_service

        portfolio = PortfolioSnapshotResponse(
            snapshot_id="portfolio-held-assets",
            generated_at=self.now,
            portfolio_address="0xwallet",
            chain_id=5003,
            base_currency="USD",
            total_value_usd="2250",
            positions=[
                PortfolioPosition(
                    asset_key="USDY",
                    asset_symbol="USDY",
                    chain_id=5003,
                    balance="1000",
                    balance_source="test_fixture",
                    price_usd="1",
                    value_usd="1000",
                    weight="0.444444",
                    target_weight="0.25",
                    weight_drift="0.194444",
                    drift_status="drifted",
                    valuation_status="valued",
                    status_code=DataStatusCode.DATA_FRESH.value,
                    status_reason="valued",
                ),
                PortfolioPosition(
                    asset_key="METH",
                    asset_symbol="mETH",
                    chain_id=5003,
                    balance="0.5",
                    balance_source="test_fixture",
                    price_usd="2500",
                    value_usd="1250",
                    weight="0.555556",
                    target_weight="0.75",
                    weight_drift="-0.194444",
                    drift_status="drifted",
                    valuation_status="valued",
                    status_code=DataStatusCode.DATA_FRESH.value,
                    status_reason="valued",
                ),
            ],
            data_sources_used=["test_fixture"],
            status="ok",
            status_code=DataStatusCode.DATA_FRESH.value,
            status_label=DataStatusCode.DATA_FRESH.value,
            status_reason="held assets available",
        )

        swaps = _build_rebalance_swaps(
            rebalance_actions=[
                RebalanceAction(
                    asset_symbol="mETH",
                    action="BUY",
                    amount=1.0,
                    token_in_symbol="USDY",
                    token_out_symbol="mETH",
                    swap_pair_label="USDY -> mETH",
                )
            ],
            portfolio=portfolio,
            prices={"USDY": Decimal("1"), "mETH": Decimal("2500")},
        )

        self.assertEqual(len(swaps), 1)
        self.assertEqual(swaps[0].token_in_symbol, "USDY")
        self.assertEqual(swaps[0].token_out_symbol, "mETH")
        self.assertEqual(swaps[0].amount_in, Decimal("2500"))
        self.assertEqual(swaps[0].quote.status_code, DataStatusCode.QUOTE_FRESH.value)
        self.assertEqual(swaps[0].target_asset_symbol, "mETH")

    @patch("services.agent.modules.proposals.investment_planner.get_quote_service")
    def test_build_rebalance_swaps_skips_dust_legs(self, mock_get_quote_service) -> None:
        quote_service = MagicMock()
        quote_service.best_quote_attempt_for_pair.return_value = self._fresh_attempt("USDY", "mETH")
        quote_service.best_quote_for_pair.return_value = self._fresh_quote("USDY", "mETH")
        mock_get_quote_service.return_value = quote_service

        portfolio = PortfolioSnapshotResponse(
            snapshot_id="portfolio-held-assets",
            generated_at=self.now,
            portfolio_address="0xwallet",
            chain_id=5003,
            base_currency="USD",
            total_value_usd="2250",
            positions=[
                PortfolioPosition(
                    asset_key="USDY",
                    asset_symbol="USDY",
                    chain_id=5003,
                    balance="1000",
                    balance_source="test_fixture",
                    price_usd="1",
                    value_usd="1000",
                    weight="0.444444",
                    target_weight="0.25",
                    weight_drift="0.194444",
                    drift_status="drifted",
                    valuation_status="valued",
                    status_code=DataStatusCode.DATA_FRESH.value,
                    status_reason="valued",
                ),
                PortfolioPosition(
                    asset_key="METH",
                    asset_symbol="mETH",
                    chain_id=5003,
                    balance="0.5",
                    balance_source="test_fixture",
                    price_usd="2500",
                    value_usd="1250",
                    weight="0.555556",
                    target_weight="0.75",
                    weight_drift="-0.194444",
                    drift_status="drifted",
                    valuation_status="valued",
                    status_code=DataStatusCode.DATA_FRESH.value,
                    status_reason="valued",
                ),
            ],
            data_sources_used=["test_fixture"],
            status="ok",
            status_code=DataStatusCode.DATA_FRESH.value,
            status_label=DataStatusCode.DATA_FRESH.value,
            status_reason="held assets available",
        )

        swaps = _build_rebalance_swaps(
            rebalance_actions=[
                RebalanceAction(
                    asset_symbol="mETH",
                    action="BUY",
                    amount=0.0001,
                    token_in_symbol="USDY",
                    token_out_symbol="mETH",
                    swap_pair_label="USDY -> mETH",
                )
            ],
            portfolio=portfolio,
            prices={"USDY": Decimal("1"), "mETH": Decimal("2500")},
        )

        self.assertEqual(swaps, [])
        quote_service.best_quote_attempt_for_pair.assert_not_called()

    @patch("services.agent.modules.proposals.investment_planner.get_ondo_usdy_oracle_adapter")
    def test_guard_checks_stay_advisory_in_monitor_only_mode(self, mock_oracle_adapter) -> None:
        mock_oracle_adapter.return_value.read.return_value = SimpleNamespace(
            status=SimpleNamespace(status="stale"),
        )

        settings = Settings(
            target_chain=TargetChain.MANTLE_MAINNET,
            runtime_mode=RuntimeMode.MONITOR_ONLY,
            native_mnt_enabled=True,
        )
        swap = PlannedSwap(
            target_asset_symbol="USDY",
            amount_in=Decimal("100"),
            token_in_symbol="WMNT",
            token_out_symbol="USDY",
            quote=NormalizedQuoteSnapshot(
                snapshot_id="quote-1",
                protocol="AGNI",
                route_id="agni:WMNT:USDY:500",
                route_label="v3_exact_input_single",
                chain_id=5003,
                token_in_symbol="WMNT",
                token_out_symbol="USDY",
                amount_in="100",
                amount_out="80",
                quoted_price="0.8",
                estimated_slippage_bps="120",
                route_depth_usd="100000",
                candidate_rank=1,
                sample_timestamp=self.now,
                freshness_status="fresh",
                status_code=DataStatusCode.QUOTE_FRESH.value,
                status_reason="Quote is fresh.",
                data_sources_used=["agni_live_quote"],
            ),
            gas_estimate=Decimal("1"),
        )
        risk = RiskAssessmentResponse(
            asset="portfolio",
            recommended_action="REBALANCE",
            risk_score=32.0,
            risk_band="RISK_NORMAL",
            confidence=0.9,
            reasoning_summary="Risk is acceptable for monitor-only mode.",
            data_sources_used=[],
            hard_veto_status="inactive",
            required_human_approval_status="not_required",
            status="ok",
            status_code=DataStatusCode.DATA_FRESH.value,
            status_label=DataStatusCode.DATA_FRESH.value,
            status_reason="Risk engine permits rebalance.",
            generated_at=self.now,
            runtime_mode=RuntimeMode.MONITOR_ONLY.value,
            target_chain=TargetChain.MANTLE_MAINNET.value,
            freshness_status="fresh",
            buckets=[],
            notes=[],
            metadata={},
        )

        checks, blockers = _build_guard_checks(
            settings=settings,
            deposit_asset_symbol="MNT",
            selected_weights={"USDY": 0.75, "mETH": 0.25},
            prices={"WMNT": Decimal("1"), "USDY": Decimal("1"), "mETH": Decimal("2500")},
            swaps=[swap],
            risk=risk,
        )

        blocking_codes = {check.code for check in checks if check.blocking and not check.passed}
        self.assertEqual(blockers, [])
        self.assertFalse(blocking_codes)
        self.assertTrue(any(check.code == "price_deviation" and not check.blocking for check in checks))
        self.assertTrue(any(check.code == "slippage_limit" and not check.blocking for check in checks))
        self.assertTrue(any(check.code == "concentration_risk" and not check.blocking for check in checks))

    @patch("services.agent.modules.proposals.investment_planner.get_pause_guardian_state")
    @patch("services.agent.modules.proposals.investment_planner.get_ondo_usdy_oracle_adapter")
    def test_guard_checks_block_stale_quotes_by_age(self, mock_get_ondo_oracle, mock_get_pause_guardian_state) -> None:
        mock_ondo_adapter = MagicMock()
        mock_ondo_adapter.read.return_value = SimpleNamespace(status=SimpleNamespace(status="ok"))
        mock_get_ondo_oracle.return_value = mock_ondo_adapter
        mock_get_pause_guardian_state.return_value = {"paused": False}

        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            runtime_mode=RuntimeMode.SIMULATION,
        )
        stale_quote = self._fresh_quote("WMNT", "USDY").model_copy(
            update={
                "sample_timestamp": self.now - timedelta(seconds=31),
                "status_code": DataStatusCode.QUOTE_STALE.value,
                "freshness_status": "stale",
                "status_reason": "Quote is stale.",
            },
        )
        swaps = [
            PlannedSwap(
                target_asset_symbol="USDY",
                amount_in=Decimal("100"),
                token_in_symbol="WMNT",
                token_out_symbol="USDY",
                quote=stale_quote,
                gas_estimate=Decimal("1"),
                uses_native_value=False,
            )
        ]

        checks, blockers = _build_guard_checks(
            settings=settings,
            deposit_asset_symbol="MNT",
            selected_weights={"USDY": 0.75, "mETH": 0.25},
            prices={"WMNT": Decimal("1"), "USDY": Decimal("1"), "mETH": Decimal("2500")},
            swaps=swaps,
            risk=RiskAssessmentResponse(
                asset="portfolio",
                recommended_action="REBALANCE",
                risk_score=25.0,
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
                runtime_mode="simulation",
                target_chain="mantle_sepolia",
                freshness_status="fresh",
                buckets=[],
                notes=[],
                metadata={},
            ),
        )

        freshness_check = next(check for check in checks if check.code == "quote_freshness")
        self.assertFalse(freshness_check.passed)
        self.assertTrue(any("stale" in blocker.lower() for blocker in blockers))

    @patch("services.agent.modules.proposals.investment_planner._encode_trade_proposal")
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
            status_code="EXECUTION_READY",
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
                status_code="EXECUTION_READY",
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
            manual_target_weights={"USDY": 1.0},
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

    @patch("services.agent.modules.proposals.investment_planner._encode_trade_proposal")
    @patch("services.agent.modules.proposals.investment_planner._build_guard_checks")
    @patch("services.agent.modules.proposals.investment_planner._build_rebalance_swaps")
    @patch("services.agent.modules.proposals.investment_planner._build_planned_swaps")
    @patch("services.agent.modules.proposals.investment_planner.compute_rebalance")
    @patch("services.agent.modules.proposals.investment_planner._latest_price_map")
    def test_build_investment_plan_prefers_rebalance_path_for_held_assets(
        self,
        mock_latest_prices,
        mock_compute_rebalance,
        mock_build_planned_swaps,
        mock_build_rebalance_swaps,
        mock_build_guard_checks,
        mock_encode_proposal,
    ) -> None:
        mock_latest_prices.return_value = {"MNT": Decimal("1"), "WMNT": Decimal("1"), "USDY": Decimal("1"), "mETH": Decimal("2500")}
        mock_compute_rebalance.return_value = (
            SimpleNamespace(recommended_action="REBALANCE"),
            [
                RebalanceAction(
                    asset_symbol="mETH",
                    action="BUY",
                    amount=1.0,
                    token_in_symbol="USDY",
                    token_out_symbol="mETH",
                    swap_pair_label="USDY -> mETH",
                )
            ],
        )
        mock_build_planned_swaps.return_value = [
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
        mock_build_rebalance_swaps.return_value = [
            PlannedSwap(
                target_asset_symbol="mETH",
                amount_in=Decimal("250"),
                token_in_symbol="USDY",
                token_out_symbol="mETH",
                quote=self._fresh_quote("USDY", "mETH"),
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
                tokenIn="0xusdytoken",
                tokenOut="0xmethoken",
                recipient="0xrecipient",
                maxAmountIn=250,
                minAmountOut=245,
                nativeValue=0,
                deadline=1234567890,
                proposalExpiry=1234567990,
                nonce=1,
            ),
            status_code="EXECUTION_READY",
            risk_snapshot_id=None,
            created_at=self.now,
            updated_at=self.now,
        )
        mock_encode_proposal.return_value = (
            proposal,
            LinkedProposalSummary(
                proposal_id="0xproposal",
                asset_symbol="mETH",
                action="BUY",
                token_in_symbol="USDY",
                token_out_symbol="mETH",
                amount=1.0,
                status_code="EXECUTION_READY",
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
        preview_portfolio = PortfolioSnapshotResponse(
            snapshot_id="portfolio-preview",
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
        actual_portfolio = PortfolioSnapshotResponse(
            snapshot_id="portfolio-actual",
            generated_at=self.now,
            portfolio_address="0xwallet",
            chain_id=5003,
            base_currency="USD",
            total_value_usd="2250",
            positions=[
                PortfolioPosition(
                    asset_key="USDY",
                    asset_symbol="USDY",
                    chain_id=5003,
                    balance="1000",
                    balance_source="test_fixture",
                    price_usd="1",
                    value_usd="1000",
                    weight="0.444444",
                    target_weight="0.25",
                    weight_drift="0.194444",
                    drift_status="drifted",
                    valuation_status="valued",
                    status_code=DataStatusCode.DATA_FRESH.value,
                    status_reason="valued",
                ),
                PortfolioPosition(
                    asset_key="METH",
                    asset_symbol="mETH",
                    chain_id=5003,
                    balance="0.5",
                    balance_source="test_fixture",
                    price_usd="2500",
                    value_usd="1250",
                    weight="0.555556",
                    target_weight="0.75",
                    weight_drift="-0.194444",
                    drift_status="drifted",
                    valuation_status="valued",
                    status_code=DataStatusCode.DATA_FRESH.value,
                    status_reason="valued",
                ),
            ],
            data_sources_used=["test_fixture"],
            status="ok",
            status_code=DataStatusCode.DATA_FRESH.value,
            status_label=DataStatusCode.DATA_FRESH.value,
            status_reason="Wallet holdings are ready.",
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
            status_code=DataStatusCode.DATA_FRESH.value,
            status_label=DataStatusCode.DATA_FRESH.value,
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

        response, proposal_pairs = build_investment_plan(
            settings=settings,
            request=request,
            portfolio=preview_portfolio,
            actual_portfolio=actual_portfolio,
            risk=risk,
        )

        self.assertEqual(response.metadata["swap_path"], "rebalance")
        self.assertTrue(response.approval_enabled)
        self.assertEqual(response.status_code, "EXECUTION_READY")
        self.assertTrue(any("advisory" in message.lower() for message in response.warning_messages))
        self.assertTrue(proposal_pairs)
        self.assertEqual(response.linked_proposals[0].token_in_symbol, "USDY")
        self.assertEqual(response.linked_proposals[0].token_out_symbol, "mETH")
        self.assertTrue(response.transaction_steps)
        self.assertNotEqual(response.transaction_steps[0].step_type, "wrap")
        mock_build_planned_swaps.assert_not_called()
        mock_build_rebalance_swaps.assert_called_once()

    @patch("services.agent.modules.proposals.investment_planner._encode_trade_proposal")
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
                status_code="EXECUTION_READY",
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
                status_code="EXECUTION_READY",
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
        self.assertTrue(any("renormalized across the remaining sleeves" in warning for warning in response.warning_messages))
        self.assertTrue(all(item.asset_symbol != "USDC" for item in response.selected_target_allocations))

    @patch("services.agent.modules.proposals.investment_planner.get_pause_guardian_state")
    @patch("services.agent.modules.proposals.investment_planner.get_ondo_usdy_oracle_adapter")
    def test_guard_checks_are_relaxed_on_sepolia(self, mock_get_ondo_oracle, mock_get_pause_guardian_state) -> None:
        mock_ondo_adapter = MagicMock()
        mock_ondo_adapter.read.return_value = SimpleNamespace(status=SimpleNamespace(status="ok"))
        mock_get_ondo_oracle.return_value = mock_ondo_adapter
        mock_get_pause_guardian_state.return_value = {"paused": False}

        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            runtime_mode=RuntimeMode.SIMULATION,
        )
        quote = self._fresh_quote("WMNT", "USDY").model_copy(update={"amount_in": "100", "amount_out": "96", "quoted_price": "1.04166667"})
        swaps = [
            PlannedSwap(
                target_asset_symbol="USDY",
                amount_in=Decimal("100"),
                token_in_symbol="WMNT",
                token_out_symbol="USDY",
                quote=quote,
                gas_estimate=Decimal("1"),
                uses_native_value=False,
            )
        ]

        checks, blockers = _build_guard_checks(
            settings=settings,
            deposit_asset_symbol="MNT",
            selected_weights={"USDY": 0.95, "mETH": 0.05},
            prices={"WMNT": Decimal("1"), "USDY": Decimal("1")},
            swaps=swaps,
            risk=RiskAssessmentResponse(
                asset="portfolio",
                recommended_action="REBALANCE",
                risk_score=25.0,
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
                runtime_mode="simulation",
                target_chain="mantle_sepolia",
                freshness_status="fresh",
                buckets=[],
                notes=[],
                metadata={},
            ),
        )

        self.assertFalse(blockers)
        self.assertTrue(all(check.passed or not check.blocking for check in checks))
        self.assertTrue(next(check for check in checks if check.code == "price_deviation").passed)
        self.assertTrue(next(check for check in checks if check.code == "concentration_risk").passed)

    @patch("services.agent.modules.proposals.investment_planner.get_pause_guardian_state")
    @patch("services.agent.modules.proposals.investment_planner.get_ondo_usdy_oracle_adapter")
    def test_guard_checks_scale_sample_quotes_to_actual_swap_amount(self, mock_get_ondo_oracle, mock_get_pause_guardian_state) -> None:
        mock_ondo_adapter = MagicMock()
        mock_ondo_adapter.read.return_value = SimpleNamespace(status=SimpleNamespace(status="ok"))
        mock_get_ondo_oracle.return_value = mock_ondo_adapter
        mock_get_pause_guardian_state.return_value = {"paused": False}

        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            runtime_mode=RuntimeMode.SIMULATION,
        )
        quote = self._fresh_quote("WMNT", "USDY").model_copy(
            update={
                "amount_in": "10",
                "amount_out": "4.7231",
                "quoted_price": "0.47231",
            },
        )
        swaps = [
            PlannedSwap(
                target_asset_symbol="USDY",
                amount_in=Decimal("206.4"),
                token_in_symbol="WMNT",
                token_out_symbol="USDY",
                quote=quote,
                gas_estimate=Decimal("1"),
                uses_native_value=False,
            )
        ]

        checks, blockers = _build_guard_checks(
            settings=settings,
            deposit_asset_symbol="MNT",
            selected_weights={"USDY": 0.95, "mETH": 0.05},
            prices={"WMNT": Decimal("0.53608383"), "USDY": Decimal("1.13469831")},
            swaps=swaps,
            risk=RiskAssessmentResponse(
                asset="portfolio",
                recommended_action="REBALANCE",
                risk_score=25.0,
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
                runtime_mode="simulation",
                target_chain="mantle_sepolia",
                freshness_status="fresh",
                buckets=[],
                notes=[],
                metadata={},
            ),
        )

        self.assertFalse(blockers)
        self.assertTrue(next(check for check in checks if check.code == "price_deviation").passed)

    def test_encode_trade_proposal_scales_sample_quote_to_swap_amount(self) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            native_mnt_enabled=True,
            aiyield_sepolia_swap_router_address="0x0000000000000000000000000000000000000001",
            sepolia_wmnt_address="0x0000000000000000000000000000000000000002",
            sepolia_usdy_address="0x0000000000000000000000000000000000000003",
        )
        quote = self._fresh_quote("WMNT", "USDY").model_copy(
            update={
                "protocol": "AIYIELD",
                "route_id": "aiyield:WMNT:USDY",
                "amount_in": "10",
                "amount_out": "4.7231",
                "quoted_price": "0.47231",
            },
        )
        swap = PlannedSwap(
            target_asset_symbol="USDY",
            amount_in=Decimal("206.4"),
            token_in_symbol="WMNT",
            token_out_symbol="USDY",
            quote=quote,
            gas_estimate=Decimal("1"),
            uses_native_value=False,
        )

        proposal, summary, _ = _encode_trade_proposal(
            settings=settings,
            wallet_address="0x8ecc35264986c08E5C7594F27140f359A53768DD",
            swap=swap,
        )

        expected_min_amount_out = int((Decimal("4.7231") * Decimal("20.64") * Decimal("0.50")) * Decimal(10 ** 18))
        self.assertEqual(proposal.payload.maxAmountIn, int(Decimal("206.4") * Decimal(10 ** 18)))
        self.assertEqual(proposal.payload.minAmountOut, expected_min_amount_out)
        self.assertEqual(summary.token_in_symbol, "WMNT")
        self.assertEqual(summary.token_out_symbol, "USDY")


if __name__ == "__main__":
    unittest.main()
