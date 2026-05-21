from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from services.agent.app.core.status_codes import RuntimeMode, TargetChain


SERVICE_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_CONTRACTS_ROOT = REPO_ROOT / "contracts"
DEFAULT_FOUNDRY_OUT_DIR = DEFAULT_CONTRACTS_ROOT / "out"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(SERVICE_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "AIxRWA Agent"
    app_env: str = "local"
    api_port: int = 8000
    runtime_mode: RuntimeMode = RuntimeMode.MONITOR_ONLY
    target_chain: TargetChain = TargetChain.MANTLE_SEPOLIA

    log_enabled: bool = True
    log_level: str = "INFO"
    log_market_data: str | None = None
    log_oracle: str | None = None
    log_quotes: str | None = None
    log_risk: str | None = "DEBUG"
    log_allocation: str | None = None
    log_ai: str | None = None
    log_proposals: str | None = "DEBUG"
    log_execution: str | None = "DEBUG"
    log_alerts: str | None = None
    log_db: str | None = "WARNING"

    mantle_mainnet_chain_id: int = 5000
    mantle_sepolia_chain_id: int = 5003
    mantle_mainnet_rpc_url: str = "https://rpc.mantle.xyz"
    mantle_sepolia_rpc_url: str = "https://rpc.sepolia.mantle.xyz"
    mantle_mainnet_quicknode_http_url: str | None = None
    mantle_mainnet_quicknode_wss_url: str | None = None
    mantle_sepolia_quicknode_http_url: str | None = None
    mantle_sepolia_quicknode_wss_url: str | None = None

    database_url: str = "postgresql://postgres:postgres@localhost:5432/aixrwa"
    redis_url: str | None = None

    pyth_hermes_url: str = "https://hermes.pyth.network"
    pyth_hermes_latest_price_path: str = "/v2/updates/price/latest"
    price_poll_interval_seconds: int = 60
    quote_poll_interval_seconds: int = 30
    route_cache_ttl_seconds: int = 60
    oracle_max_age_seconds_default: int = 300
    oracle_max_age_seconds_stable: int = 600
    oracle_max_age_seconds_volatile: int = 120

    contracts_root: Path = Field(default=DEFAULT_CONTRACTS_ROOT)
    foundry_out_dir: Path = Field(default=DEFAULT_FOUNDRY_OUT_DIR)

    pause_guardian_address: str | None = None
    trade_approval_manager_address: str | None = None
    executor_vault_address: str | None = None
    ondo_usdy_oracle_address: str | None = None
    pyth_mainnet_contract: str | None = None
    pyth_sepolia_contract: str | None = None
    agni_factory_address: str | None = None
    agni_quoter_address: str | None = None
    agni_quoter_v2_address: str | None = None
    agni_swap_router_address: str | None = None
    merchant_moe_router_address: str | None = None
    merchant_moe_lb_router_address: str | None = None
    merchant_moe_aggregator_router_address: str | None = None
    merchant_moe_factory_address: str | None = None
    merchant_moe_lb_factory_address: str | None = None

    usdy_mainnet_address: str | None = None
    meth_mainnet_address: str | None = None
    meth_sepolia_address: str | None = None
    wmnt_mainnet_address: str | None = None
    usdc_mainnet_address: str | None = None
    weth_mainnet_address: str | None = None

    eth_usd_pyth_feed_id: str | None = None
    usdy_pyth_feed_id: str | None = None
    meth_usd_pyth_feed_id: str | None = None
    meth_eth_ratio_feed_id: str | None = None

    pyth_eth_usd_fresh_limit_seconds: int = 120
    pyth_eth_usd_warn_seconds: int = 120
    pyth_eth_usd_hard_block_seconds: int = 300
    ondo_usdy_oracle_fresh_limit_seconds: int = 600
    ondo_usdy_oracle_warn_seconds: int = 300
    ondo_usdy_oracle_hard_block_seconds: int = 600
    dex_quote_fresh_limit_seconds: int = 30
    dex_quote_warn_seconds: int = 15
    dex_quote_hard_block_seconds: int = 30
    route_depth_fresh_limit_seconds: int = 60
    route_depth_warn_seconds: int = 60
    route_depth_hard_block_seconds: int = 120
    portfolio_balance_fresh_limit_seconds: int = 60
    portfolio_balance_warn_seconds: int = 60
    portfolio_balance_hard_block_seconds: int = 180
    risk_snapshot_fresh_limit_seconds: int = 60
    risk_snapshot_warn_seconds: int = 60
    risk_snapshot_hard_block_seconds: int = 120
    trade_approval_expiry_seconds: int = 120
    pending_transaction_manual_review_seconds: int = 180
    rpc_health_sample_fresh_limit_seconds: int = 60
    rpc_health_sample_warn_seconds: int = 60

    simulation_fallback_enabled: bool = True

    @property
    def effective_http_rpc_url(self) -> str:
        if self.target_chain == TargetChain.MANTLE_MAINNET:
            return self.mantle_mainnet_quicknode_http_url or self.mantle_mainnet_rpc_url
        return self.mantle_sepolia_quicknode_http_url or self.mantle_sepolia_rpc_url

    @property
    def effective_wss_rpc_url(self) -> str | None:
        if self.target_chain == TargetChain.MANTLE_MAINNET:
            return self.mantle_mainnet_quicknode_wss_url
        return self.mantle_sepolia_quicknode_wss_url

    @property
    def effective_chain_id(self) -> int:
        if self.target_chain == TargetChain.MANTLE_MAINNET:
            return self.mantle_mainnet_chain_id
        return self.mantle_sepolia_chain_id

    @property
    def subsystem_log_levels(self) -> dict[str, str]:
        return {
            "market_data": self.log_market_data or self.log_level,
            "oracle": self.log_oracle or self.log_level,
            "quotes": self.log_quotes or self.log_level,
            "risk": self.log_risk or self.log_level,
            "allocation": self.log_allocation or self.log_level,
            "ai": self.log_ai or self.log_level,
            "proposals": self.log_proposals or self.log_level,
            "execution": self.log_execution or self.log_level,
            "alerts": self.log_alerts or self.log_level,
            "db": self.log_db or self.log_level,
        }

    @property
    def asset_registry(self) -> dict[str, dict[str, object]]:
        return {
            "USDY": {
                "asset_key": "USDY",
                "symbol": "USDY",
                "chain_id": self.mantle_mainnet_chain_id,
                "address": self.usdy_mainnet_address,
                "price_strategy": "ondo_oracle_plus_dex",
                "primary_reference_source": "ondo_redemption_oracle",
                "dex_quote_required": True,
                "verified": bool(self.usdy_mainnet_address),
                "pyth_feed_id": self.usdy_pyth_feed_id,
                "ratio_feed_id": None,
                "ondo_oracle_address": self.ondo_usdy_oracle_address,
            },
            "METH_MAINNET": {
                "asset_key": "METH_MAINNET",
                "symbol": "mETH",
                "chain_id": self.mantle_mainnet_chain_id,
                "address": self.meth_mainnet_address,
                "price_strategy": "pyth_eth_usd_plus_dex_basis",
                "primary_reference_source": "pyth_eth_usd",
                "dex_quote_required": True,
                "verified": bool(self.meth_mainnet_address),
                "pyth_feed_id": self.meth_usd_pyth_feed_id,
                "ratio_feed_id": self.meth_eth_ratio_feed_id,
                "ondo_oracle_address": None,
            },
            "METH_SEPOLIA": {
                "asset_key": "METH_SEPOLIA",
                "symbol": "mETH",
                "chain_id": self.mantle_sepolia_chain_id,
                "address": self.meth_sepolia_address,
                "price_strategy": "pyth_eth_usd_plus_dex_basis",
                "primary_reference_source": "pyth_eth_usd",
                "dex_quote_required": True,
                "verified": bool(self.meth_sepolia_address),
                "pyth_feed_id": self.meth_usd_pyth_feed_id,
                "ratio_feed_id": self.meth_eth_ratio_feed_id,
                "ondo_oracle_address": None,
            },
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
