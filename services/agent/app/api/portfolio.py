from __future__ import annotations

import logging
from fastapi import APIRouter
from services.agent.app.schemas.portfolio import PortfolioSnapshotResponse, PortfolioSnapshot, AssetBalance
from services.agent.modules.market_data.balances import fetch_portfolio_snapshot
from services.agent.repositories.db.models import PortfolioSnapshotRecord
from services.agent.repositories.db.session import create_session
from services.agent.modules.oracle.freshness import utc_now

logger = logging.getLogger("services.agent.portfolio.api")
router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _save_portfolio_snapshot(snapshot: PortfolioSnapshot) -> None:
    try:
        record = PortfolioSnapshotRecord(
            snapshot_id=snapshot.snapshot_id,
            wallet_or_vault=snapshot.wallet_or_vault,
            total_value_usd=str(snapshot.total_value_usd),
            balances_json=[b.model_dump() for b in snapshot.balances],
            weights_json=snapshot.weights,
            status_code=snapshot.status_code,
            status_reason=snapshot.status_reason,
            created_at=snapshot.created_at,
        )
        with create_session() as session:
            session.merge(record)
            session.commit()
    except Exception as exc:
        logger.warning("Failed to persist portfolio snapshot: %s", exc)


@router.get("/snapshot", response_model=PortfolioSnapshotResponse)
async def get_portfolio_snapshot() -> PortfolioSnapshotResponse:
    snapshot = fetch_portfolio_snapshot()
    _save_portfolio_snapshot(snapshot)

    status = "ok"
    if snapshot.status_code != "DATA_FRESH":
        status = "degraded"

    return PortfolioSnapshotResponse(
        status=status,
        status_code=snapshot.status_code,
        status_label=snapshot.status_code,
        status_reason=snapshot.status_reason,
        generated_at=utc_now(),
        snapshot=snapshot,
    )
