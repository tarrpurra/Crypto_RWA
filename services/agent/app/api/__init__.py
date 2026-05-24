from services.agent.app.api.chain import router as chain_router
from services.agent.app.api.contracts import router as contracts_router
from services.agent.app.api.health import router as health_router
from services.agent.app.api.market import router as market_router
from services.agent.app.api.portfolio import router as portfolio_router
from services.agent.app.api.risk import router as risk_router
from services.agent.app.api.allocation import router as allocation_router
from services.agent.app.api.decisions import router as decisions_router

__all__ = [
    "chain_router",
    "contracts_router",
    "health_router",
    "market_router",
    "portfolio_router",
    "risk_router",
    "allocation_router",
    "decisions_router",
]
