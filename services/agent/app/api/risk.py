from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Response

from services.agent.app.api.investment_scope import InvestmentScopeInput, build_scoped_risk_assessment
from services.agent.app.api.portfolio import current_portfolio
from services.agent.app.core.settings import get_settings
from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.schemas.risk import RiskAssessmentHistoryResponse, RiskAssessmentResponse
from services.agent.modules.market_data.balances import fetch_portfolio_snapshot
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.repositories.db.risk_repository import RiskAssessmentRepository
from services.agent.risk.scoring.score_engine import RiskScoreEngine
from services.agent.risk.engine import RiskEngine


logger = logging.getLogger("services.agent.risk.api")
router = APIRouter(prefix="/risk", tags=["risk"])


def _save_assessment_best_effort(assessment: RiskAssessmentResponse) -> None:
    try:
        RiskAssessmentRepository().save_assessment(assessment)
    except Exception as exc:
        logger.warning("Risk assessment persistence failed: %s", exc)


def _latest_market_context_best_effort() -> tuple[list | None, list | None]:
    try:
        repo = MarketDataRepository()
        return repo.latest_normalized_prices(), repo.latest_normalized_quotes()
    except Exception as exc:
        logger.warning("Risk market context lookup failed: %s", exc)
        return None, None


@router.get("/current", response_model=RiskAssessmentResponse)
async def current_risk(
    wallet_address: str | None = None,
    deposit_asset_symbol: str | None = None,
    deposit_amount: float | None = None,
    risk_profile: str | None = None,
    allocation_mode: str | None = None,
    allow_env_fallback: bool = False,
    force_refresh: bool = False,
) -> RiskAssessmentResponse:
    if deposit_asset_symbol and deposit_amount and risk_profile:
        assessment = build_scoped_risk_assessment(
            InvestmentScopeInput(
                wallet_address=wallet_address,
                deposit_asset_symbol=deposit_asset_symbol,
                deposit_amount=deposit_amount,
                risk_profile=risk_profile,
                allocation_mode=allocation_mode or "AI Suggested",
            )
        )
        _save_assessment_best_effort(assessment)
        return assessment
    if not force_refresh:
        try:
            latest = RiskAssessmentRepository().latest_assessment()
        except Exception as exc:
            logger.warning("Latest risk assessment lookup failed before cached return: %s", exc)
            latest = None
        if latest is not None:
            served_metadata = dict(latest.metadata)
            served_metadata.update({"served_from": "latest_assessment", "force_refresh": False})
            return latest.model_copy(update={"metadata": served_metadata})
    settings = get_settings()
    portfolio = await current_portfolio(wallet_address=wallet_address, allow_env_fallback=allow_env_fallback)
    prices, quotes = _latest_market_context_best_effort()
    quote_validation_status = (
        DataStatusCode.QUOTE_FRESH.value
        if quotes is not None and any(quote.amount_out is not None for quote in quotes)
        else DataStatusCode.DATA_MISSING.value
    )
    assessment = RiskEngine().evaluate(
        portfolio=portfolio,
        runtime_mode=settings.runtime_mode,
        target_chain=settings.target_chain.value,
        quote_validation_status=quote_validation_status,
        prices=prices,
        quotes=quotes,
    )
    _save_assessment_best_effort(assessment)
    return assessment


@router.get("/snapshot", response_model=dict, deprecated=True)
async def legacy_risk_snapshot(response: Response) -> dict:
    response.headers["Deprecation"] = "true"
    response.headers["Link"] = '</risk/current>; rel="successor-version"'
    portfolio = fetch_portfolio_snapshot(allow_env_fallback=True)
    risk = RiskScoreEngine().compute_risk_snapshot(portfolio)
    return {"risk": risk.model_dump(mode="json")}


@router.get("/assessments/latest", response_model=RiskAssessmentResponse)
def latest_risk_assessment() -> RiskAssessmentResponse:
    try:
        assessment = RiskAssessmentRepository().latest_assessment()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Risk assessment repository unavailable: {exc}") from exc
    if assessment is None:
        raise HTTPException(status_code=404, detail="No persisted risk assessments are available.")
    return assessment


@router.get("/assessments", response_model=RiskAssessmentHistoryResponse)
def risk_assessment_history(limit: int = 20) -> RiskAssessmentHistoryResponse:
    safe_limit = max(1, min(limit, 100))
    try:
        assessments = RiskAssessmentRepository().recent_assessments(limit=safe_limit)
    except Exception as exc:
        return RiskAssessmentHistoryResponse(
            status="degraded",
            status_code=DataStatusCode.DATA_MISSING.value,
            status_label=DataStatusCode.DATA_MISSING.value,
            status_reason=f"Risk assessment repository unavailable: {exc}",
            assessments=[],
        )
    status_code = DataStatusCode.DATA_FRESH.value if assessments else DataStatusCode.DATA_MISSING.value
    return RiskAssessmentHistoryResponse(
        status="ok" if assessments else "degraded",
        status_code=status_code,
        status_label=status_code,
        status_reason="Recent risk assessments loaded." if assessments else "No persisted risk assessments are available.",
        assessments=assessments,
    )
