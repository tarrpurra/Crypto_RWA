from __future__ import annotations

from fastapi import APIRouter

from services.agent.modules.strategy_policy.activation_service import StrategyActivationService
from services.agent.modules.strategy_policy.schemas import (
    StrategyActiveResponse,
    StrategyAuditListResponse,
    StrategyDraftResponse,
    StrategyPolicyDraftRequest,
    StrategySchedulerSettingsResponse,
    StrategySimulationResponse,
    StrategyTemplateListResponse,
    StrategyValidationResponse,
    StrategyVersionListResponse,
    StrategyRevertRequest,
    StrategySchedulerUpdateRequest,
)


router = APIRouter(prefix="/api/strategy", tags=["strategy"])


def get_service() -> StrategyActivationService:
    return StrategyActivationService()


@router.get("/templates", response_model=StrategyTemplateListResponse)
def list_templates() -> StrategyTemplateListResponse:
    return get_service().templates()


@router.post("/draft", response_model=StrategyDraftResponse)
def create_draft(request: StrategyPolicyDraftRequest) -> StrategyDraftResponse:
    return get_service().draft(request)


@router.post("/validate", response_model=StrategyValidationResponse)
def validate_strategy(request: StrategyPolicyDraftRequest) -> StrategyValidationResponse:
    return get_service().validate(request)


@router.post("/simulate", response_model=StrategySimulationResponse)
def simulate_strategy(request: StrategyPolicyDraftRequest) -> StrategySimulationResponse:
    return get_service().simulate(request)


@router.post("/activate", response_model=StrategyActiveResponse)
def activate_strategy(request: StrategyPolicyDraftRequest) -> StrategyActiveResponse:
    return get_service().activate(request)


@router.get("/active", response_model=StrategyActiveResponse)
def active_strategy(user_address: str | None = None) -> StrategyActiveResponse:
    return get_service().active_state(user_address=user_address)


@router.get("/versions", response_model=StrategyVersionListResponse)
def strategy_versions(user_address: str | None = None) -> StrategyVersionListResponse:
    return get_service().versions(user_address=user_address)


@router.post("/revert", response_model=StrategyActiveResponse)
def revert_strategy(request: StrategyRevertRequest) -> StrategyActiveResponse:
    return get_service().revert(request.version, actor=request.actor)


@router.post("/scheduler", response_model=StrategySchedulerSettingsResponse)
def update_scheduler(request: StrategySchedulerUpdateRequest) -> StrategySchedulerSettingsResponse:
    return get_service().update_scheduler(
        request.version,
        request.market_check_interval_seconds,
        request.quote_refresh_interval_seconds,
        request.risk_recompute_interval_seconds,
        request.execution_window_seconds,
        actor=request.actor,
    )


@router.get("/audit", response_model=StrategyAuditListResponse)
def audit_trail(version: str | None = None) -> StrategyAuditListResponse:
    return get_service().audit(version=version)
