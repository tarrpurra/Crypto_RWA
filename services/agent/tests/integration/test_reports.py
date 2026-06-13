import asyncio
import unittest
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from services.agent.app.main import app
from services.agent.app.schemas.reports import InvestmentReportResponse
from services.agent.modules.reports.builder import _ReportRequestCache


class ReportEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    @patch("services.agent.app.api.reports.build_investment_report", new_callable=AsyncMock)
    def test_latest_report_endpoint_returns_report_payload(self, build_report) -> None:
        build_report.return_value = InvestmentReportResponse(
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="Detailed investment report generated successfully.",
            generated_at=datetime(2026, 1, 1, tzinfo=UTC),
            report_id="report_1",
            download_name="aixrwa_report_20260101-000000.md",
            wallet_address="0xportfolio",
            ai_decision_maker_enabled=True,
            ai_mode="Full access AI",
            sections=[],
            data_gaps=[],
            markdown="# AIxRWA Investment Report\n",
            metadata={},
        )

        response = self.client.get(
            "/reports/latest?wallet_address=0xportfolio&deposit_asset_symbol=USDY&deposit_amount=100&risk_profile=Balanced"
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["download_name"], "aixrwa_report_20260101-000000.md")
        self.assertEqual(body["ai_mode"], "Full access AI")
        build_report.assert_awaited_once()

    def test_report_request_cache_reuses_fetched_value(self) -> None:
        cache = _ReportRequestCache()
        fetch = AsyncMock(return_value={"value": 1})

        first = asyncio.run(cache.get_or_fetch("portfolio", fetch))
        second = asyncio.run(cache.get_or_fetch("portfolio", fetch))

        self.assertEqual(first, {"value": 1})
        self.assertEqual(second, {"value": 1})
        fetch.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
