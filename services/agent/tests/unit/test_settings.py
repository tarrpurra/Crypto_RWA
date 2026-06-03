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
        settings = Settings()

        self.assertEqual(settings.runtime_mode, RuntimeMode.MONITOR_ONLY)

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
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_meth_address="0x0000000000000000000000000000000000000001",
            sepolia_usdy_address="0x0000000000000000000000000000000000000002",
            sepolia_mock_prices_enabled=False,
            sepolia_mock_token_a_address="0x0000000000000000000000000000000000000003",
            sepolia_mock_token_b_address="0x0000000000000000000000000000000000000004",
        )

        self.assertEqual(
            set(settings.active_portfolio_asset_registry.keys()),
            {"SEPOLIA_METH", "SEPOLIA_USDY"},
        )


if __name__ == "__main__":
    unittest.main()
