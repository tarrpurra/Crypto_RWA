import unittest

from services.agent.app.core.settings import Settings
from services.agent.modules.oracle.ondo_usdy_oracle import OndoUsdyOracleAdapter


class OndoUsdyOracleAdapterTests(unittest.TestCase):
    def test_selector_todo_returns_verification_required(self) -> None:
        settings = Settings(
            target_chain="mantle_mainnet",
            ondo_usdy_oracle_address="0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f",
            ondo_usdy_oracle_method_selector="TODO_VERIFY",
        )

        read = OndoUsdyOracleAdapter(settings).read()

        self.assertIsNone(read.observation)
        self.assertEqual(read.status.status, "selector_verification_required")


if __name__ == "__main__":
    unittest.main()
