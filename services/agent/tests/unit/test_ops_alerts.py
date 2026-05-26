from __future__ import annotations

import unittest

from services.agent.app.core.settings import Settings
from services.agent.modules.alerts.retry import bounded_retry
from services.agent.modules.alerts.thresholds import evaluate_ops_health


class OpsAlertTests(unittest.TestCase):
    def test_evaluate_ops_health_returns_restricted_mode_when_snapshots_missing(self) -> None:
        settings = Settings(database_url="sqlite:///:memory:")
        response = evaluate_ops_health(settings)
        self.assertIn(response.recommended_mode, {"pause", "rebalance_only", "monitor_only"})
        self.assertGreaterEqual(len(response.sources), 7)
        self.assertTrue(any(source.source == "market_prices" for source in response.sources))

    def test_bounded_retry_retries_transient_failure(self) -> None:
        attempts = {"count": 0}

        def operation() -> str:
            attempts["count"] += 1
            if attempts["count"] == 1:
                raise RuntimeError("transient")
            return "ok"

        self.assertEqual(bounded_retry(operation, attempts=2), "ok")
        self.assertEqual(attempts["count"], 2)


if __name__ == "__main__":
    unittest.main()
