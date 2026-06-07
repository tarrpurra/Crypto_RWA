from __future__ import annotations

import unittest
from fastapi.testclient import TestClient

from services.agent.app.main import app


class PortfolioRiskApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_portfolio_snapshot_endpoint(self) -> None:
        response = self.client.get("/portfolio/snapshot")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("snapshot", body)
        self.assertIn("total_value_usd", body["snapshot"])

    def test_risk_snapshot_endpoint(self) -> None:
        response = self.client.get("/risk/snapshot")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("risk", body)
        self.assertIn("total_score", body["risk"])

    def test_allocation_recommendation_endpoint(self) -> None:
        response = self.client.get("/allocation/recommendation")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("decision", body)
        self.assertIn("rebalance_actions", body)

    def test_decisions_endpoint(self) -> None:
        response = self.client.get("/decisions")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("reasoning_summary", body)
        self.assertIn("confidence", body)
        self.assertIn("required_human_approval_status", body)

    def test_update_profile_endpoint(self) -> None:
        response = self.client.post("/allocation/profile", json={"profile_name": "Defensive"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")

    def test_proposal_lifecycle_endpoint(self) -> None:
        proposal_req = {
            "wallet_address": "0x0000000000000000000000000000000000000001",
            "deposit_asset_symbol": "MNT",
            "deposit_amount": 2.5,
            "risk_profile": "Balanced",
            "allocation_mode": "AI Suggested",
        }
        response = self.client.post("/proposals/create", json=proposal_req)
        if response.status_code == 200:
            body = response.json()
            self.assertIn("plan_id", body)
            if not body["linked_proposals"]:
                self.assertIn("status_code", body)
                return
            proposal_id = body["linked_proposals"][0]["proposal_id"]
            
            app_res = self.client.post(f"/proposals/{proposal_id}/approve")
            self.assertEqual(app_res.status_code, 200)
            
            rej_res = self.client.post(f"/proposals/{proposal_id}/reject")
            self.assertEqual(rej_res.status_code, 200)
        else:
            self.assertIn(response.status_code, {400, 422})


if __name__ == "__main__":
    unittest.main()
