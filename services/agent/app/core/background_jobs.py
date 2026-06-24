from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime
from decimal import Decimal

from services.agent.app.core.cache import (
    allocation_cache,
    clear_all_caches,
    decision_cache,
    market_cache,
    portfolio_cache,
    risk_cache,
)
from services.agent.app.core.settings import RuntimeMode, get_settings
from services.agent.app.schemas.allocation import AllocationDecisionResponse
from services.agent.app.schemas.dashboard import DashboardFreshnessPayload
from services.agent.app.schemas.recommendations import RecommendationResponse
from services.agent.modules.market_data import PRICE_SNAPSHOT_STORE, QUOTE_SNAPSHOT_STORE, get_price_service
from services.agent.modules.market_data.balances import internal_snapshot_from_response
from services.agent.modules.decisions.context import risk_assessment_to_snapshot
from services.agent.modules.oracle.freshness import utc_now
from services.agent.modules.quotes import get_quote_service
from services.agent.repositories.db.allocation_repository import AllocationDecisionRepository
from services.agent.repositories.db.decision_repository import DecisionRecommendationRepository
from services.agent.repositories.db.job_repository import JobRunRepository
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.repositories.db.portfolio_repository import PortfolioSnapshotRepository
from services.agent.repositories.db.risk_repository import RiskAssessmentRepository
from services.agent.repositories.db.vault_repository import VaultFlowRepository
from services.agent.risk.engine import RiskEngine
from services.agent.strategies.allocation.rebalance import compute_rebalance
from services.agent.strategies.decision_templates.parser import generate_recommendation_reasoning


logger = logging.getLogger("services.agent.background_jobs")

_JOB_LOCKS: dict[str, asyncio.Lock] = {}


def _job_lock(job_name: str) -> asyncio.Lock:
    lock = _JOB_LOCKS.get(job_name)
    if lock is None:
        lock = asyncio.Lock()
        _JOB_LOCKS[job_name] = lock
    return lock


def _known_wallet_addresses() -> list[str]:
    settings = get_settings()
    addresses: list[str] = []
    for address in (
        settings.portfolio_wallet_address,
        *PortfolioSnapshotRepository().known_portfolio_addresses(limit=100),
        *VaultFlowRepository().known_user_addresses(limit=100),
    ):
        if not address:
            continue
        lower = address.lower()
        if lower not in {item.lower() for item in addresses}:
            addresses.append(address)
    return addresses


async def _run_tracked_job(
    job_name: str,
    work: Callable[[], Awaitable[dict]],
) -> dict:
    lock = _job_lock(job_name)
    if lock.locked():
        return {"job_name": job_name, "status": "skipped", "reason": "already_running"}

    repo = JobRunRepository()
    if repo.has_recent_running_job(job_name, within_seconds=300):
        return {"job_name": job_name, "status": "skipped", "reason": "recent_running_job"}

    async with lock:
        job = repo.start_job(job_name)
        try:
            result = await work()
            repo.mark_success(job.id, metadata=result)
            return {"job_id": job.id, "job_name": job_name, "status": "success", "result": result}
        except Exception as exc:
            logger.exception("Background job %s failed", job_name)
            repo.mark_failed(job.id, str(exc), metadata={"error_type": type(exc).__name__})
            return {"job_id": job.id, "job_name": job_name, "status": "failed", "error": str(exc)}


async def refresh_portfolio_snapshots(wallet_address: str | None = None) -> dict:
    async def work() -> dict:
        from services.agent.app.api.portfolio import current_portfolio

        wallets = [wallet_address] if wallet_address else _known_wallet_addresses()
        refreshed: list[str] = []
        for wallet in wallets:
            if not wallet:
                continue
            await current_portfolio(wallet_address=wallet, allow_env_fallback=False, force_refresh=True)
            refreshed.append(wallet)
        clear_all_caches()
        return {"wallets": refreshed, "count": len(refreshed)}

    return await _run_tracked_job("portfolio_snapshot", work)


async def refresh_market_snapshots() -> dict:
    async def work() -> dict:
        price_service = get_price_service()
        quote_service = get_quote_service()
        price_bundle = await price_service.fetch_latest_prices()
        PRICE_SNAPSHOT_STORE.write(price_bundle)
        MarketDataRepository().save_price_bundle(price_bundle)
        routes = await asyncio.to_thread(quote_service.discover_routes)
        quote_bundle = await asyncio.to_thread(quote_service.sample_latest_quotes, routes)
        QUOTE_SNAPSHOT_STORE.write(quote_bundle)
        MarketDataRepository().save_quote_bundle(quote_bundle)
        clear_all_caches()
        return {
            "prices": len(price_bundle.normalized_snapshots),
            "quotes": len(quote_bundle.normalized_snapshots),
            "routes": len(routes),
        }

    return await _run_tracked_job("market_snapshot", work)


async def refresh_risk_snapshots(wallet_address: str | None = None) -> dict:
    async def work() -> dict:
        settings = get_settings()
        price_repo = MarketDataRepository()
        portfolio_repo = PortfolioSnapshotRepository()
        risk_repo = RiskAssessmentRepository()
        wallets = [wallet_address] if wallet_address else _known_wallet_addresses()
        refreshed: list[str] = []
        prices = price_repo.latest_normalized_prices()
        quotes = price_repo.latest_normalized_quotes()
        quote_validation_status = "QUOTE_FRESH" if any(quote.amount_out is not None for quote in quotes) else "DATA_MISSING"
        for wallet in wallets:
            snapshot = portfolio_repo.latest_snapshot(portfolio_address=wallet)
            if snapshot is None:
                continue
            assessment = RiskEngine().evaluate(
                portfolio=snapshot,
                runtime_mode=settings.runtime_mode,
                target_chain=settings.target_chain.value,
                quote_validation_status=quote_validation_status,
                prices=prices,
                quotes=quotes,
            )
            risk_repo.save_assessment(assessment)
            refreshed.append(wallet)
        clear_all_caches()
        return {"wallets": refreshed, "count": len(refreshed)}

    return await _run_tracked_job("risk_snapshot", work)


async def refresh_allocation_snapshots(wallet_address: str | None = None) -> dict:
    async def work() -> dict:
        settings = get_settings()
        portfolio_repo = PortfolioSnapshotRepository()
        risk_repo = RiskAssessmentRepository()
        allocation_repo = AllocationDecisionRepository()
        wallets = [wallet_address] if wallet_address else _known_wallet_addresses()
        refreshed: list[str] = []
        for wallet in wallets:
            portfolio_response = portfolio_repo.latest_snapshot(portfolio_address=wallet)
            risk_response = risk_repo.latest_assessment()
            if portfolio_response is None or risk_response is None:
                continue
            portfolio = internal_snapshot_from_response(portfolio_response)
            risk_snapshot = risk_assessment_to_snapshot(risk_response)
            try:
                decision, actions = compute_rebalance(
                    portfolio,
                    risk_snapshot,
                    settings.allocation_profile_name,
                    target_weights_override=settings.parsed_portfolio_target_weights,
                )
            except ValueError:
                continue
            response = AllocationDecisionResponse(
                status="degraded" if decision.recommended_action == "PAUSE" else "ok",
                status_code=decision.status_code,
                status_label=decision.status_code,
                status_reason=decision.reasoning,
                generated_at=utc_now(),
                decision=decision,
                rebalance_actions=actions,
            )
            allocation_repo.save_decision(response)
            refreshed.append(wallet)
        clear_all_caches()
        return {"wallets": refreshed, "count": len(refreshed)}

    return await _run_tracked_job("allocation_snapshot", work)


async def generate_ai_decisions(wallet_address: str | None = None) -> dict:
    async def work() -> dict:
        settings = get_settings()
        portfolio_repo = PortfolioSnapshotRepository()
        risk_repo = RiskAssessmentRepository()
        allocation_repo = AllocationDecisionRepository()
        decision_repo = DecisionRecommendationRepository()
        wallets = [wallet_address] if wallet_address else _known_wallet_addresses()
        refreshed: list[str] = []
        for wallet in wallets:
            portfolio_response = portfolio_repo.latest_snapshot(portfolio_address=wallet)
            risk_response = risk_repo.latest_assessment()
            allocation_response = allocation_repo.latest_decision(wallet)
            if portfolio_response is None or risk_response is None:
                continue
            portfolio = internal_snapshot_from_response(portfolio_response)
            risk_snapshot = risk_assessment_to_snapshot(risk_response)
            if allocation_response is None:
                try:
                    decision, actions = compute_rebalance(
                        portfolio,
                        risk_snapshot,
                        settings.allocation_profile_name,
                        target_weights_override=settings.parsed_portfolio_target_weights,
                    )
                except ValueError:
                    continue
            else:
                decision = allocation_response.decision
                actions = allocation_response.rebalance_actions
            response = await generate_recommendation_reasoning(portfolio, risk_snapshot, decision, actions)
            decision_repo.save_recommendation(response, wallet_address=wallet, scope_type="wallet")
            refreshed.append(wallet)
        clear_all_caches()
        return {"wallets": refreshed, "count": len(refreshed)}

    return await _run_tracked_job("ai_decision_snapshot", work)


def latest_system_mode() -> str:
    settings = get_settings()
    if settings.runtime_mode == RuntimeMode.LIVE:
        return "live"
    if settings.runtime_mode == RuntimeMode.SIMULATION:
        return "simulation_only"
    return "degraded"


def snapshot_freshness_payload(timestamps: list[datetime | None]) -> DashboardFreshnessPayload:
    normalized = [value for value in timestamps if value is not None]
    latest_updated_at = max(normalized) if normalized else None
    age_seconds = int((utc_now() - latest_updated_at).total_seconds()) if latest_updated_at else None
    status = "empty" if latest_updated_at is None else "fresh" if (age_seconds or 0) <= 60 else "stale"
    return DashboardFreshnessPayload(
        updated_at=latest_updated_at.isoformat() if latest_updated_at else None,
        age_seconds=age_seconds,
        status=status,
    )
