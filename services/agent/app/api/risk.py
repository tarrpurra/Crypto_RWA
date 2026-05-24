from __future__ import annotations

import logging
from fastapi import APIRouter
from services.agent.app.schemas.risk import RiskSnapshotResponse, RiskSnapshot
from services.agent.modules.market_data.balances import fetch_portfolio_snapshot
from services.agent.risk.scoring.score_engine import RiskScoreEngine
from services.agent.repositories.db.models import RiskSnapshotRecord
from services.agent.repositories.db.session import create_session
from services.agent.modules.oracle.freshness import utc_now

logger = logging.getLogger("services.agent.risk.api")
router = APIRouter(prefix="/risk", tags=["risk"])


def _save_risk_snapshot(snapshot: RiskSnapshot) -> None:
    try:
        record = RiskSnapshotRecord(
            snapshot_id=snapshot.snapshot_id,
            total_score=snapshot.total_score,
            risk_band=snapshot.risk_band,
            status_code=snapshot.status_code,
            status_reason=snapshot.status_reason,
            bucket_scores_json=snapshot.bucket_scores,
            prechecks_json=snapshot.prechecks,
            notes_json=snapshot.notes,
            created_at=snapshot.created_at,
        )
        with create_session() as session:
            session.merge(record)
            session.commit()
    except Exception as exc:
        logger.warning("Failed to persist risk snapshot: %s", exc)


@router.get("/snapshot", response_model=RiskSnapshotResponse)
async def get_risk_snapshot() -> RiskSnapshotResponse:
    portfolio = fetch_portfolio_snapshot()
    engine = RiskScoreEngine()
    risk = engine.compute_risk_snapshot(portfolio)
    _save_risk_snapshot(risk)

    status = "ok"
    if risk.status_code == "RISK_VETO":
        status = "degraded"

    return RiskSnapshotResponse(
        status=status,
        status_code=risk.status_code,
        status_label=risk.status_code,
        status_reason=risk.status_reason,
        generated_at=utc_now(),
        risk=risk,
    )
