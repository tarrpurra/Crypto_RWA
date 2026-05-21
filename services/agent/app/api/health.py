from __future__ import annotations

from fastapi import APIRouter

from services.agent.app.core.settings import get_settings
from services.agent.app.core.status_codes import RuntimeMode, SystemStatusCode
from services.agent.app.schemas.common import FreshnessThreshold
from services.agent.app.schemas.health import HealthResponse, ServiceStatusResponse
from services.agent.modules.contracts.project_contracts import PROJECT_CONTRACTS


router = APIRouter(tags=["health"])


def _configured_contracts() -> dict[str, str | None]:
    settings = get_settings()
    return {
        contract_key: getattr(settings, spec.settings_field)
        for contract_key, spec in PROJECT_CONTRACTS.items()
    }


def _system_status(settings) -> tuple[str, str, str]:
    if settings.runtime_mode == RuntimeMode.LIVE:
        return "ok", SystemStatusCode.LIVE.value, "Live mode active"
    if settings.runtime_mode == RuntimeMode.SIMULATION:
        return "ok", SystemStatusCode.SIMULATION_ONLY.value, "Simulation mode active"
    return "ok", SystemStatusCode.DEGRADED.value, "Monitor-only mode active"


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    settings = get_settings()
    status, status_code, status_reason = _system_status(settings)
    return HealthResponse(
        status=status,
        status_code=status_code,
        status_label=status_code,
        status_reason=status_reason,
        environment=settings.app_env,
        service=settings.app_name,
        runtime_mode=settings.runtime_mode.value,
        target_chain=settings.target_chain.value,
    )


@router.get("/status", response_model=ServiceStatusResponse)
async def service_status() -> ServiceStatusResponse:
    settings = get_settings()
    status, status_code, status_reason = _system_status(settings)
    return ServiceStatusResponse(
        status=status,
        status_code=status_code,
        status_label=status_code,
        status_reason=status_reason,
        environment=settings.app_env,
        service=settings.app_name,
        runtime_mode=settings.runtime_mode.value,
        target_chain=settings.target_chain.value,
        chain_id=settings.effective_chain_id,
        rpc_url=settings.effective_http_rpc_url,
        websocket_enabled=bool(settings.effective_wss_rpc_url),
        configured_contracts=_configured_contracts(),
        database_url_configured=bool(settings.database_url),
        logging_enabled=settings.log_enabled,
        log_level=settings.log_level,
        subsystem_log_levels=settings.subsystem_log_levels,
        freshness_thresholds={
            "pyth_eth_usd": FreshnessThreshold(
                fresh_limit_seconds=settings.pyth_eth_usd_fresh_limit_seconds,
                warn_after_seconds=settings.pyth_eth_usd_warn_seconds,
                hard_block_after_seconds=settings.pyth_eth_usd_hard_block_seconds,
            ),
            "ondo_usdy_oracle": FreshnessThreshold(
                fresh_limit_seconds=settings.ondo_usdy_oracle_fresh_limit_seconds,
                warn_after_seconds=settings.ondo_usdy_oracle_warn_seconds,
                hard_block_after_seconds=settings.ondo_usdy_oracle_hard_block_seconds,
            ),
            "dex_quote": FreshnessThreshold(
                fresh_limit_seconds=settings.dex_quote_fresh_limit_seconds,
                warn_after_seconds=settings.dex_quote_warn_seconds,
                hard_block_after_seconds=settings.dex_quote_hard_block_seconds,
            ),
            "route_depth": FreshnessThreshold(
                fresh_limit_seconds=settings.route_depth_fresh_limit_seconds,
                warn_after_seconds=settings.route_depth_warn_seconds,
                hard_block_after_seconds=settings.route_depth_hard_block_seconds,
            ),
            "portfolio_balance": FreshnessThreshold(
                fresh_limit_seconds=settings.portfolio_balance_fresh_limit_seconds,
                warn_after_seconds=settings.portfolio_balance_warn_seconds,
                hard_block_after_seconds=settings.portfolio_balance_hard_block_seconds,
            ),
            "risk_snapshot": FreshnessThreshold(
                fresh_limit_seconds=settings.risk_snapshot_fresh_limit_seconds,
                warn_after_seconds=settings.risk_snapshot_warn_seconds,
                hard_block_after_seconds=settings.risk_snapshot_hard_block_seconds,
            ),
            "trade_approval": FreshnessThreshold(
                fresh_limit_seconds=settings.trade_approval_expiry_seconds,
                warn_after_seconds=settings.trade_approval_expiry_seconds,
                hard_block_after_seconds=settings.trade_approval_expiry_seconds,
            ),
            "rpc_health": FreshnessThreshold(
                fresh_limit_seconds=settings.rpc_health_sample_fresh_limit_seconds,
                warn_after_seconds=settings.rpc_health_sample_warn_seconds,
                hard_block_after_seconds=None,
            ),
        },
        simulation_fallback_enabled=settings.simulation_fallback_enabled,
    )
