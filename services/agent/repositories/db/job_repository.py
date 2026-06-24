from __future__ import annotations

from datetime import timedelta

from sqlalchemy import desc, select

from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.models import JobRunRecord
from services.agent.repositories.db.session import create_session, init_db


class JobRunRepository:
    def __init__(self) -> None:
        init_db()

    def start_job(self, job_name: str, metadata: dict | None = None) -> JobRunRecord:
        with create_session() as session:
            record = JobRunRecord(
                job_name=job_name,
                status="running",
                started_at=utc_now(),
                metadata_json=metadata or {},
            )
            session.add(record)
            session.commit()
            session.refresh(record)
            return record

    def mark_success(self, job_id: int, metadata: dict | None = None) -> JobRunRecord:
        return self._mark_finished(job_id, status="success", metadata=metadata, error_message=None)

    def mark_failed(self, job_id: int, error_message: str, metadata: dict | None = None) -> JobRunRecord:
        return self._mark_finished(job_id, status="failed", metadata=metadata, error_message=error_message)

    def _mark_finished(self, job_id: int, *, status: str, metadata: dict | None, error_message: str | None) -> JobRunRecord:
        with create_session() as session:
            record = session.get(JobRunRecord, job_id)
            if record is None:
                raise ValueError(f"Unknown job run id: {job_id}")
            record.status = status
            record.finished_at = utc_now()
            record.error_message = error_message
            record.metadata_json = metadata or {}
            session.commit()
            session.refresh(record)
            return record

    def recent_jobs(self, limit: int = 20) -> list[JobRunRecord]:
        safe_limit = max(1, min(limit, 100))
        with create_session() as session:
            return list(
                session.scalars(
                    select(JobRunRecord).order_by(desc(JobRunRecord.started_at)).limit(safe_limit)
                ).all()
            )

    def has_recent_running_job(self, job_name: str, *, within_seconds: int = 300) -> bool:
        cutoff = utc_now() - timedelta(seconds=within_seconds)
        with create_session() as session:
            record = session.scalars(
                select(JobRunRecord)
                .where(
                    JobRunRecord.job_name == job_name,
                    JobRunRecord.status == "running",
                    JobRunRecord.started_at >= cutoff,
                )
                .order_by(desc(JobRunRecord.started_at))
            ).first()
        return record is not None
