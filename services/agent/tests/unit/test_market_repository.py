import unittest

from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.repositories.db.models import PriceSnapshotRecord


class MarketDataRepositoryTests(unittest.TestCase):
    def test_price_record_values_omits_null_created_at(self) -> None:
        record = PriceSnapshotRecord(
            snapshot_id="snap-1",
            asset_key="SEPOLIA_USDY",
            asset_symbol="USDY",
            asset_address="0x0000000000000000000000000000000000000001",
            chain_id=5003,
            record_kind="normalized",
            source="normalized",
            feed_id=None,
            price="1.0",
            confidence="0.01",
            publish_time=utc_now(),
            ingest_time=utc_now(),
            observed_time=utc_now(),
            freshness_status="ok",
            status="ok",
            status_code="ORACLE_FRESH",
            status_reason="ok",
            derivation_method="pyth_direct",
            raw_payload_json={},
            metadata_json={},
        )

        values = MarketDataRepository._price_record_values(record)

        self.assertNotIn("created_at", values)

    def test_price_record_values_keeps_explicit_created_at(self) -> None:
        created_at = utc_now()
        record = PriceSnapshotRecord(
            snapshot_id="snap-2",
            asset_key="SEPOLIA_WMNT",
            asset_symbol="WMNT",
            asset_address="0x0000000000000000000000000000000000000002",
            chain_id=5003,
            record_kind="raw",
            source="pyth_hermes",
            feed_id="feed-1",
            price="0.5",
            confidence="0.01",
            publish_time=utc_now(),
            ingest_time=utc_now(),
            observed_time=utc_now(),
            freshness_status=None,
            status="ok",
            status_code="ORACLE_FRESH",
            status_reason="ok",
            derivation_method=None,
            raw_payload_json={},
            metadata_json={},
            created_at=created_at,
        )

        values = MarketDataRepository._price_record_values(record)

        self.assertEqual(values["created_at"], created_at)


if __name__ == "__main__":
    unittest.main()
