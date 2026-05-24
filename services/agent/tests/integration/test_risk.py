import unittest
from datetime import UTC, datetime
from unittest.mock import patch

from fastapi.testclient import TestClient

from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.main import app
from services.agent.app.schemas.portfolio import PortfolioSnapshotResponse


class RiskEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_current_risk_returns_hard_veto_for_missing_portfolio(self) -> None:
        portfolio = PortfolioSnapshotResponse(
            snapshot_id="portfolio-1",
            generated_at=datetime(2026, 1, 1, tzinfo=UTC),
            portfolio_address=None,
            chain_id=5003,
            base_currency="USD",
            total_value_usd=None,
            positions=[],
            data_sources_used=[],
            status="degraded",
            status_code=DataStatusCode.DATA_MISSING.value,
            status_label=DataStatusCode.DATA_MISSING.value,
            status_reason="missing portfolio",
        )

        with (
            patch("services.agent.app.api.risk.current_portfolio", return_value=portfolio),
            patch("services.agent.app.api.risk._save_assessment_best_effort"),
        ):
            response = self.client.get("/risk/current")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["asset"], "portfolio")
        self.assertEqual(body["recommended_action"], "pause")
        self.assertEqual(body["hard_veto_status"], "active")
        self.assertGreaterEqual(len(body["buckets"]), 1)

    def test_risk_assessment_history_returns_recent_assessments(self) -> None:
        assessment = {
            "asset": "portfolio",
            "recommended_action": "pause",
            "risk_score": 100,
            "risk_band": "RISK_VETO",
            "confidence": 0.25,
            "reasoning_summary": "fixture",
            "data_sources_used": [],
            "hard_veto_status": "active",
            "required_human_approval_status": "required",
            "status": "degraded",
            "status_code": "RISK_VETO",
            "status_label": "RISK_VETO",
            "status_reason": "fixture",
            "generated_at": datetime(2026, 1, 1, tzinfo=UTC),
            "runtime_mode": "monitor_only",
            "target_chain": "mantle_sepolia",
            "freshness_status": "DATA_MISSING",
            "buckets": [],
            "notes": [],
            "metadata": {},
        }

        with patch("services.agent.app.api.risk.RiskAssessmentRepository") as repository_class:
            repository_class.return_value.recent_assessments.return_value = [assessment]
            response = self.client.get("/risk/assessments")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status_code"], "DATA_FRESH")
        self.assertEqual(body["assessments"][0]["status_code"], "RISK_VETO")

    def test_latest_risk_assessment_returns_404_when_empty(self) -> None:
        with patch("services.agent.app.api.risk.RiskAssessmentRepository") as repository_class:
            repository_class.return_value.latest_assessment.return_value = None
            response = self.client.get("/risk/assessments/latest")

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
