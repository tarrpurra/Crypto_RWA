from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException, Response
from services.agent.app.api.investment_scope import InvestmentScopeInput, build_scoped_allocation_response
from services.agent.app.schemas.allocation import AllocationDecisionResponse, AllocationDecision, UpdateProfileRequest
# circular-safe: lazy import inside endpoint function
# from services.agent.modules.decisions import build_decision_context
from services.agent.strategies.allocation.rebalance import compute_rebalance
from services.agent.strategies.allocation import profiles
from services.agent.strategies.allocation.profiles import normalize_profile_name
from services.agent.repositories.db.models import AllocationDecisionRecord
from services.agent.repositories.db.session import create_session, init_db
from services.agent.modules.oracle.freshness import utc_now
from services.agent.app.core.settings import TargetChain, get_settings

logger = logging.getLogger("services.agent.allocation.api")
router = APIRouter(prefix="/allocation", tags=["allocation"])


def _save_allocation_decision(decision: AllocationDecision) -> None:
    try:
        init_db()
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
async def get_allocation_recommendation(
    wallet_address: str | None = None,
    deposit_asset_symbol: str | None = None,
    deposit_amount: float | None = None,
    risk_profile: str | None = None,
    allocation_mode: str | None = None,
) -> AllocationDecisionResponse:
    logger.info(
        "Allocation recommendation requested: wallet=%s deposit_asset=%s deposit_amount=%s risk_profile=%s allocation_mode=%s",
        wallet_address,
        deposit_asset_symbol,
        deposit_amount,
        risk_profile,
        allocation_mode,
    )
    if deposit_asset_symbol and deposit_amount and risk_profile:
        response = await build_scoped_allocation_response(
            InvestmentScopeInput(
                wallet_address=wallet_address,
                deposit_asset_symbol=deposit_asset_symbol,
                deposit_amount=deposit_amount,
                risk_profile=risk_profile,
                allocation_mode=allocation_mode or "AI Suggested",
            )
        )
        logger.info(
            "Allocation recommendation completed (scoped): status=%s status_code=%s recommended_action=%s actions=%d",
            response.status,
            response.status_code,
            response.decision.recommended_action,
            len(response.rebalance_actions),
        )
        return response
    try:
        from services.agent.modules.decisions import build_decision_context
        context = await build_decision_context(wallet_address=wallet_address)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    decision, actions = compute_rebalance(
        context.portfolio,
        context.risk_snapshot,
        context.profile_name,
        target_weights_override=context.target_weights,
    )
    _save_allocation_decision(decision)

    status = "ok"
    if decision.recommended_action == "PAUSE":
        status = "degraded"

    response = AllocationDecisionResponse(
        status=status,
        status_code=decision.status_code,
        status_label=decision.status_code,
        status_reason=decision.reasoning,
        generated_at=utc_now(),
        decision=decision,
        rebalance_actions=actions,
    )
    logger.info(
        "Allocation recommendation completed: status=%s status_code=%s recommended_action=%s actions=%d",
        response.status,
        response.status_code,
        response.decision.recommended_action,
        len(response.rebalance_actions),
    )
    return response


@router.post("/profile", response_model=dict[str, str], deprecated=True)
async def update_active_profile(request: UpdateProfileRequest, response: Response) -> dict[str, str]:
    response.headers["Deprecation"] = "true"
    response.headers["Link"] = '</allocation/recommendation>; rel="successor-version"'
    settings = get_settings()
    try:
        canonical_name = normalize_profile_name(request.profile_name)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid profile name: {request.profile_name}. Approved: {list(profiles.ALLOCATION_PROFILES.keys())}")

    if settings.target_chain == TargetChain.MANTLE_SEPOLIA:
        canonical_name = "Sepolia Test"

    profiles.ACTIVE_PROFILE_NAME = canonical_name
    return {"status": "ok", "message": f"Active allocation profile set to {canonical_name}"}
