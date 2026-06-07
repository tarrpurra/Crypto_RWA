import unittest

from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import RuntimeMode, TargetChain
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

    def test_allocation_profile_defaults_to_sepolia_test(self) -> None:
        settings = Settings(_env_file=None)

        self.assertEqual(settings.allocation_profile_name, "Sepolia Test")

    def test_subsystem_log_levels_fall_back_to_global_level(self) -> None:
        settings = Settings(log_level="WARNING", log_quotes=None)

        self.assertEqual(settings.subsystem_log_levels["quotes"], "WARNING")

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


if __name__ == "__main__":
    unittest.main()
