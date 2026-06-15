import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from services.agent.app.main import app
from services.agent.modules.oracle.freshness import utc_now
from services.agent.app.schemas.portfolio import PortfolioSnapshotResponse


class PortfolioEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_current_portfolio_returns_ok_with_real_data_when_balances_are_available(self) -> None:
        from unittest.mock import AsyncMock, MagicMock
        from services.agent.modules.market_data.snapshots import PriceIngestionBundle
        from services.agent.app.schemas.market_data import NormalizedPriceSnapshot
        from services.agent.app.core.status_codes import DataStatusCode
        from datetime import UTC, datetime

        now = datetime.now(UTC)
        bundle = PriceIngestionBundle(
            normalized_snapshots=[
                NormalizedPriceSnapshot(
                    snapshot_id="price-1",
                    asset_key="WMNT",
                    asset_symbol="WMNT",
                    chain_id=5003,
                    price_usd="1.0",
                    observed_timestamp=now,
                    publish_timestamp=now,
                    freshness_status="ok",
                    status_code=DataStatusCode.ORACLE_FRESH.value,
                    status_reason="fresh",
                    derivation_method="pyth",
                    data_sources_used=["test"],
                )
            ]
        )
        mock_service = MagicMock()
        mock_service.fetch_latest_prices = AsyncMock(return_value=bundle)

        with (
            patch("services.agent.app.api.portfolio._save_snapshot_best_effort"),
            patch("services.agent.app.api.portfolio.get_price_service", return_value=mock_service),
            patch("services.agent.app.api.portfolio._read_vault_portfolio", return_value=[
                MagicMock(
                    asset_key="WMNT",
                    asset_symbol="WMNT",
                    balance="100",
                    status_code="DATA_FRESH",
                    valuation_status="valued"
                )
            ])
        ):
            response = self.client.get("/portfolio/current")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertIn(body["status_code"], {"DATA_FRESH", "OK", "DATA_PARTIAL"})

    def test_portfolio_snapshot_history_returns_recent_snapshots(self) -> None:
        snapshot = PortfolioSnapshotResponse(
            snapshot_id="snapshot-1",
            generated_at=utc_now(),
            portfolio_address="0xportfolio",
            chain_id=5000,
            base_currency="USD",
            total_value_usd="100",
            positions=[],
            data_sources_used=["test"],
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="fresh",
        )
        with patch("services.agent.app.api.portfolio.PortfolioSnapshotRepository") as repository_class:
            repository_class.return_value.recent_snapshots.return_value = [snapshot]
            response = self.client.get("/portfolio/snapshots")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status_code"], "DATA_FRESH")
        self.assertEqual(body["snapshots"][0]["snapshot_id"], "snapshot-1")

    def test_latest_portfolio_snapshot_returns_404_when_empty(self) -> None:
        with patch("services.agent.app.api.portfolio.PortfolioSnapshotRepository") as repository_class:
            repository_class.return_value.latest_snapshot.return_value = None
            response = self.client.get("/portfolio/snapshots/latest")

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
