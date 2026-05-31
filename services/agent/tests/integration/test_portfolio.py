import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from services.agent.app.main import app
from services.agent.modules.oracle.freshness import utc_now
from services.agent.app.schemas.portfolio import PortfolioSnapshotResponse


class PortfolioEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_current_portfolio_returns_degraded_when_no_complete_balance_data(self) -> None:
        with patch("services.agent.app.api.portfolio._save_snapshot_best_effort"):
            response = self.client.get("/portfolio/current")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "degraded")
        self.assertIn(body["status_code"], {"DATA_MISSING", "DATA_PARTIAL"})
        self.assertIsNone(body["total_value_usd"])
        self.assertIn("portfolio", body["status_reason"].lower())

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
