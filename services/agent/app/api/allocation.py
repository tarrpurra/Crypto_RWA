from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException
from services.agent.app.schemas.allocation import AllocationDecisionResponse, AllocationDecision, RebalanceAction, UpdateProfileRequest
from services.agent.modules.market_data.balances import fetch_portfolio_snapshot
from services.agent.risk.scoring.score_engine import RiskScoreEngine
from services.agent.strategies.allocation.rebalance import compute_rebalance
from services.agent.strategies.allocation import profiles
from services.agent.repositories.db.models import AllocationDecisionRecord
from services.agent.repositories.db.session import create_session
from services.agent.modules.oracle.freshness import utc_now

logger = logging.getLogger("services.agent.allocation.api")
router = APIRouter(prefix="/allocation", tags=["allocation"])


def _save_allocation_decision(decision: AllocationDecision) -> None:
    try:
        record = AllocationDecisionRecord(
            decision_id=decision.decision_id,
            wallet_or_vault=decision.wallet_or_vault,
            profile_name=decision.profile_name,
            current_weights_json=decision.current_weights,
            target_weights_json=decision.target_weights,
            recommended_action=decision.recommended_action,
            confidence=decision.confidence,
            reasoning=decision.reasoning,
            risk_snapshot_id=decision.risk_snapshot_id,
            status_code=decision.status_code,
            created_at=decision.created_at,
        )
        with create_session() as session:
            session.merge(record)
            session.commit()
    except Exception as exc:
        logger.warning("Failed to persist allocation decision: %s", exc)


@router.get("/recommendation", response_model=AllocationDecisionResponse)
async def get_allocation_recommendation() -> AllocationDecisionResponse:
    portfolio = fetch_portfolio_snapshot()
    risk_engine = RiskScoreEngine()
    risk = risk_engine.compute_risk_snapshot(portfolio)
    
    decision, actions = compute_rebalance(portfolio, risk, profiles.ACTIVE_PROFILE_NAME)
    _save_allocation_decision(decision)

    status = "ok"
    if decision.recommended_action == "PAUSE":
        status = "degraded"

    return AllocationDecisionResponse(
        status=status,
        status_code=decision.status_code,
        status_label=decision.status_code,
        status_reason=decision.reasoning,
        generated_at=utc_now(),
        decision=decision,
        rebalance_actions=actions,
    )


@router.post("/profile", response_model=dict[str, str])
async def update_active_profile(request: UpdateProfileRequest) -> dict[str, str]:
    if request.profile_name not in profiles.ALLOCATION_PROFILES:
        raise HTTPException(status_code=400, detail=f"Invalid profile name: {request.profile_name}. Approved: {list(profiles.ALLOCATION_PROFILES.keys())}")
    
    profiles.ACTIVE_PROFILE_NAME = request.profile_name
    return {"status": "ok", "message": f"Active allocation profile set to {request.profile_name}"}
