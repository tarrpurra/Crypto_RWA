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

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/aixrwa"
    redis_url: str | None = None
    portfolio_wallet_address: str | None = None
    portfolio_base_currency: str = "USD"
    portfolio_target_weights: str = ""

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

    ondo_usdy_oracle_address: str | None = "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f"
    ondo_usdy_oracle_method_selector: str | None = None
    ondo_usdy_oracle_decimals: int = 18
    ondo_usdy_blocklist_address: str | None = "0xdBd7a7d8807f0C98c9A58f7732f2799c8587e5c6"

    pyth_mainnet_contract: str | None = "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729"
    pyth_sepolia_contract: str | None = None

    agni_mainnet_factory_address: str | None = "0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035"
    agni_mainnet_quoter_address: str | None = "0x9488C05a7b75a6FefdcAE4f11a33467bcBA60177"
    agni_mainnet_quoter_v2_address: str | None = "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb"
    agni_mainnet_swap_router_address: str | None = "0x319B69888b0d11cEC22caA5034e25FfFBDc88421"
    agni_sepolia_factory_address: str | None = "0xA9AcD50B042A72c33d05fDcC8ad209d3aD361762"
    agni_sepolia_quoter_address: str | None = "0xA82F8dC4704d3512b120de70480219761F24B6Eb"
    agni_sepolia_quoter_v2_address: str | None = "0x9Da17239a4170f50A5A2c11813BD0C601b5c9693"
    agni_sepolia_swap_router_address: str | None = "0xe38cfa32cCd918d94E2e20230dFaD1A4Fd8aEF16"

    merchant_moe_router_address: str | None = "0xeaEE7EE68874218c3558b40063c42B82D3E7232a"
    merchant_moe_lb_router_address: str | None = "0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a"
    merchant_moe_aggregator_router_address: str | None = "0x45A62B090DF48243F12A21897e7ed91863E2c86b"
    merchant_moe_factory_address: str | None = "0x5bef015ca9424a7c07b68490616a4c1f094bedec"
    merchant_moe_lb_factory_address: str | None = "0xa6630671775c4EA2743840F9A5016dCf2A104054"

    agni_fee_tiers: str = "100,500,3000,10000"

    usdy_mainnet_address: str | None = "0x5bE26527e817998A7206475496fDE1E68957c5A6"
    musd_mainnet_address: str | None = "0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3"
    meth_mainnet_address: str | None = "0xcDA86A272531e8640cD7F1a92c01839911B90bb0"
    meth_sepolia_address: str | None = None
    wmnt_mainnet_address: str | None = "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8"
    usdc_mainnet_address: str | None = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9"
    weth_mainnet_address: str | None = "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111"

    eth_usd_pyth_feed_id: str | None = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"
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
    def effective_agni_factory_address(self) -> str | None:
        if self.target_chain == TargetChain.MANTLE_MAINNET:
            return self.agni_mainnet_factory_address
        return self.agni_sepolia_factory_address

    @property
    def effective_agni_quoter_address(self) -> str | None:
        if self.target_chain == TargetChain.MANTLE_MAINNET:
            return self.agni_mainnet_quoter_address
        return self.agni_sepolia_quoter_address

    @property
    def effective_agni_quoter_v2_address(self) -> str | None:
        if self.target_chain == TargetChain.MANTLE_MAINNET:
            return self.agni_mainnet_quoter_v2_address
        return self.agni_sepolia_quoter_v2_address

    @property
    def effective_agni_swap_router_address(self) -> str | None:
        if self.target_chain == TargetChain.MANTLE_MAINNET:
            return self.agni_mainnet_swap_router_address
        return self.agni_sepolia_swap_router_address

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
    def parsed_agni_fee_tiers(self) -> list[int]:
        return [int(value.strip()) for value in self.agni_fee_tiers.split(",") if value.strip()]

    @property
    def parsed_portfolio_target_weights(self) -> dict[str, str]:
        weights: dict[str, str] = {}
        for item in self.portfolio_target_weights.split(","):
            if "=" not in item:
                continue
            asset_key, weight = item.split("=", 1)
            asset_key = asset_key.strip()
            weight = weight.strip()
            if asset_key and weight:
                weights[asset_key] = weight
        return weights

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
                "decimals": 18,
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
                "decimals": 18,
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
                "decimals": 18,
            },
            "USDC_MAINNET": {
                "asset_key": "USDC_MAINNET",
                "symbol": "USDC",
                "chain_id": self.mantle_mainnet_chain_id,
                "address": self.usdc_mainnet_address,
                "price_strategy": "route_helper",
                "primary_reference_source": "dex_quote_only",
                "dex_quote_required": True,
                "verified": bool(self.usdc_mainnet_address),
                "pyth_feed_id": None,
                "ratio_feed_id": None,
                "ondo_oracle_address": None,
                "decimals": 6,
            },
            "WMNT_MAINNET": {
                "asset_key": "WMNT_MAINNET",
                "symbol": "WMNT",
                "chain_id": self.mantle_mainnet_chain_id,
                "address": self.wmnt_mainnet_address,
                "price_strategy": "route_helper",
                "primary_reference_source": "dex_quote_only",
                "dex_quote_required": True,
                "verified": bool(self.wmnt_mainnet_address),
                "pyth_feed_id": None,
                "ratio_feed_id": None,
                "ondo_oracle_address": None,
                "decimals": 18,
            },
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
