import unittest
from unittest.mock import MagicMock, patch

from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import TargetChain
from services.agent.app.schemas.market_data import AssetMetadata
from services.agent.modules.quotes.agni_discovery import AgniDiscoveryService


class AgniDiscoveryTests(unittest.TestCase):
    def test_zero_liquidity_pool_is_skipped(self) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_meth_address="0x0000000000000000000000000000000000000001",
            sepolia_usdy_address="0x0000000000000000000000000000000000000002",
            agni_sepolia_factory_address="0x0000000000000000000000000000000000000003",
            agni_sepolia_quoter_v2_address="0x0000000000000000000000000000000000000004",
            agni_sepolia_swap_router_address="0x0000000000000000000000000000000000000005",
            agni_fee_tiers="500",
        )
        service = AgniDiscoveryService(settings)

        factory_contract = MagicMock()
        factory_contract.functions.getPool.return_value.call.return_value = "0x0000000000000000000000000000000000000010"

        pool_contract = MagicMock()
        pool_contract.functions.liquidity.return_value.call.return_value = 0

        def contract_factory(*args, **kwargs):
            if kwargs.get("address") == service.web3.to_checksum_address(settings.agni_sepolia_factory_address):
                return factory_contract
            return pool_contract

        service.web3.eth.contract = contract_factory  # type: ignore[method-assign]

        token_in = AssetMetadata(
            asset_key="SEPOLIA_USDY",
            symbol="USDY",
            chain_id=settings.mantle_sepolia_chain_id,
            address="0x0000000000000000000000000000000000000002",
            price_strategy="ondo_oracle_plus_dex",
            primary_reference_source="ondo_redemption_oracle",
            dex_quote_required=True,
            verified=True,
            pyth_feed_id=None,
            ratio_feed_id=None,
            ondo_oracle_address=settings.ondo_usdy_oracle_address,
            decimals=18,
        )
        token_out = AssetMetadata(
            asset_key="SEPOLIA_METH",
            symbol="mETH",
            chain_id=settings.mantle_sepolia_chain_id,
            address="0x0000000000000000000000000000000000000001",
            price_strategy="pyth_eth_usd_plus_dex_basis",
            primary_reference_source="pyth_eth_usd",
            dex_quote_required=True,
            verified=True,
            pyth_feed_id=None,
            ratio_feed_id=None,
            ondo_oracle_address=None,
            decimals=18,
        )

        routes = service.discover_exact_input_single_routes(token_in, token_out)

        self.assertEqual(routes, [])


if __name__ == "__main__":
    unittest.main()
