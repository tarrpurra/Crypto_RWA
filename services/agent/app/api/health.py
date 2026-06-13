from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter
from web3 import HTTPProvider, Web3

from services.agent.app.core import runtime_config
from services.agent.app.core.settings import get_settings
from services.agent.app.core.status_codes import RuntimeMode, SystemStatusCode
from services.agent.app.schemas.common import FreshnessThreshold
from services.agent.app.schemas.health import (
    ExecutionReadiness,
    HealthResponse,
    ServiceStatusResponse,
    SystemReadinessResponse,
    TokenReadiness,
)
from services.agent.app.schemas.market_data import AssetMetadata
from services.agent.app.schemas.oracle import HermesConnectivityProbe
from services.agent.modules.contracts.project_contracts import PROJECT_CONTRACTS
from services.agent.modules.quotes.agni_discovery import AgniDiscoveryService
from services.agent.modules.quotes.agni_quotes import AgniQuoteService
from services.agent.modules.oracle import HermesClient


router = APIRouter(tags=["health"])

ERC20_METADATA_ABI = [
    {
        "inputs": [],
        "name": "symbol",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function",
    },
]


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


def _default_amount_in(symbol: str) -> Decimal:
    if symbol.upper() == "USDY":
        return Decimal("1000")
    if symbol.upper() in {"WMNT", "MNT"}:
        return Decimal("10")
    return Decimal("1")


def _token_readiness(web3: Web3, address: str | None, expected_symbol: str, *, test_token: bool | None = None) -> TokenReadiness:
    if not address:
        return TokenReadiness(address=None, code_exists=False, symbol_ok=False, test_token=test_token)

    try:
        checksum = web3.to_checksum_address(address)
        code_exists = web3.eth.get_code(checksum).hex() != "0x"
    except Exception:
        return TokenReadiness(address=address, code_exists=False, symbol_ok=False, test_token=test_token)

    if not code_exists:
        return TokenReadiness(address=address, code_exists=False, symbol_ok=False, test_token=test_token)

    contract = web3.eth.contract(address=checksum, abi=ERC20_METADATA_ABI)
    try:
        symbol = contract.functions.symbol().call()
    except Exception:
        symbol = None
    try:
        decimals = int(contract.functions.decimals().call())
    except Exception:
        decimals = None

    symbol_ok = symbol == expected_symbol
    return TokenReadiness(
        address=address,
        code_exists=code_exists,
        symbol=symbol,
        symbol_ok=symbol_ok,
        decimals=decimals,
        deposit_supported=symbol_ok if expected_symbol == "WMNT" else None,
        test_token=test_token,
    )


def _agni_route_status(settings, token_in: AssetMetadata, token_out: AssetMetadata) -> str:
    discovery = AgniDiscoveryService(settings)
    quote_service = AgniQuoteService(settings)
    routes = discovery.discover_exact_input_single_routes(token_in, token_out)
    if not routes:
        return "no_route"

    amount_in = _default_amount_in(token_in.symbol)
    for route in routes:
        attempt = quote_service.quote_route(route, amount_in)
        if attempt.normalized_snapshot.amount_out is not None:
            return "ok"
    return "quote_failed"


def _readiness_routes(settings) -> dict[str, str]:
    if settings.target_chain.value != "mantle_sepolia":
        return {}

    wmnt = AssetMetadata(**settings.asset_registry["SEPOLIA_WMNT"])
    usdy = AssetMetadata(**settings.asset_registry["SEPOLIA_USDY"])
    meth = AssetMetadata(**settings.asset_registry["SEPOLIA_METH"])
    return {
        "WMNT_USDY": _agni_route_status(settings, wmnt, usdy),
        "USDY_METH": _agni_route_status(settings, usdy, meth),
        "WMNT_METH": _agni_route_status(settings, wmnt, meth),
    }


def _pricing_modes(settings) -> dict[str, str]:
    if settings.ondo_usdy_reference_rpc_url and settings.ondo_usdy_oracle_method_selector:
        usdy_mode = "mainnet_oracle_reference"
    elif settings.usdy_pyth_feed_id:
        usdy_mode = "pyth_direct"
    else:
        usdy_mode = "simulation"

    if settings.target_chain.value == "mantle_sepolia" and settings.sepolia_meth_is_test_token:
        meth_mode = settings.effective_sepolia_meth_price_mode
    elif settings.meth_usd_pyth_feed_id:
        meth_mode = "pyth_direct"
    elif settings.meth_eth_ratio_feed_id:
        meth_mode = "pyth_ratio"
    else:
        meth_mode = "pyth_eth_usd_proxy"

    return {
        "USDY": usdy_mode,
        "mETH": meth_mode,
        "ETH": "pyth",
    }


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
        ai_decision_maker_enabled=runtime_config.get_ai_decision_maker_enabled(),
    )


@router.get("/system/readiness", response_model=SystemReadinessResponse)
async def system_readiness() -> SystemReadinessResponse:
    settings = get_settings()
    web3 = Web3(HTTPProvider(settings.effective_http_rpc_url))

    tokens = {
        "USDY": _token_readiness(web3, settings.sepolia_usdy_address, "USDY"),
        "WMNT": _token_readiness(web3, settings.sepolia_wmnt_address, "WMNT"),
        "mETH": _token_readiness(
            web3,
            settings.effective_sepolia_meth_address,
            "mETH",
            test_token=settings.sepolia_meth_is_test_token,
        ),
    }

    return SystemReadinessResponse(
        chain_id=settings.effective_chain_id,
        native_mnt_enabled=settings.native_mnt_enabled,
        tokens=tokens,
        pricing=_pricing_modes(settings),
        routes=_readiness_routes(settings),
        execution=ExecutionReadiness(
            mode="wallet_direct",
            guarded_executor_enabled=False,
        ),
    )


@router.get("/hermes/probe", response_model=HermesConnectivityProbe)
async def hermes_probe() -> HermesConnectivityProbe:
    settings = get_settings()
    client = HermesClient(
        base_url=settings.pyth_hermes_url,
        latest_price_path=settings.pyth_hermes_latest_price_path,
    )
    return await client.probe_connectivity()
