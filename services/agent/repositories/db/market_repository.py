from __future__ import annotations

from sqlalchemy import select

from services.agent.app.schemas.market_data import NormalizedPriceSnapshot, RawPriceSnapshot
from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot, RawQuoteSnapshot
from services.agent.modules.market_data.snapshots import PriceIngestionBundle, QuoteIngestionBundle
from services.agent.repositories.db.models import PriceSnapshotRecord, QuoteSnapshotRecord
from services.agent.repositories.db.session import create_session, init_db


class MarketDataRepository:
    def __init__(self) -> None:
        init_db()

    def save_price_bundle(self, bundle: PriceIngestionBundle) -> None:
        with create_session() as session:
            for snapshot in bundle.raw_snapshots:
                session.merge(self._price_record_from_raw(snapshot))
            for snapshot in bundle.normalized_snapshots:
                session.merge(self._price_record_from_normalized(snapshot))
            session.commit()

    def latest_normalized_prices(self) -> list[NormalizedPriceSnapshot]:
        with create_session() as session:
            records = session.scalars(
                select(PriceSnapshotRecord)
                .where(PriceSnapshotRecord.record_kind == "normalized")
                .order_by(PriceSnapshotRecord.created_at.desc())
            ).all()
        seen: set[str] = set()
        results: list[NormalizedPriceSnapshot] = []
        for record in records:
            if record.asset_key in seen:
                continue
            seen.add(record.asset_key)
            results.append(self._normalized_price_from_record(record))
        return results

    def latest_normalized_price_for_asset(self, asset_symbol_or_key: str) -> NormalizedPriceSnapshot | None:
        key = asset_symbol_or_key.lower()
        for snapshot in self.latest_normalized_prices():
            if snapshot.asset_key.lower() == key or snapshot.asset_symbol.lower() == key:
                return snapshot
        return None

    def save_quote_bundle(self, bundle: QuoteIngestionBundle) -> None:
        with create_session() as session:
            for snapshot in bundle.raw_snapshots:
                session.merge(self._quote_record_from_raw(snapshot))
            for snapshot in bundle.normalized_snapshots:
                session.merge(self._quote_record_from_normalized(snapshot))
            session.commit()

    def latest_normalized_quotes(self) -> list[NormalizedQuoteSnapshot]:
        with create_session() as session:
            records = session.scalars(
                select(QuoteSnapshotRecord)
                .where(QuoteSnapshotRecord.record_kind == "normalized")
                .order_by(QuoteSnapshotRecord.created_at.desc())
            ).all()
        seen: set[str] = set()
        results: list[NormalizedQuoteSnapshot] = []
        for record in records:
            route_id = record.route_id or record.snapshot_id
            if route_id in seen:
                continue
            seen.add(route_id)
            results.append(self._normalized_quote_from_record(record))
        return results

    @staticmethod
    def _price_record_from_raw(snapshot: RawPriceSnapshot) -> PriceSnapshotRecord:
        return PriceSnapshotRecord(
            snapshot_id=snapshot.snapshot_id,
            asset_key=snapshot.asset_key,
            asset_symbol=snapshot.asset_symbol,
            asset_address=snapshot.asset_address,
            chain_id=snapshot.chain_id,
            record_kind="raw",
            source=snapshot.source,
            feed_id=snapshot.feed_id,
            price=snapshot.price_raw,
            confidence=snapshot.confidence_raw,
            publish_time=snapshot.publish_timestamp,
            ingest_time=snapshot.fetch_timestamp,
            observed_time=snapshot.fetch_timestamp,
            freshness_status=None,
            status=snapshot.status,
            status_code=snapshot.status_code,
            status_reason=snapshot.status_reason,
            derivation_method=None,
            raw_payload_json=snapshot.raw_payload_json,
            metadata_json={"source_url": snapshot.source_url, "exponent": snapshot.exponent},
        )

    @staticmethod
    def _price_record_from_normalized(snapshot: NormalizedPriceSnapshot) -> PriceSnapshotRecord:
        return PriceSnapshotRecord(
            snapshot_id=snapshot.snapshot_id,
            asset_key=snapshot.asset_key,
            asset_symbol=snapshot.asset_symbol,
            asset_address=snapshot.asset_address,
            chain_id=snapshot.chain_id,
            record_kind="normalized",
            source="normalized",
            feed_id=None,
            price=snapshot.price_usd,
            confidence=snapshot.confidence_interval_usd,
            publish_time=snapshot.publish_timestamp,
            ingest_time=snapshot.observed_timestamp,
            observed_time=snapshot.observed_timestamp,
            freshness_status=snapshot.freshness_status,
            status=snapshot.freshness_status,
            status_code=snapshot.status_code,
            status_reason=snapshot.status_reason,
            derivation_method=snapshot.derivation_method,
            raw_payload_json={},
            metadata_json={
                "data_sources_used": snapshot.data_sources_used,
                "raw_snapshot_ids": snapshot.raw_snapshot_ids,
                "age_seconds": snapshot.age_seconds,
            },
        )

    @staticmethod
    def _normalized_price_from_record(record: PriceSnapshotRecord) -> NormalizedPriceSnapshot:
        return NormalizedPriceSnapshot(
            snapshot_id=record.snapshot_id,
            asset_key=record.asset_key,
            asset_symbol=record.asset_symbol,
            asset_address=record.asset_address,
            chain_id=record.chain_id,
            price_usd=record.price,
            confidence_interval_usd=record.confidence,
            publish_timestamp=record.publish_time,
            observed_timestamp=record.observed_time or record.ingest_time,
            age_seconds=(record.metadata_json or {}).get("age_seconds"),
            freshness_status=record.freshness_status or record.status,
            status_code=record.status_code,
            status_reason=record.status_reason,
            derivation_method=record.derivation_method,
            data_sources_used=(record.metadata_json or {}).get("data_sources_used", []),
            raw_snapshot_ids=(record.metadata_json or {}).get("raw_snapshot_ids", []),
        )

    @staticmethod
    def _quote_record_from_raw(snapshot: RawQuoteSnapshot) -> QuoteSnapshotRecord:
        return QuoteSnapshotRecord(
            snapshot_id=snapshot.snapshot_id,
            protocol=snapshot.protocol,
            route_id=None,
            route_type=snapshot.route_type,
            token_in=snapshot.token_in,
            token_out=snapshot.token_out,
            chain_id=snapshot.chain_id,
            record_kind="raw",
            amount_in=snapshot.amount_in_raw,
            quoted_amount_out=snapshot.amount_out_raw,
            quoted_price=None,
            estimated_slippage_bps=None,
            route_depth_usd=None,
            quote_time=snapshot.sample_timestamp,
            freshness_status=None,
            status=snapshot.status,
            status_code=snapshot.status_code,
            status_reason=snapshot.status_reason,
            raw_payload_json=snapshot.raw_payload_json,
            metadata_json={
                "route_path": snapshot.route_path_json,
                "fee_tier_or_bin_step": snapshot.fee_tier_or_bin_step,
                "block_number": snapshot.block_number,
                "rpc_url": snapshot.rpc_url,
                "amount_in_decimals": snapshot.amount_in_decimals,
                "amount_out_decimals": snapshot.amount_out_decimals,
            },
        )

    @staticmethod
    def _quote_record_from_normalized(snapshot: NormalizedQuoteSnapshot) -> QuoteSnapshotRecord:
        return QuoteSnapshotRecord(
            snapshot_id=snapshot.snapshot_id,
            protocol=snapshot.protocol,
            route_id=snapshot.route_id,
            route_type=snapshot.route_label,
            token_in=snapshot.token_in_symbol,
            token_out=snapshot.token_out_symbol,
            chain_id=0,
            record_kind="normalized",
            amount_in=snapshot.amount_in,
            quoted_amount_out=snapshot.amount_out,
            quoted_price=snapshot.quoted_price,
            estimated_slippage_bps=snapshot.estimated_slippage_bps,
            route_depth_usd=snapshot.route_depth_usd,
            quote_time=snapshot.sample_timestamp,
            freshness_status=snapshot.freshness_status,
            status=snapshot.freshness_status,
            status_code=snapshot.status_code,
            status_reason=snapshot.status_reason,
            raw_payload_json={},
            metadata_json={"candidate_rank": snapshot.candidate_rank, "data_sources_used": snapshot.data_sources_used},
        )

    @staticmethod
    def _normalized_quote_from_record(record: QuoteSnapshotRecord) -> NormalizedQuoteSnapshot:
        return NormalizedQuoteSnapshot(
            snapshot_id=record.snapshot_id,
            protocol=record.protocol,
            route_id=record.route_id or record.snapshot_id,
            route_label=record.route_type,
            token_in_symbol=record.token_in,
            token_out_symbol=record.token_out,
            amount_in=record.amount_in,
            amount_out=record.quoted_amount_out,
            quoted_price=record.quoted_price,
            estimated_slippage_bps=record.estimated_slippage_bps,
            route_depth_usd=record.route_depth_usd,
            candidate_rank=(record.metadata_json or {}).get("candidate_rank"),
            sample_timestamp=record.quote_time,
            freshness_status=record.freshness_status or record.status,
            status_code=record.status_code,
            status_reason=record.status_reason,
            data_sources_used=(record.metadata_json or {}).get("data_sources_used", []),
        )
