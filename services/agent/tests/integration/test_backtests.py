from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from services.agent.app.main import app


class BacktestsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_scenarios_endpoint(self) -> None:
        response = self.client.get("/backtests/scenarios")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status_code"], "SIMULATION_ONLY")
        self.assertGreaterEqual(len(body["scenarios"]), 3)

    def test_run_endpoint(self) -> None:
        response = self.client.post("/backtests/run", json={"scenario_id": "liquidity_shock"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["scenario"]["scenario_id"], "liquidity_shock")
        self.assertIn("benchmarks", body)
        self.assertIn("steps", body)

    def test_demo_summary_endpoint(self) -> None:
        response = self.client.get("/backtests/demo-summary")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status_code"], "SIMULATION_ONLY")
        self.assertEqual(len(body["results"]), 3)


if __name__ == "__main__":
    unittest.main()
