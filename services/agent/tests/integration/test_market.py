import unittest

from fastapi.testclient import TestClient

from services.agent.app.main import app


class MarketEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_ingestion_status_endpoint_returns_assets(self) -> None:
        response = self.client.get("/market/ingestion/status")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("assets", body)
        self.assertGreaterEqual(len(body["assets"]), 1)

    def test_latest_prices_endpoint_returns_structured_response(self) -> None:
        response = self.client.get("/market/prices/latest")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("prices", body)
        self.assertIn("status_code", body)


if __name__ == "__main__":
    unittest.main()
