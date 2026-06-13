import unittest
from unittest.mock import MagicMock

from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import TargetChain
from services.agent.app.schemas.quotes import RouteDescriptor
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

    def test_sepolia_unsupported_agni_routes_skip_live_quoter(self) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_meth_address="0x0000000000000000000000000000000000000001",
            sepolia_usdy_address="0x0000000000000000000000000000000000000002",
        )
        service = QuoteService(settings)
        service.discover_routes = MagicMock(
            return_value=[
                RouteDescriptor(
                    protocol="AGNI",
                    route_type="v3_exact_input_single",
                    token_in="USDY",
                    token_out="WMNT",
                    route_path=[
                        "0x0000000000000000000000000000000000000002",
                        "0x0000000000000000000000000000000000000005",
                    ],
                    verification_state="quoter_v2_quote_required",
                    route_id="agni:USDY:WMNT:500",
                    fee_tier_or_bin_step="500",
                    router_address="0x0000000000000000000000000000000000000003",
                    pool_address="0x0000000000000000000000000000000000000004",
                )
            ]
        )
        service.agni_quotes.quote_route = MagicMock(side_effect=AssertionError("live quoter should not be called"))

        bundle = service.sample_latest_quotes()

        self.assertEqual(bundle.normalized_snapshots[0].status_code, "LIQUIDITY_UNKNOWN")
        self.assertEqual(bundle.normalized_snapshots[0].status_reason, "AGNI live quote method is not verified in the repository yet.")
        service.agni_quotes.quote_route.assert_not_called()

    def test_agni_quote_revert_is_classified_as_quote_failed(self) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_meth_address="0x0000000000000000000000000000000000000001",
            sepolia_usdy_address="0x0000000000000000000000000000000000000002",
            agni_sepolia_quoter_v2_address="0x0000000000000000000000000000000000000003",
        )
        service = QuoteService(settings)
        route = RouteDescriptor(
            protocol="AGNI",
            route_type="v3_exact_input_single",
            token_in="USDY",
            token_out="mETH",
            route_path=[
                "0x0000000000000000000000000000000000000002",
                "0x0000000000000000000000000000000000000001",
            ],
            verification_state="quoter_v2_quote_required",
            route_id="agni:USDY:mETH:500",
            fee_tier_or_bin_step="500",
            router_address="0x0000000000000000000000000000000000000004",
            pool_address="0x0000000000000000000000000000000000000005",
        )
        service.agni_quotes.web3 = MagicMock()
        service.agni_quotes.web3.to_checksum_address.side_effect = lambda value: value
        service.agni_quotes.web3.eth.contract.return_value.functions.quoteExactInputSingle.return_value.call.side_effect = Exception(
            ("execution reverted", "0x")
        )
        service.agni_quotes.web3.eth.block_number = 123

        attempt = service.agni_quotes.quote_route(route, 1)

        self.assertEqual(attempt.normalized_snapshot.freshness_status, "quote_failed")
        self.assertIsNone(attempt.normalized_snapshot.amount_out)
        self.assertEqual(attempt.normalized_snapshot.status_reason, "AGNI QuoterV2 reverted for route USDY->mETH: ('execution reverted', '0x')")


if __name__ == "__main__":
    unittest.main()
