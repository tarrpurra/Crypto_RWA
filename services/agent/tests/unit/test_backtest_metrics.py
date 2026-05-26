from __future__ import annotations

import unittest

from services.agent.simulations.backtests.metrics import compute_hit_rate, compute_metrics, max_drawdown_pct


class BacktestMetricsTests(unittest.TestCase):
    def test_max_drawdown_pct(self) -> None:
        self.assertEqual(max_drawdown_pct([100.0, 120.0, 90.0, 110.0]), 25.0)

    def test_compute_metrics_returns_summary(self) -> None:
        metrics = compute_metrics(
            benchmark_id="test",
            label="Test",
            values=[100.0, 105.0, 102.0],
            risk_bands=["RISK_NORMAL", "RISK_CAUTION", "RISK_CAUTION"],
            turnover_usd=25.0,
            rebalance_count=1,
            veto_count=0,
        )
        self.assertEqual(metrics.total_return_pct, 2.0)
        self.assertEqual(metrics.rebalance_count, 1)
        self.assertEqual(metrics.risk_band_frequency["RISK_CAUTION"], 2)

    def test_compute_hit_rate(self) -> None:
        hit_rate = compute_hit_rate([100.0, 104.0, 103.0], [100.0, 102.0, 101.0])
        self.assertEqual(hit_rate, 1.0)


if __name__ == "__main__":
    unittest.main()
