from services.agent.app.api.allocation import router as allocation_router
from services.agent.app.api.chain import router as chain_router
from services.agent.app.api.contracts import router as contracts_router
from services.agent.app.api.dashboard import router as dashboard_router
from services.agent.app.api.decisions import router as decisions_router
from services.agent.app.api.health import router as health_router
from services.agent.app.api.market import router as market_router
from services.agent.app.api.settings import router as settings_router
from services.agent.app.api.reports import router as reports_router
from services.agent.app.api.strategy import router as strategy_router
from services.agent.app.api.portfolio import router as portfolio_router
from services.agent.app.api.risk import router as risk_router
from services.agent.app.api.vault import router as vault_router

__all__ = [
    "allocation_router",
    "chain_router",
    "contracts_router",
    "dashboard_router",
    "decisions_router",
    "health_router",
    "market_router",
    "reports_router",
    "strategy_router",
    "portfolio_router",
    "risk_router",
    "settings_router",
    "vault_router",
]
