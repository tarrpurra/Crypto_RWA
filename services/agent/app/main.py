from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from services.agent.app.api import (
    allocation_router,
    chain_router,
    contracts_router,
    dashboard_router,
    decisions_router,
    health_router,
    market_router,
    reports_router,
    strategy_router,
    portfolio_router,
    risk_router,
    settings_router,
    vault_router,
)
from services.agent.app.core.logging import configure_logging
from services.agent.app.core.settings import get_settings


settings = get_settings()
configure_logging(settings)

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(chain_router)
app.include_router(contracts_router)
app.include_router(dashboard_router)
app.include_router(market_router)
app.include_router(reports_router)
app.include_router(strategy_router)
app.include_router(portfolio_router)
app.include_router(risk_router)
app.include_router(allocation_router)
app.include_router(decisions_router)
app.include_router(settings_router)
app.include_router(vault_router)
