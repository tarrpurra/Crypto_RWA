from __future__ import annotations

from sqlalchemy import select

from services.agent.app.schemas.portfolio import PortfolioSnapshotResponse
from services.agent.repositories.db.normalization import normalize_json_symbols
from services.agent.repositories.db.models import PortfolioSnapshotRecord
from services.agent.repositories.db.session import create_session, init_db


class PortfolioSnapshotRepository:
    def __init__(self) -> None:
        init_db()

    def save_snapshot(self, snapshot: PortfolioSnapshotResponse) -> None:
        with create_session() as session:
            session.merge(self._record_from_snapshot(snapshot))
            session.commit()

    def latest_snapshot(self, portfolio_address: str | None = None) -> PortfolioSnapshotResponse | None:
        statement = select(PortfolioSnapshotRecord).order_by(PortfolioSnapshotRecord.generated_at.desc())
        if portfolio_address:
            statement = statement.where(PortfolioSnapshotRecord.portfolio_address == portfolio_address)

        with create_session() as session:
            record = session.scalars(statement).first()
        return self._snapshot_from_record(record) if record is not None else None

    def recent_snapshots(self, portfolio_address: str | None = None, limit: int = 20) -> list[PortfolioSnapshotResponse]:
        statement = select(PortfolioSnapshotRecord).order_by(PortfolioSnapshotRecord.generated_at.desc()).limit(limit)
        if portfolio_address:
            statement = statement.where(PortfolioSnapshotRecord.portfolio_address == portfolio_address)

        with create_session() as session:
            records = session.scalars(statement).all()
        return [self._snapshot_from_record(record) for record in records]

    def known_portfolio_addresses(self, limit: int = 100) -> list[str]:
        statement = (
            select(PortfolioSnapshotRecord.portfolio_address)
            .where(PortfolioSnapshotRecord.portfolio_address.is_not(None))
            .order_by(PortfolioSnapshotRecord.generated_at.desc())
            .limit(limit)
        )
        with create_session() as session:
            addresses = session.scalars(statement).all()
        seen: set[str] = set()
        result: list[str] = []
        for address in addresses:
            if not address:
                continue
            lower = address.lower()
            if lower in seen:
                continue
            seen.add(lower)
            result.append(address)
        return result

    @staticmethod
    def _record_from_snapshot(snapshot: PortfolioSnapshotResponse) -> PortfolioSnapshotRecord:
        return PortfolioSnapshotRecord(
            snapshot_id=snapshot.snapshot_id,
            portfolio_address=snapshot.portfolio_address,
            chain_id=snapshot.chain_id,
            base_currency=snapshot.base_currency,
            total_value_usd=snapshot.total_value_usd,
            invested_amount_usd=snapshot.invested_amount_usd,
            total_deposits_usd=snapshot.total_deposits_usd,
            total_withdrawals_usd=snapshot.total_withdrawals_usd,
            pnl_usd=snapshot.pnl_usd,
            pnl_percent=snapshot.pnl_percent,
            generated_at=snapshot.generated_at,
            status=snapshot.status,
            status_code=snapshot.status_code,
            status_reason=snapshot.status_reason,
            positions_json=normalize_json_symbols([position.model_dump(mode="json") for position in snapshot.positions]),
            data_sources_json=snapshot.data_sources_used,
            metadata_json=snapshot.metadata,
        )

    @staticmethod
    def _snapshot_from_record(record: PortfolioSnapshotRecord) -> PortfolioSnapshotResponse:
        metadata = record.metadata_json or {}
        return PortfolioSnapshotResponse(
            snapshot_id=record.snapshot_id,
            generated_at=record.generated_at,
            portfolio_address=record.portfolio_address,
            chain_id=record.chain_id,
            base_currency=record.base_currency,
            total_value_usd=record.total_value_usd,
            invested_amount_usd=record.invested_amount_usd or metadata.get("invested_amount_usd"),
            total_deposits_usd=record.total_deposits_usd or metadata.get("total_deposits_usd"),
            total_withdrawals_usd=record.total_withdrawals_usd or metadata.get("total_withdrawals_usd"),
            pnl_usd=record.pnl_usd or metadata.get("pnl_usd"),
            pnl_percent=record.pnl_percent or metadata.get("pnl_percent"),
            positions=normalize_json_symbols(record.positions_json),
            data_sources_used=record.data_sources_json,
            status=record.status,
            status_code=record.status_code,
            status_label=record.status_code,
            status_reason=record.status_reason,
            metadata=metadata,
        )
