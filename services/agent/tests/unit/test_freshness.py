import unittest
from datetime import UTC, datetime, timedelta

from services.agent.modules.oracle.freshness import age_seconds, evaluate_freshness


class FreshnessTests(unittest.TestCase):
    def test_age_seconds_uses_publish_timestamp(self) -> None:
        observed = datetime(2026, 1, 1, tzinfo=UTC)
        published = observed - timedelta(seconds=42)

        self.assertEqual(age_seconds(published, observed), 42)

    def test_evaluate_freshness_marks_fresh(self) -> None:
        evaluation = evaluate_freshness(
            age_in_seconds=30,
            fresh_limit_seconds=120,
            warn_after_seconds=120,
            hard_block_after_seconds=300,
            fresh_code="ORACLE_FRESH",
            stale_code="ORACLE_STALE",
            source_label="ETH/USD",
        )

        self.assertEqual(evaluation.status, "ok")
        self.assertEqual(evaluation.status_code, "ORACLE_FRESH")
        self.assertFalse(evaluation.hard_blocked)

    def test_evaluate_freshness_marks_hard_block(self) -> None:
        evaluation = evaluate_freshness(
            age_in_seconds=301,
            fresh_limit_seconds=120,
            warn_after_seconds=120,
            hard_block_after_seconds=300,
            fresh_code="ORACLE_FRESH",
            stale_code="ORACLE_STALE",
            source_label="ETH/USD",
        )

        self.assertEqual(evaluation.status, "stale")
        self.assertEqual(evaluation.status_code, "ORACLE_STALE")
        self.assertTrue(evaluation.hard_blocked)


if __name__ == "__main__":
    unittest.main()
