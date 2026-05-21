import unittest
from datetime import UTC, datetime

from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot
from services.agent.modules.quotes.route_ranker import rank_quotes


class QuoteRankingTests(unittest.TestCase):
    def test_rank_quotes_prefers_available_outputs(self) -> None:
        now = datetime(2026, 1, 1, tzinfo=UTC)
        ranked = rank_quotes(
            [
                NormalizedQuoteSnapshot(
                    snapshot_id="1",
                    protocol="AGNI",
                    route_id="a",
                    route_label="route-a",
                    token_in_symbol="USDY",
                    token_out_symbol="mETH",
                    amount_in="1000",
                    amount_out=None,
                    quoted_price=None,
                    estimated_slippage_bps=None,
                    route_depth_usd=None,
                    candidate_rank=None,
                    sample_timestamp=now,
                    freshness_status="missing",
                    status_code="LIQUIDITY_UNKNOWN",
                    status_reason="missing",
                    data_sources_used=[],
                ),
                NormalizedQuoteSnapshot(
                    snapshot_id="2",
                    protocol="AGNI",
                    route_id="b",
                    route_label="route-b",
                    token_in_symbol="USDY",
                    token_out_symbol="mETH",
                    amount_in="1000",
                    amount_out="10",
                    quoted_price="0.01",
                    estimated_slippage_bps="5",
                    route_depth_usd="10000",
                    candidate_rank=None,
                    sample_timestamp=now,
                    freshness_status="ok",
                    status_code="QUOTE_FRESH",
                    status_reason="fresh",
                    data_sources_used=[],
                ),
            ]
        )

        self.assertEqual(ranked[0].route_id, "b")
        self.assertEqual(ranked[0].candidate_rank, 1)


if __name__ == "__main__":
    unittest.main()
