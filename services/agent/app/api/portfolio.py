from __future__ import annotations

import logging

from fastapi import APIRouter

from services.agent.app.core.settings import get_settings
from services.agent.app.schemas.portfolio import CurrentPortfolioResponse, PortfolioSnapshot, PortfolioSnapshotResponse
from services.agent.modules.market_data.balances import PortfolioSnapshotEngine, fetch_portfolio_snapshot
from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.models import PortfolioSnapshotRecord
from services.agent.repositories.db.session import create_session, init_db


logger = logging.getLogger("services.agent.portfolio.api")
router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _save_portfolio_snapshot(snapshot: PortfolioSnapshot) -> None:
    try:
        init_db()
        record = PortfolioSnapshotRecord(
            snapshot_id=snapshot.snapshot_id,
            wallet_or_vault=snapshot.wallet_or_vault,
            total_value_usd=str(snapshot.total_value_usd),
            balances_json=[balance.model_dump() for balance in snapshot.balances],
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

    return PortfolioSnapshotResponse(
        status="ok" if snapshot.status_code == "DATA_FRESH" else "degraded",
        status_code=snapshot.status_code,
        status_label=snapshot.status_code,
        status_reason=snapshot.status_reason,
        generated_at=utc_now(),
        snapshot=snapshot,
    )


@router.get("/current", response_model=CurrentPortfolioResponse)
async def current_portfolio() -> CurrentPortfolioResponse:
    settings = get_settings()
    portfolio_address = settings.portfolio_wallet_address or settings.executor_vault_address
    reason = "No portfolio wallet or executor vault address is configured for balance reads."
    if portfolio_address:
        reason = "Portfolio balance reads are not implemented for the configured address yet."

    return PortfolioSnapshotEngine().build_snapshot(
        balances=[],
        prices=[],
        portfolio_address=portfolio_address,
        chain_id=settings.effective_chain_id,
        base_currency=settings.portfolio_base_currency,
        missing_reason=reason,
    )
