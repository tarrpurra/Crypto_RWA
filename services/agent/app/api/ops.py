from __future__ import annotations

from fastapi import APIRouter

from services.agent.app.core.status_codes import SystemStatusCode
from services.agent.app.schemas.ops import OpsAlertsResponse, OpsHealthResponse, OpsReadinessResponse
from services.agent.modules.alerts.notifier import LogOnlyAlertNotifier
from services.agent.modules.alerts.thresholds import evaluate_ops_health
from services.agent.modules.oracle.freshness import utc_now


router = APIRouter(prefix="/ops", tags=["ops"])


@router.get("/health", response_model=OpsHealthResponse)
async def ops_health() -> OpsHealthResponse:
    response = evaluate_ops_health()
    LogOnlyAlertNotifier().publish(response.alerts)
    return response


@router.get("/alerts", response_model=OpsAlertsResponse)
async def ops_alerts() -> OpsAlertsResponse:
    health = evaluate_ops_health()
    status = "ok" if not health.alerts else "degraded"
    status_code = SystemStatusCode.SIMULATION_ONLY.value if not health.alerts else SystemStatusCode.DEGRADED.value
    return OpsAlertsResponse(
        status=status,
        status_code=status_code,
        status_label=status_code,
        status_reason="Operational alerts generated from current source-health thresholds.",
        generated_at=utc_now(),
        alerts=health.alerts,
    )


@router.get("/readiness", response_model=OpsReadinessResponse)
async def ops_readiness() -> OpsReadinessResponse:
    health = evaluate_ops_health()
    blockers = [alert.message for alert in health.alerts if alert.recommended_mode == "pause"]
    warnings = [alert.message for alert in health.alerts if alert.recommended_mode != "pause"]
    blockers.append("Phase 1B live market validation is still required before live readiness can be claimed.")
    ready_for_live = False
    status = "ok" if ready_for_live else "degraded"
    status_code = SystemStatusCode.LIVE.value if ready_for_live else SystemStatusCode.DEGRADED.value
    return OpsReadinessResponse(
        status=status,
        status_code=status_code,
        status_label=status_code,
        status_reason="Live readiness requires no pause blockers and no restricted operational mode." if ready_for_live else "Live readiness is blocked or restricted by current operational state.",
        generated_at=utc_now(),
        ready_for_live=ready_for_live,
        recommended_mode=health.recommended_mode,
        blockers=blockers,
        warnings=warnings,
        metadata={
            "runtime_mode": health.runtime_mode,
            "target_chain": health.target_chain,
            "phase_1b_validation_required": True,
        },
    )
