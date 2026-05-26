import unittest
from datetime import UTC, datetime

from services.agent.app.core.status_codes import DataStatusCode, RiskStatusCode, RuntimeMode
from services.agent.app.schemas.portfolio import PortfolioPosition, PortfolioSnapshotResponse
from services.agent.risk.engine import RiskEngine


def _portfolio(*, status_code: str, positions: list[PortfolioPosition]) -> PortfolioSnapshotResponse:
    return PortfolioSnapshotResponse(
        snapshot_id="portfolio-1",
        generated_at=datetime(2026, 1, 1, tzinfo=UTC),
        portfolio_address="0xportfolio",
        chain_id=5000,
        base_currency="USD",
        total_value_usd="100" if status_code == DataStatusCode.DATA_FRESH.value else None,
        positions=positions,
        data_sources_used=["test_fixture"],
        status="ok" if status_code == DataStatusCode.DATA_FRESH.value else "degraded",
        status_code=status_code,
        status_label=status_code,
        status_reason="fixture",
    )


class RiskEngineTests(unittest.TestCase):
    def test_missing_portfolio_triggers_hard_veto(self) -> None:
        result = RiskEngine().evaluate(
            portfolio=_portfolio(status_code=DataStatusCode.DATA_MISSING.value, positions=[]),
            runtime_mode=RuntimeMode.MONITOR_ONLY,
            target_chain="mantle_sepolia",
        )

        self.assertEqual(result.status_code, RiskStatusCode.RISK_VETO.value)
        self.assertEqual(result.recommended_action, "pause")
        self.assertEqual(result.hard_veto_status, "active")

    def test_partial_portfolio_with_unvalued_position_triggers_hard_veto(self) -> None:
        result = RiskEngine().evaluate(
            portfolio=_portfolio(
                status_code=DataStatusCode.DATA_PARTIAL.value,
                positions=[
                    PortfolioPosition(
                        asset_key="USDY",
                        asset_symbol="USDY",
                        chain_id=5000,
                        balance="100",
                        balance_source="test_fixture",
                        valuation_status="unvalued",
                        status_code=DataStatusCode.DATA_MISSING.value,
                        status_reason="missing price",
                    )
                ],
            ),
            runtime_mode=RuntimeMode.MONITOR_ONLY,
            target_chain="mantle_mainnet",
        )

        self.assertEqual(result.status_code, RiskStatusCode.RISK_VETO.value)
        self.assertEqual(result.confidence, 0.25)

    def test_fresh_portfolio_still_rebalance_only_without_quote_validation(self) -> None:
        result = RiskEngine().evaluate(
            portfolio=_portfolio(
                status_code=DataStatusCode.DATA_FRESH.value,
                positions=[
                    PortfolioPosition(
                        asset_key="USDY",
                        asset_symbol="USDY",
                        chain_id=5000,
                        balance="100",
                        balance_source="test_fixture",
                        price_usd="1",
                        value_usd="100",
                        weight="1",
                        target_weight="1",
                        weight_drift="0",
                        drift_status="within_target",
                        valuation_status="valued",
                        status_code=DataStatusCode.DATA_FRESH.value,
                        status_reason="valued",
                    )
                ],
            ),
            runtime_mode=RuntimeMode.MONITOR_ONLY,
            target_chain="mantle_mainnet",
        )

        self.assertEqual(result.status_code, RiskStatusCode.RISK_REBALANCE_ONLY.value)
        self.assertEqual(result.recommended_action, "rebalance_only")
        self.assertEqual(result.hard_veto_status, "inactive")
        self.assertEqual(result.risk_score, 27.5)
        self.assertEqual(result.metadata["scoring_method"], "weighted_bucket_score_with_restrictive_status_escalation")
        self.assertEqual(result.buckets[1].weight, 0.2)

    def test_fresh_portfolio_and_quotes_can_score_normal(self) -> None:
        result = RiskEngine().evaluate(
            portfolio=_portfolio(
                status_code=DataStatusCode.DATA_FRESH.value,
                positions=[
                    PortfolioPosition(
                        asset_key="USDY",
                        asset_symbol="USDY",
                        chain_id=5000,
                        balance="100",
                        balance_source="test_fixture",
                        price_usd="1",
                        value_usd="100",
                        weight="1",
                        target_weight="1",
                        weight_drift="0",
                        drift_status="within_target",
                        valuation_status="valued",
                        status_code=DataStatusCode.DATA_FRESH.value,
                        status_reason="valued",
                    )
                ],
            ),
            runtime_mode=RuntimeMode.LIVE,
            target_chain="mantle_mainnet",
            quote_validation_status=DataStatusCode.QUOTE_FRESH.value,
        )

        self.assertEqual(result.status_code, RiskStatusCode.RISK_NORMAL.value)
        self.assertEqual(result.confidence, 0.85)
        self.assertEqual(result.risk_score, 15.0)


if __name__ == "__main__":
    unittest.main()
