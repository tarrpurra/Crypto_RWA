import asyncio
import unittest
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from services.agent.modules.dashboard.summary import get_dashboard_summary


class DashboardSummaryTests(unittest.TestCase):
    def test_dashboard_summary_prefers_live_portfolio_refresh(self) -> None:
        generated_at = datetime(2026, 6, 14, tzinfo=UTC)
        live_portfolio = MagicMock()
        live_portfolio.generated_at = generated_at
        live_portfolio.updated_at = generated_at

        with (
            patch(
                "services.agent.app.api.portfolio.current_portfolio",
                new=AsyncMock(return_value=live_portfolio),
            ) as current_portfolio_mock,
            patch(
                "services.agent.modules.dashboard.summary.PortfolioSnapshotRepository"
            ) as portfolio_repo_mock,
            patch(
                "services.agent.modules.dashboard.summary.RiskAssessmentRepository"
            ) as risk_repo_mock,
            patch(
                "services.agent.modules.dashboard.summary._latest_allocation_recommendation",
                return_value=None,
            ),
            patch(
                "services.agent.modules.dashboard.summary._latest_pending_proposal",
                return_value=None,
            ),
        ):
            risk_repo_mock.return_value.latest_assessment.return_value = None

            summary = asyncio.run(get_dashboard_summary("0xabc"))

        current_portfolio_mock.assert_awaited_once_with(wallet_address="0xabc")
        portfolio_repo_mock.return_value.latest_snapshot.assert_not_called()
        self.assertIs(summary["portfolio"], live_portfolio)
        self.assertEqual(summary["mode"], "live")


if __name__ == "__main__":
    unittest.main()
