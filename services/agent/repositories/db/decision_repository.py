from __future__ import annotations

from decimal import Decimal, InvalidOperation
from uuid import uuid4

from sqlalchemy import select

from services.agent.app.schemas.recommendations import RecommendationResponse
from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.models import DecisionRecommendationRecord
from services.agent.repositories.db.session import create_session, init_db


def _safe_decimal(value: float | int | str | None) -> float:
    try:
        return float(Decimal(str(value or 0)))
    except (InvalidOperation, TypeError, ValueError):
        return 0.0


class DecisionRecommendationRepository:
    def __init__(self) -> None:
        init_db()

    def save_recommendation(
        self,
        response: RecommendationResponse,
        *,
        wallet_address: str | None = None,
        scope_type: str = "wallet",
        deposit_asset_symbol: str | None = None,
        deposit_amount: float | None = None,
        risk_profile: str | None = None,
        allocation_mode: str | None = None,
    ) -> None:
        recommendation_id = (
            str(response.metadata.get("recommendation_id"))
            if isinstance(response.metadata, dict) and response.metadata.get("recommendation_id")
            else f"decision_{uuid4().hex}"
        )
        payload = response.model_dump(mode="json")
        payload.setdefault("metadata", {})
        payload["metadata"]["recommendation_id"] = recommendation_id
        payload["metadata"]["generated_at"] = utc_now().isoformat()
        with create_session() as session:
            session.merge(
                DecisionRecommendationRecord(
                    recommendation_id=recommendation_id,
                    wallet_or_vault=wallet_address,
                    scope_type=scope_type,
                    deposit_asset_symbol=deposit_asset_symbol,
                    deposit_amount=str(deposit_amount) if deposit_amount is not None else None,
                    risk_profile=risk_profile,
                    allocation_mode=allocation_mode,
                    recommended_action=response.recommended_action,
                    confidence=_safe_decimal(response.confidence),
                    status=response.status,
                    status_code=response.status_code,
                    generated_at=utc_now(),
                    response_json=payload,
                )
            )
            session.commit()

    def latest_recommendation(
        self,
        *,
        wallet_address: str | None = None,
        scope_type: str = "wallet",
    ) -> RecommendationResponse | None:
        statement = (
            select(DecisionRecommendationRecord)
            .where(DecisionRecommendationRecord.scope_type == scope_type)
            .order_by(DecisionRecommendationRecord.generated_at.desc())
        )
        if wallet_address:
            statement = statement.where(DecisionRecommendationRecord.wallet_or_vault == wallet_address)
        with create_session() as session:
            record = session.scalars(statement).first()
        if record is None:
            return None
        return RecommendationResponse(**record.response_json)
