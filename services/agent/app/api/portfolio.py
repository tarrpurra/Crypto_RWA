from __future__ import annotations

from fastapi import APIRouter

from services.agent.app.core.settings import get_settings
from services.agent.app.schemas.portfolio import PortfolioSnapshotResponse
from services.agent.modules.market_data.balances import PortfolioSnapshotEngine


router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/current", response_model=PortfolioSnapshotResponse)
async def current_portfolio() -> PortfolioSnapshotResponse:
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
