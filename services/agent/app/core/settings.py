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
    cors_allowed_origins: str = "http://localhost:8080,http://localhost:5173"
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
    allocation_profile_name: str = "Balanced"
    sepolia_mock_prices_enabled: bool = False
    sepolia_mock_routes_enabled: bool = False
    sepolia_mock_token_a_address: str | None = None
    sepolia_mock_token_b_address: str | None = None
    sepolia_mock_token_a_price_usd: str = "1"
    sepolia_mock_token_b_price_usd: str = "1"
    sepolia_meth_address: str | None = None
    sepolia_meth_is_test_token: bool = False
    sepolia_meth_price_mode: str = "eth_proxy"
    sepolia_usdy_address: str | None = None
    sepolia_usdy_reference_price_usd: str | None = None
    sepolia_wmnt_address: str | None = None
    native_mnt_enabled: bool = False
    require_live_prices: bool = False
    meth_manual_price_usd: str | None = None

    pyth_hermes_url: str = "https://hermes.pyth.network"
    pyth_hermes_latest_price_path: str = "/v2/updates/price/latest"
    pyth_hermes_connect_timeout_seconds: float = 15.0
    pyth_hermes_read_timeout_seconds: float = 30.0
    price_poll_interval_seconds: int = 7200
    quote_poll_interval_seconds: int = 7200
    route_cache_ttl_seconds: int = 7200
    oracle_max_age_seconds_default: int = 300
    oracle_max_age_seconds_stable: int = 600
    oracle_max_age_seconds_volatile: int = 120

    contracts_root: Path = Field(default=DEFAULT_CONTRACTS_ROOT)
    foundry_out_dir: Path = Field(default=DEFAULT_FOUNDRY_OUT_DIR)

    pause_guardian_address: str | None = None
    trade_approval_manager_address: str | None = None
    executor_vault_address: str | None = None
    executor_private_key: str | None = None

    ondo_usdy_oracle_address: str | None = "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f"
    ondo_usdy_oracle_method_selector: str | None = None
    ondo_usdy_oracle_decimals: int = 18
    ondo_usdy_reference_rpc_url: str | None = None
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
    aiyield_sepolia_swap_router_address: str | None = None

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
    weth_mainnet_address: str | None = "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111"

    eth_usd_pyth_feed_id: str | None = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"
    usdy_pyth_feed_id: str | None = "0xe393449f6aff8a4b6d3e1165a7c9ebec103685f3b41e60db4277b5b6d10e7326"
    meth_usd_pyth_feed_id: str | None = "0xfbc9c3a716650b6e24ab22ab85b1c0ef4141b18f4590cc0b986e2f9064cf73d6"
    meth_eth_ratio_feed_id: str | None = "0xee279eeb2fec830e3f535ad4d6524eb35eb1c6890cb1afc0b64554d08c88727e"
    mnt_pyth_feed_id: str | None = "0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585"

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
    execution_receipt_timeout_seconds: int = 120
    execution_receipt_poll_latency_seconds: float = 2.0
    rpc_health_sample_fresh_limit_seconds: int = 60
    rpc_health_sample_warn_seconds: int = 60

    simulation_fallback_enabled: bool = True
    ai_reasoning_enabled: bool = True
    ai_decision_maker_enabled: bool = False
    ai_reasoning_provider: str = "gemini"
    ai_reasoning_model: str = "gemini-2.0-flash"
    gemini_api_key: str | None = None
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_model: str = "gemini-2.0-flash"
    gemini_timeout_seconds: float = 60.0
    ollama_model: str = "qwen2.5:3b"
    ollama_url: str = "http://host.docker.internal:11434"

    rebalance_drift_tolerance: float = 0.03
    rebalance_cooldown_seconds: int = 1500
    rebalance_min_benefit_usd: float = 30.0

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
    def effective_aiyield_swap_router_address(self) -> str | None:
        if self.target_chain == TargetChain.MANTLE_MAINNET:
            return None
        return self.aiyield_sepolia_swap_router_address

    @property
    def normalized_ai_reasoning_provider(self) -> str:
        return self.ai_reasoning_provider.strip().lower()

    @property
    def effective_ai_reasoning_model(self) -> str:
        if self.normalized_ai_reasoning_provider == "gemini":
            return self.gemini_model or self.ai_reasoning_model
        if self.normalized_ai_reasoning_provider == "ollama":
            return self.ollama_model or self.ai_reasoning_model
        return self.ai_reasoning_model

    @property
    def ai_reasoning_model_label(self) -> str:
        return f"{self.normalized_ai_reasoning_provider}:{self.effective_ai_reasoning_model}"

    @property
    def effective_ai_reasoning_base_url(self) -> str:
        if self.normalized_ai_reasoning_provider == "gemini":
            return self.gemini_base_url.rstrip("/")
        return self.ollama_url.rstrip("/")

    @property
    def effective_ai_reasoning_api_key(self) -> str | None:
        if self.normalized_ai_reasoning_provider == "gemini":
            return self.gemini_api_key
        return None

    @property
    def effective_ai_reasoning_timeout_seconds(self) -> float:
        if self.normalized_ai_reasoning_provider == "gemini":
            return self.gemini_timeout_seconds
        return 120.0

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
    def effective_sepolia_meth_address(self) -> str | None:
        return self.sepolia_meth_address or self.meth_sepolia_address

    @property
    def effective_sepolia_meth_price_mode(self) -> str:
        return self.sepolia_meth_price_mode.strip().lower()

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
            "SEPOLIA_METH": {
                "asset_key": "SEPOLIA_METH",
                "symbol": "mETH",
                "chain_id": self.mantle_sepolia_chain_id,
                "address": self.effective_sepolia_meth_address,
                "price_strategy": "pyth_eth_usd_plus_dex_basis",
                "primary_reference_source": "pyth_eth_usd",
                "dex_quote_required": True,
                "verified": bool(self.effective_sepolia_meth_address),
                "pyth_feed_id": self.meth_usd_pyth_feed_id,
                "ratio_feed_id": self.meth_eth_ratio_feed_id,
                "ondo_oracle_address": None,
                "decimals": 18,
            },
            "SEPOLIA_USDY": {
                "asset_key": "SEPOLIA_USDY",
                "symbol": "USDY",
                "chain_id": self.mantle_sepolia_chain_id,
                "address": self.sepolia_usdy_address,
                "price_strategy": "ondo_oracle_plus_dex",
                "primary_reference_source": "ondo_redemption_oracle",
                "dex_quote_required": True,
                "verified": bool(self.sepolia_usdy_address),
                "pyth_feed_id": self.usdy_pyth_feed_id,
                "ratio_feed_id": None,
                "ondo_oracle_address": self.ondo_usdy_oracle_address,
                "decimals": 18,
            },
            "SEPOLIA_WMNT": {
                "asset_key": "SEPOLIA_WMNT",
                "symbol": "WMNT",
                "chain_id": self.mantle_sepolia_chain_id,
                "address": self.sepolia_wmnt_address,
                "price_strategy": "route_helper",
                "primary_reference_source": "pyth_direct",
                "dex_quote_required": True,
                "verified": bool(self.sepolia_wmnt_address),
                "pyth_feed_id": self.mnt_pyth_feed_id,
                "ratio_feed_id": None,
                "ondo_oracle_address": None,
                "decimals": 18,
            },
            "MOCK_TOKEN_A": {
                "asset_key": "MOCK_TOKEN_A",
                "symbol": "MockTokenA",
                "chain_id": self.mantle_sepolia_chain_id,
                "address": self.sepolia_mock_token_a_address,
                "price_strategy": "sepolia_mock_fixed",
                "primary_reference_source": "sepolia_validation_asset",
                "dex_quote_required": True,
                "verified": bool(self.sepolia_mock_token_a_address),
                "pyth_feed_id": None,
                "ratio_feed_id": None,
                "ondo_oracle_address": None,
                "decimals": 18,
            },
            "MOCK_TOKEN_B": {
                "asset_key": "MOCK_TOKEN_B",
                "symbol": "MockTokenB",
                "chain_id": self.mantle_sepolia_chain_id,
                "address": self.sepolia_mock_token_b_address,
                "price_strategy": "sepolia_mock_fixed",
                "primary_reference_source": "sepolia_validation_asset",
                "dex_quote_required": True,
                "verified": bool(self.sepolia_mock_token_b_address),
                "pyth_feed_id": None,
                "ratio_feed_id": None,
                "ondo_oracle_address": None,
                "decimals": 18,
            },
            "WMNT_MAINNET": {
                "asset_key": "WMNT_MAINNET",
                "symbol": "WMNT",
                "chain_id": self.mantle_mainnet_chain_id,
                "address": self.wmnt_mainnet_address,
                "price_strategy": "route_helper",
                "primary_reference_source": "pyth_direct",
                "dex_quote_required": True,
                "verified": bool(self.wmnt_mainnet_address),
                "pyth_feed_id": self.mnt_pyth_feed_id,
                "ratio_feed_id": None,
                "ondo_oracle_address": None,
                "decimals": 18,
            },
        }

    @property
    def active_portfolio_asset_registry(self) -> dict[str, dict[str, object]]:
        active_assets: dict[str, dict[str, object]] = {}
        for asset_key, asset in self.asset_registry.items():
            if int(asset["chain_id"]) != self.effective_chain_id:
                continue
            if asset.get("price_strategy") == "route_helper" and asset.get("symbol") != "WMNT":
                continue
            if asset.get("price_strategy") == "sepolia_mock_fixed" and not self.sepolia_mock_prices_enabled:
                continue
            active_assets[asset_key] = asset
        return active_assets


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
