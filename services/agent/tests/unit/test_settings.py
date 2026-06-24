import asyncio
import unittest
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock, MagicMock, patch

from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import RuntimeMode, TargetChain
from services.agent.app.schemas.market_data import AssetMetadata, NormalizedPriceSnapshot
from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot
from services.agent.modules.market_data.prices import PriceService


class SettingsTests(unittest.TestCase):
    def test_settings_choose_sepolia_quicknode_by_default(self) -> None:
        settings = Settings(
            mantle_sepolia_quicknode_http_url="https://example-sepolia",
            target_chain=TargetChain.MANTLE_SEPOLIA,
        )

        self.assertEqual(settings.effective_http_rpc_url, "https://example-sepolia")
        self.assertEqual(settings.effective_chain_id, 5003)

    def test_settings_choose_mainnet_rpc_when_targeted(self) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_MAINNET,
            mantle_mainnet_rpc_url="https://example-mainnet",
            mantle_mainnet_quicknode_http_url=None,
        )

        self.assertEqual(settings.effective_http_rpc_url, "https://example-mainnet")
        self.assertEqual(settings.effective_chain_id, 5000)

    def test_runtime_mode_defaults_to_monitor_only(self) -> None:
        settings = Settings(_env_file=None)

        self.assertEqual(settings.runtime_mode, RuntimeMode.MONITOR_ONLY)

    def test_service_env_file_overrides_repo_root_env_file(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root_env = Path(tmpdir) / ".env"
            service_env = Path(tmpdir) / "services" / "agent" / ".env"
            service_env.parent.mkdir(parents=True, exist_ok=True)
            root_env.write_text("APP_ENV=root\nRUNTIME_MODE=live\n", encoding="utf-8")
            service_env.write_text("APP_ENV=service\n", encoding="utf-8")

            settings = Settings(_env_file=(str(root_env), str(service_env)))

            self.assertEqual(settings.app_env, "service")
            self.assertEqual(settings.runtime_mode, RuntimeMode.LIVE)

    def test_allocation_profile_defaults_to_balanced(self) -> None:
        settings = Settings(_env_file=None)

        self.assertEqual(settings.allocation_profile_name, "Balanced")

    def test_subsystem_log_levels_fall_back_to_global_level(self) -> None:
        settings = Settings(log_level="WARNING", log_quotes=None)

        self.assertEqual(settings.subsystem_log_levels["quotes"], "WARNING")

    def test_parsed_cors_allowed_origins_trims_and_filters_entries(self) -> None:
        settings = Settings(cors_allowed_origins=" https://frontend.up.railway.app, http://localhost:8080 , ,")

        self.assertEqual(
            settings.parsed_cors_allowed_origins,
            ["https://frontend.up.railway.app", "http://localhost:8080"],
        )

    def test_parsed_cors_allowed_origins_preserves_wildcard(self) -> None:
        settings = Settings(cors_allowed_origins="*, https://frontend.up.railway.app")

        self.assertEqual(settings.parsed_cors_allowed_origins, ["*"])

    def test_effective_sepolia_meth_address_prefers_new_field(self) -> None:
        settings = Settings(
            sepolia_meth_address="0xnew",
            meth_sepolia_address="0xold",
        )

        self.assertEqual(settings.effective_sepolia_meth_address, "0xnew")

    def test_effective_sepolia_meth_address_falls_back_to_legacy_field(self) -> None:
        settings = Settings(
            sepolia_meth_address=None,
            meth_sepolia_address="0xold",
        )

        self.assertEqual(settings.effective_sepolia_meth_address, "0xold")

    def test_sepolia_price_assets_do_not_duplicate_meth(self) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_meth_address="0x0000000000000000000000000000000000000001",
            sepolia_usdy_address="0x0000000000000000000000000000000000000002",
        )

        assets = PriceService(settings).asset_metadata_for_target_chain()
        self.assertEqual([asset.asset_key for asset in assets if asset.symbol == "mETH"], ["SEPOLIA_METH"])

    def test_active_portfolio_assets_exclude_mock_tokens_when_disabled(self) -> None:
        settings = Settings(
            _env_file=None,
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_meth_address="0x0000000000000000000000000000000000000001",
            sepolia_usdy_address="0x0000000000000000000000000000000000000002",
            sepolia_wmnt_address="0x0000000000000000000000000000000000000005",
            sepolia_mock_prices_enabled=False,
            sepolia_mock_token_a_address="0x0000000000000000000000000000000000000003",
            sepolia_mock_token_b_address="0x0000000000000000000000000000000000000004",
        )

        self.assertEqual(
            set(settings.active_portfolio_asset_registry.keys()),
            {"SEPOLIA_METH", "SEPOLIA_USDY", "SEPOLIA_WMNT"},
        )

    def test_active_portfolio_assets_include_wmnt_when_configured(self) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_wmnt_address="0x0000000000000000000000000000000000000005",
        )

        self.assertIn("SEPOLIA_WMNT", settings.active_portfolio_asset_registry)

    def test_sepolia_wmnt_ingestion_prefers_mnt_feed_when_configured(self) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_wmnt_address="0x0000000000000000000000000000000000000005",
        )

        statuses = PriceService(settings).ingestion_status()
        wmnt_status = next(status for status in statuses if status.asset_key == "SEPOLIA_WMNT")

        self.assertEqual(wmnt_status.status, "ok")
        self.assertEqual(wmnt_status.status_code, "DATA_FRESH")
        self.assertEqual(wmnt_status.required_sources[0], "pyth_direct")

    def test_sepolia_usdy_ingestion_prefers_direct_feed_when_configured(self) -> None:
        settings = Settings(
            _env_file=None,
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_usdy_address="0x0000000000000000000000000000000000000002",
            usdy_pyth_feed_id="0xe393449f6aff8a4b6d3e1165a7c9ebec103685f3b41e60db4277b5b6d10e7326",
        )

        statuses = PriceService(settings).ingestion_status()
        usdy_status = next(status for status in statuses if status.asset_key == "SEPOLIA_USDY")

        self.assertEqual(usdy_status.status, "ok")
        self.assertEqual(usdy_status.status_code, "DATA_FRESH")
        self.assertEqual(usdy_status.required_sources[0], "pyth_direct")

    def test_sepolia_meth_manual_mirror_ingestion_marks_simulation_only(self) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_meth_address="0x0000000000000000000000000000000000000001",
            sepolia_meth_is_test_token=True,
            sepolia_meth_price_mode="manual_mirror",
            meth_manual_price_usd="3500",
        )

        statuses = PriceService(settings).ingestion_status()
        meth_status = next(status for status in statuses if status.asset_key == "SEPOLIA_METH")

        self.assertEqual(meth_status.status, "simulation_only")
        self.assertEqual(meth_status.status_code, "DATA_PARTIAL")
        self.assertEqual(meth_status.required_sources[0], "manual_mirror")

    @patch("services.agent.modules.quotes.service.QuoteService.best_quote_for_pair")
    def test_wmnt_uses_quote_derived_price_when_mnt_feed_is_unavailable(self, best_quote_for_pair) -> None:
        settings = Settings(
            _env_file=None,
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_usdy_address="0x0000000000000000000000000000000000000002",
            sepolia_wmnt_address="0x0000000000000000000000000000000000000005",
            sepolia_meth_address=None,
            mnt_pyth_feed_id="TODO_MNT_FEED",
            usdy_pyth_feed_id=None,
        )
        best_quote_for_pair.return_value = NormalizedQuoteSnapshot(
            snapshot_id="quote-1",
            protocol="AIYIELD",
            route_id="aiyield:WMNT:USDY",
            route_label="test_swap_router",
            chain_id=5003,
            token_in_symbol="WMNT",
            token_out_symbol="USDY",
            amount_in="1",
            amount_out="0.55392783",
            quoted_price="0.55392783",
            estimated_slippage_bps="0",
            route_depth_usd=None,
            candidate_rank=1,
            sample_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
            freshness_status="fresh",
            status_code="QUOTE_FRESH",
            status_reason="fresh",
            data_sources_used=["test_quote"],
        )

        hermes_client = MagicMock()
        hermes_client.fetch_latest_price_updates = AsyncMock(return_value=None)
        bundle = asyncio.run(PriceService(settings, hermes_client=hermes_client).fetch_latest_prices())

        wmnt_snapshot = next(snapshot for snapshot in bundle.normalized_snapshots if snapshot.asset_symbol == "WMNT")
        self.assertEqual(wmnt_snapshot.price_usd, "0.55392783")
        self.assertEqual(wmnt_snapshot.derivation_method, "wmnt_usdy_quote")
        self.assertEqual(wmnt_snapshot.freshness_status, "simulation_only")

    @patch("services.agent.modules.market_data.prices.MarketDataRepository")
    def test_uses_persisted_price_when_hermes_is_unavailable(self, market_repository_cls) -> None:
        settings = Settings(
            _env_file=None,
            target_chain=TargetChain.MANTLE_MAINNET,
            mantle_mainnet_rpc_url="https://example-mainnet",
            usdy_mainnet_address="0x0000000000000000000000000000000000000002",
            ondo_usdy_oracle_address="0x0000000000000000000000000000000000000003",
            ondo_usdy_oracle_method_selector="0x12345678",
        )

        market_repository = MagicMock()
        market_repository.latest_normalized_prices.return_value = [
            NormalizedPriceSnapshot(
                snapshot_id="persisted-usdy",
                asset_key="USDY",
                asset_symbol="USDY",
                asset_address="0x0000000000000000000000000000000000000002",
                chain_id=5000,
                price_usd="1.01",
                confidence_interval_usd=None,
                publish_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                observed_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                age_seconds=120,
                freshness_status="stale",
                status_code="DATA_PARTIAL",
                status_reason="Persisted normalized price snapshot.",
                derivation_method="ondo_redemption_oracle",
                data_sources_used=["ondo_redemption_oracle"],
                raw_snapshot_ids=["raw-1"],
            )
        ]
        market_repository_cls.return_value = market_repository

        hermes_client = MagicMock()
        hermes_client.fetch_latest_price_updates = AsyncMock(side_effect=RuntimeError("hermes unavailable"))

        price_service = PriceService(settings, hermes_client=hermes_client)
        price_service.asset_metadata_for_target_chain = MagicMock(
            return_value=[
                AssetMetadata(
                    asset_key="USDY",
                    symbol="USDY",
                    chain_id=5000,
                    address="0x0000000000000000000000000000000000000002",
                    verified=True,
                    price_strategy="ondo_oracle",
                    primary_reference_source="ondo_redemption_price_oracle",
                    dex_quote_required=True,
                    ondo_oracle_address="0x0000000000000000000000000000000000000003",
                )
            ]
        )

        bundle = asyncio.run(price_service._do_fetch_latest_prices())

        self.assertEqual(len(bundle.normalized_snapshots), 1)
        self.assertEqual(bundle.normalized_snapshots[0].price_usd, "1.01")
        self.assertIn("fallback", bundle.normalized_snapshots[0].status_reason.lower())


if __name__ == "__main__":
    unittest.main()
