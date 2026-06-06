from __future__ import annotations

from pydantic import BaseModel

from services.agent.app.schemas.common import FreshnessThreshold


class HealthResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    environment: str
    service: str
    runtime_mode: str
    target_chain: str


class ServiceStatusResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    environment: str
    service: str
    runtime_mode: str
    target_chain: str
    chain_id: int
    rpc_url: str
    websocket_enabled: bool
    configured_contracts: dict[str, str | None]
    database_url_configured: bool
    logging_enabled: bool
    log_level: str
    subsystem_log_levels: dict[str, str]
    freshness_thresholds: dict[str, FreshnessThreshold]
    simulation_fallback_enabled: bool
    ai_decision_maker_enabled: bool


class TokenReadiness(BaseModel):
    address: str | None
    code_exists: bool
    symbol: str | None = None
    symbol_ok: bool
    decimals: int | None = None
    deposit_supported: bool | None = None
    test_token: bool | None = None


class ExecutionReadiness(BaseModel):
    mode: str
    guarded_executor_enabled: bool


class SystemReadinessResponse(BaseModel):
    chain_id: int
    native_mnt_enabled: bool
    tokens: dict[str, TokenReadiness]
    pricing: dict[str, str]
    routes: dict[str, str]
    execution: ExecutionReadiness
