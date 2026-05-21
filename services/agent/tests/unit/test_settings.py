import unittest

from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import RuntimeMode, TargetChain


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


if __name__ == "__main__":
    unittest.main()
