from __future__ import annotations

import unittest

from services.agent.app.schemas.backtests import BacktestRunRequest
from services.agent.simulations.backtests.engine import BacktestEngine, list_scenarios


class BacktestEngineTests(unittest.TestCase):
    def test_list_scenarios_returns_three_seeded_stress_cases(self) -> None:
        scenario_ids = {scenario.scenario_id for scenario in list_scenarios()}
        self.assertEqual(scenario_ids, {"depeg", "liquidity_shock", "stale_oracle"})

    def test_run_depeg_scenario_reaches_veto_state(self) -> None:
        result = BacktestEngine().run(BacktestRunRequest(scenario_id="depeg"))
        self.assertEqual(result.status, "ok")
        self.assertEqual(result.scenario.step_count, 3)
        self.assertEqual(result.steps[-1].risk_band, "RISK_VETO")
        self.assertEqual(result.steps[-1].recommended_action, "PAUSE")
        self.assertGreaterEqual(len(result.benchmarks), 3)

    def test_unknown_scenario_rejected(self) -> None:
        with self.assertRaises(ValueError):
            BacktestEngine().run(BacktestRunRequest(scenario_id="missing"))


if __name__ == "__main__":
    unittest.main()
