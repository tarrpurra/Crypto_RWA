import unittest

from fastapi.testclient import TestClient

from services.agent.app.main import app


class HealthEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_health_endpoint_includes_runtime_context(self) -> None:
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertIn("runtime_mode", body)
        self.assertIn("status_code", body)

    def test_status_endpoint_includes_freshness_thresholds(self) -> None:
        response = self.client.get("/status")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("configured_contracts", body)
        self.assertIn("freshness_thresholds", body)
        self.assertIn("pyth_eth_usd", body["freshness_thresholds"])


if __name__ == "__main__":
    unittest.main()
