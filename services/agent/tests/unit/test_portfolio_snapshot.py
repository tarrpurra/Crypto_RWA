import unittest
from datetime import UTC, datetime

from services.agent.app.schemas.market_data import NormalizedPriceSnapshot
from services.agent.app.schemas.portfolio import BalanceObservation
from services.agent.modules.market_data.balances import PortfolioSnapshotEngine


class PortfolioSnapshotEngineTests(unittest.TestCase):
    def test_missing_balances_return_degraded_snapshot(self) -> None:
        snapshot = PortfolioSnapshotEngine().build_snapshot(
            balances=[],
            prices=[],
            portfolio_address=None,
            chain_id=5003,
            missing_reason="No configured balance source.",
        )

        self.assertEqual(snapshot.status, "degraded")
        self.assertEqual(snapshot.status_code, "DATA_MISSING")
        self.assertEqual(snapshot.total_value_usd, None)
        self.assertEqual(snapshot.positions, [])

    def test_values_positions_and_weights_when_prices_are_fresh(self) -> None:
        now = datetime(2026, 1, 1, tzinfo=UTC)
        snapshot = PortfolioSnapshotEngine().build_snapshot(
            balances=[
                BalanceObservation(
                    asset_key="USDY",
                    asset_symbol="USDY",
                    asset_address="0x1",
                    chain_id=5000,
                    balance="100",
                    decimals=18,
                    observed_timestamp=now,
                    balance_source="test_fixture",
                    status="ok",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                ),
                BalanceObservation(
                    asset_key="METH_MAINNET",
                    asset_symbol="mETH",
                    asset_address="0x2",
                    chain_id=5000,
                    balance="2",
                    decimals=18,
                    observed_timestamp=now,
                    balance_source="test_fixture",
                    status="ok",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                ),
            ],
            prices=[
                NormalizedPriceSnapshot(
                    snapshot_id="price-1",
                    asset_key="USDY",
                    asset_symbol="USDY",
                    asset_address="0x1",
                    chain_id=5000,
                    price_usd="1",
                    confidence_interval_usd="0",
                    publish_timestamp=now,
                    observed_timestamp=now,
                    age_seconds=1,
                    freshness_status="fresh",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                    derivation_method="test",
                    data_sources_used=["test_price"],
                    raw_snapshot_ids=["raw-1"],
                ),
                NormalizedPriceSnapshot(
                    snapshot_id="price-2",
                    asset_key="METH_MAINNET",
                    asset_symbol="mETH",
                    asset_address="0x2",
                    chain_id=5000,
                    price_usd="3000",
                    confidence_interval_usd="0",
                    publish_timestamp=now,
                    observed_timestamp=now,
                    age_seconds=1,
                    freshness_status="fresh",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                    derivation_method="test",
                    data_sources_used=["test_price"],
                    raw_snapshot_ids=["raw-2"],
                ),
            ],
            portfolio_address="0xportfolio",
            chain_id=5000,
        )

        self.assertEqual(snapshot.status, "ok")
        self.assertEqual(snapshot.status_code, "DATA_FRESH")
        self.assertEqual(snapshot.total_value_usd, "6100")
        self.assertEqual(snapshot.positions[0].value_usd, "100")
        self.assertEqual(snapshot.positions[1].value_usd, "6000")
        self.assertEqual(snapshot.positions[0].weight, "0.01639344262295081967213114754")
        self.assertEqual(snapshot.positions[1].weight, "0.9836065573770491803278688525")

    def test_unpriced_position_keeps_snapshot_partial(self) -> None:
        now = datetime(2026, 1, 1, tzinfo=UTC)
        snapshot = PortfolioSnapshotEngine().build_snapshot(
            balances=[
                BalanceObservation(
                    asset_key="USDY",
                    asset_symbol="USDY",
                    chain_id=5000,
                    balance="100",
                    decimals=18,
                    observed_timestamp=now,
                    balance_source="test_fixture",
                    status="ok",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                )
            ],
            prices=[],
            portfolio_address="0xportfolio",
            chain_id=5000,
        )

        self.assertEqual(snapshot.status, "degraded")
        self.assertEqual(snapshot.status_code, "DATA_PARTIAL")
        self.assertEqual(snapshot.positions[0].valuation_status, "unvalued")
        self.assertEqual(snapshot.positions[0].status_reason, "No price snapshot is available for this position.")


if __name__ == "__main__":
    unittest.main()
