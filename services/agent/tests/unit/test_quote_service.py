import unittest

from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import TargetChain
from services.agent.modules.quotes.service import QuoteService


class QuoteServiceTests(unittest.TestCase):
    def test_sepolia_quote_pairs_use_real_test_assets(self) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_meth_address="0x0000000000000000000000000000000000000001",
            sepolia_usdy_address="0x0000000000000000000000000000000000000002",
            sepolia_mock_routes_enabled=True,
            sepolia_mock_token_a_address="0x0000000000000000000000000000000000000003",
            sepolia_mock_token_b_address="0x0000000000000000000000000000000000000004",
        )

        pairs = QuoteService(settings)._quote_pairs()
        pair_symbols = [(pair.token_in.symbol, pair.token_out.symbol) for pair in pairs]

        self.assertIn(("USDY", "mETH"), pair_symbols)
        self.assertIn(("mETH", "USDY"), pair_symbols)
        self.assertNotIn(("MockTokenA", "MockTokenB"), pair_symbols)


if __name__ == "__main__":
    unittest.main()
