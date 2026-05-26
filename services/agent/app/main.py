from __future__ import annotations

from fastapi import FastAPI

from services.agent.app.api import (
    allocation_router,
    backtests_router,
    chain_router,
    contracts_router,
    decisions_router,
    health_router,
    market_router,
    ops_router,
    portfolio_router,
    risk_router,
)
from services.agent.app.core.logging import configure_logging
from services.agent.app.core.settings import get_settings


settings = get_settings()
configure_logging(settings)

app = FastAPI(title=settings.app_name, version="0.1.0")
app.include_router(health_router)
app.include_router(chain_router)
app.include_router(contracts_router)
app.include_router(market_router)
app.include_router(portfolio_router)
app.include_router(risk_router)
app.include_router(allocation_router)
app.include_router(decisions_router)
app.include_router(backtests_router)
app.include_router(ops_router)
