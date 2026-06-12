from __future__ import annotations

from sqlalchemy import select

from services.agent.app.schemas.risk import RiskAssessmentResponse
from services.agent.risk.engine import RiskEngine
from services.agent.repositories.db.models import RiskAssessmentRecord
from services.agent.repositories.db.session import create_session, init_db


class RiskAssessmentRepository:
    def __init__(self) -> None:
        init_db()

    def save_assessment(self, assessment: RiskAssessmentResponse) -> None:
        with create_session() as session:
            session.merge(self._record_from_assessment(assessment))
            session.commit()

    def latest_assessment(self, asset: str = "portfolio") -> RiskAssessmentResponse | None:
        statement = (
            select(RiskAssessmentRecord)
            .where(RiskAssessmentRecord.asset == asset)
            .order_by(RiskAssessmentRecord.generated_at.desc())
        )
        with create_session() as session:
            record = session.scalars(statement).first()
        return self._assessment_from_record(record) if record is not None else None

    def recent_assessments(self, asset: str = "portfolio", limit: int = 20) -> list[RiskAssessmentResponse]:
        statement = (
            select(RiskAssessmentRecord)
            .where(RiskAssessmentRecord.asset == asset)
            .order_by(RiskAssessmentRecord.generated_at.desc())
            .limit(limit)
        )
        with create_session() as session:
            records = session.scalars(statement).all()
        return [self._assessment_from_record(record) for record in records]

    @staticmethod
    def _record_from_assessment(assessment: RiskAssessmentResponse) -> RiskAssessmentRecord:
        assessment_id = assessment.metadata.get("assessment_id") or f"{assessment.asset}:{assessment.generated_at.isoformat()}"
        metadata = dict(assessment.metadata)
        metadata["assessment_id"] = assessment_id
        return RiskAssessmentRecord(
            assessment_id=assessment_id,
            asset=assessment.asset,
            recommended_action=assessment.recommended_action,
            risk_score=str(assessment.risk_score),
            risk_band=assessment.risk_band,
            confidence=str(assessment.confidence),
            hard_veto_status=assessment.hard_veto_status,
            required_human_approval_status=assessment.required_human_approval_status,
            status=assessment.status,
            status_code=assessment.status_code,
            status_reason=assessment.status_reason,
            generated_at=assessment.generated_at,
            runtime_mode=assessment.runtime_mode,
            target_chain=assessment.target_chain,
            freshness_status=assessment.freshness_status,
            reasoning_summary=assessment.reasoning_summary,
            buckets_json=[bucket.model_dump(mode="json") for bucket in assessment.buckets],
            data_sources_json=assessment.data_sources_used,
            notes_json=assessment.notes,
            metadata_json=metadata,
        )

    @staticmethod
    def _assessment_from_record(record: RiskAssessmentRecord) -> RiskAssessmentResponse:
        normalized_risk_score = RiskEngine._normalize_risk_score(float(record.risk_score))
        normalized_confidence = RiskEngine._normalize_confidence(float(record.confidence))
        return RiskAssessmentResponse(
            asset=record.asset,
            recommended_action=record.recommended_action,
            risk_score=normalized_risk_score,
            risk_score_normalized=normalized_risk_score,
            risk_band=record.risk_band,
            risk_score_scale=RiskEngine._risk_score_scale(),
            confidence=normalized_confidence,
            confidence_normalized=normalized_confidence,
            reasoning_summary=record.reasoning_summary,
            data_sources_used=record.data_sources_json,
            hard_veto_status=record.hard_veto_status,
            required_human_approval_status=record.required_human_approval_status,
            status=record.status,
            status_code=record.status_code,
            status_label=record.status_code,
            status_reason=record.status_reason,
            generated_at=record.generated_at,
            runtime_mode=record.runtime_mode,
            target_chain=record.target_chain,
            freshness_status=record.freshness_status,
            buckets=record.buckets_json,
            notes=record.notes_json,
            metadata=record.metadata_json,
        )
