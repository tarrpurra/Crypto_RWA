import unittest

from fastapi.testclient import TestClient

from services.agent.app.main import app


class PortfolioEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_current_portfolio_returns_missing_data_without_balance_source(self) -> None:
        response = self.client.get("/portfolio/current")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["status_code"], "DATA_MISSING")
        self.assertEqual(body["positions"], [])
        self.assertIn("portfolio", body["status_reason"].lower())


if __name__ == "__main__":
    unittest.main()
