from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from services.agent.app.core.background_jobs import (
    generate_ai_decisions,
    refresh_allocation_snapshots,
    refresh_market_snapshots,
    refresh_portfolio_snapshots,
    refresh_risk_snapshots,
)


logger = logging.getLogger("services.agent.scheduler")
scheduler = AsyncIOScheduler()
_STARTED = False


def start_scheduler() -> None:
    global _STARTED
    if _STARTED:
        return
    scheduler.add_job(refresh_portfolio_snapshots, "interval", seconds=60, id="portfolio_snapshot", replace_existing=True)
    scheduler.add_job(refresh_market_snapshots, "interval", minutes=5, id="market_snapshot", replace_existing=True)
    scheduler.add_job(refresh_risk_snapshots, "interval", minutes=3, id="risk_snapshot", replace_existing=True)
    scheduler.add_job(refresh_allocation_snapshots, "interval", minutes=3, id="allocation_snapshot", replace_existing=True)
    scheduler.add_job(generate_ai_decisions, "interval", hours=1, id="ai_decision_snapshot", replace_existing=True)
    scheduler.start()
    _STARTED = True
    logger.info("Background scheduler started.")
