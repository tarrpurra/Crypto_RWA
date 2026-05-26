from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from services.agent.app.main import app


class OpsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_ops_health_endpoint(self) -> None:
        response = self.client.get("/ops/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("sources", body)
        self.assertIn("recommended_mode", body)
        self.assertIn("alerts", body)

    def test_ops_alerts_endpoint(self) -> None:
        response = self.client.get("/ops/alerts")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("alerts", body)
        self.assertIn("status_code", body)

    def test_ops_readiness_endpoint(self) -> None:
        response = self.client.get("/ops/readiness")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("ready_for_live", body)
        self.assertIn("blockers", body)
        self.assertIn("warnings", body)


if __name__ == "__main__":
    unittest.main()
