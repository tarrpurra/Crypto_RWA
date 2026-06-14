from __future__ import annotations

import unittest
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

from services.agent.app.schemas.portfolio import PortfolioSnapshot, AssetBalance
from services.agent.app.schemas.market_data import NormalizedPriceSnapshot
from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot
from services.agent.risk.scoring.score_engine import RiskScoreEngine
from services.agent.modules.oracle.freshness import utc_now


from services.agent.app.core.status_codes import TargetChain


class RiskScoringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = utc_now()
        self.engine = RiskScoreEngine()
        self.engine.settings.target_chain = TargetChain.MANTLE_MAINNET
        
        # Base normal balances
        self.balances = [
            AssetBalance(asset_symbol="USDY", balance=600000.0, value_usd=600000.0, weight=0.60),
            AssetBalance(asset_symbol="mETH", balance=114.28, value_usd=400000.0, weight=0.40),
        ]
        self.portfolio = PortfolioSnapshot(
            snapshot_id="port_test_normal",
            wallet_or_vault="0xvault",
            total_value_usd=1000000.0,
            balances=self.balances,
            weights={"USDY": 0.60, "mETH": 0.40},
            status_code="DATA_FRESH",
            status_reason="",
            created_at=self.now
        )

    @patch("services.agent.repositories.db.market_repository.MarketDataRepository.latest_normalized_prices")
    @patch("services.agent.repositories.db.market_repository.MarketDataRepository.latest_normalized_quotes")
    def test_risk_normal_scenario(self, mock_quotes, mock_prices) -> None:
        # Define fresh prices & quotes
        mock_prices.return_value = [
            NormalizedPriceSnapshot(
                snapshot_id="p1", asset_key="USDY", asset_symbol="USDY", asset_address=None, chain_id=5000,
                price_usd="1.05", confidence_interval_usd="0.001", publish_timestamp=self.now,
                observed_timestamp=self.now, freshness_status="ok", status_code="ORACLE_FRESH",
                status_reason="", derivation_method=None
            ),
            NormalizedPriceSnapshot(
                snapshot_id="p2", asset_key="mETH", asset_symbol="mETH", asset_address=None, chain_id=5000,
                price_usd="3500.0", confidence_interval_usd="1.0", publish_timestamp=self.now,
                observed_timestamp=self.now, freshness_status="ok", status_code="ORACLE_FRESH",
                status_reason="", derivation_method=None
            ),
        ]
        mock_quotes.return_value = [
            NormalizedQuoteSnapshot(
                snapshot_id="q1", protocol="agni", route_id="usdy_route", route_label="exactInputSingle",
                token_in_symbol="USDY", token_out_symbol="mETH", amount_in="1000", amount_out="1050",
                quoted_price="1.05", estimated_slippage_bps="10", route_depth_usd="100000",
                sample_timestamp=self.now, freshness_status="ok", status_code="QUOTE_FRESH",
                status_reason=""
            )
        ]

        risk = self.engine.compute_risk_snapshot(self.portfolio)
        self.assertEqual(risk.risk_band, "RISK_NORMAL")
        self.assertLess(risk.total_score, 25.0)

    @patch("services.agent.repositories.db.market_repository.MarketDataRepository.latest_normalized_prices")
    @patch("services.agent.repositories.db.market_repository.MarketDataRepository.latest_normalized_quotes")
    def test_risk_stale_oracle_triggers_veto(self, mock_quotes, mock_prices) -> None:
        # Define stale Pyth price (e.g. 400 seconds age)
        stale_time = self.now - timedelta(seconds=400)
        mock_prices.return_value = [
            NormalizedPriceSnapshot(
                snapshot_id="p1", asset_key="USDY", asset_symbol="USDY", asset_address=None, chain_id=5000,
                price_usd="1.05", confidence_interval_usd="0.001", publish_timestamp=self.now,
                observed_timestamp=self.now, freshness_status="ok", status_code="ORACLE_FRESH",
                status_reason="", derivation_method=None
            ),
            NormalizedPriceSnapshot(
                snapshot_id="p2", asset_key="mETH", asset_symbol="mETH", asset_address=None, chain_id=5000,
                price_usd="3500.0", confidence_interval_usd="1.0", publish_timestamp=stale_time,
                observed_timestamp=stale_time, freshness_status="stale", status_code="ORACLE_STALE",
                status_reason="Stale", derivation_method=None
            ),
        ]
        mock_quotes.return_value = []

        risk = self.engine.compute_risk_snapshot(self.portfolio)
        self.assertEqual(risk.risk_band, "RISK_VETO")
        self.assertEqual(risk.total_score, 100.0)
        self.assertIn("HARD VETO ACTIVE: Proposal execution is blocked.", risk.notes)

    @patch("services.agent.repositories.db.market_repository.MarketDataRepository.latest_normalized_prices")
    @patch("services.agent.repositories.db.market_repository.MarketDataRepository.latest_normalized_quotes")
    def test_risk_depeg_triggers_veto(self, mock_quotes, mock_prices) -> None:
        # Define USDY oracle at $1.05 and DEX quote price at $1.01 (3.8% depeg)
        mock_prices.return_value = [
            NormalizedPriceSnapshot(
                snapshot_id="p1", asset_key="USDY", asset_symbol="USDY", asset_address=None, chain_id=5000,
                price_usd="1.05", confidence_interval_usd="0.001", publish_timestamp=self.now,
                observed_timestamp=self.now, freshness_status="ok", status_code="ORACLE_FRESH",
                status_reason="", derivation_method=None
            ),
        ]
        mock_quotes.return_value = [
            NormalizedQuoteSnapshot(
                snapshot_id="q1", protocol="agni", route_id="usdy_route", route_label="exactInputSingle",
                token_in_symbol="USDY", token_out_symbol="mETH", amount_in="1000", amount_out="1010",
                quoted_price="1.01", estimated_slippage_bps="10", route_depth_usd="100000",
                sample_timestamp=self.now, freshness_status="ok", status_code="QUOTE_FRESH",
                status_reason=""
            )
        ]

        risk = self.engine.compute_risk_snapshot(self.portfolio)
        self.assertEqual(risk.risk_band, "RISK_VETO")
        self.assertEqual(risk.total_score, 100.0)


if __name__ == "__main__":
    unittest.main()
