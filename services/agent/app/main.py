from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from web3 import Web3

from services.agent.app.api import (
    allocation_router,
    chain_router,
    contracts_router,
    dashboard_router,
    decisions_router,
    health_router,
    jobs_router,
    logs_router,
    market_router,
    reports_router,
    strategy_router,
    portfolio_router,
    risk_router,
    settings_router,
    vault_router,
)
from services.agent.app.core import runtime_config
from services.agent.app.core.logging import configure_logging
from services.agent.app.core.scheduler import start_scheduler
from services.agent.app.core.settings import get_settings


settings = get_settings()
configure_logging(settings)


def _validate_executor_vault_configuration() -> None:
    vault_address = (settings.executor_vault_address or "").strip()
    if not vault_address:
        return
    if not Web3.is_address(vault_address):
        raise RuntimeError(f"EXECUTOR_VAULT_ADDRESS is not a valid EVM address: {vault_address}")


_validate_executor_vault_configuration()

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(jobs_router)
app.include_router(logs_router)
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


@app.on_event("startup")
async def startup_event() -> None:
    runtime_config.set_ai_decision_maker_enabled(settings.ai_decision_maker_enabled)
    start_scheduler()
