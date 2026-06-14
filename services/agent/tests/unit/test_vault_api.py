import asyncio
import unittest
from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from services.agent.app.api.vault import get_vault_balance_snapshot, wallet_balance, withdraw_prepare
from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import TargetChain
from services.agent.app.schemas.market_data import NormalizedPriceSnapshot
from services.agent.app.schemas.vault import WithdrawPrepareRequest


class VaultApiTests(unittest.TestCase):
    @patch("services.agent.app.api.vault.get_settings")
    @patch("services.agent.app.api.vault.Erc20BalanceReader")
    @patch("services.agent.app.api.vault._web3")
    @patch("services.agent.app.api.vault.get_price_service")
    def test_wallet_balance_includes_native_mnt(
        self,
        get_price_service,
        web3_factory,
        balance_reader_cls,
        get_settings,
    ) -> None:
        settings = MagicMock()
        settings.effective_http_rpc_url = "http://example"
        settings.effective_chain_id = 5003
        settings.active_portfolio_asset_registry = {}
        get_settings.return_value = settings

        web3 = MagicMock()
        web3.to_checksum_address.side_effect = lambda value: value
        web3.eth.get_balance.return_value = 10**18
        web3_factory.return_value = web3

        balance_reader_cls.return_value.read_configured_balances.return_value = []
        get_price_service.return_value.fetch_latest_prices = AsyncMock(
            return_value=MagicMock(
                normalized_snapshots=[
                    NormalizedPriceSnapshot(
                        snapshot_id="price-1",
                        asset_key="NATIVE_MNT",
                        asset_symbol="MNT",
                        asset_address=None,
                        chain_id=5003,
                        price_usd="1",
                        confidence_interval_usd="0",
                        publish_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                        observed_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                        age_seconds=1,
                        freshness_status="fresh",
                        status_code="DATA_FRESH",
                        status_reason="fresh",
                        derivation_method="test",
                        data_sources_used=["test_price"],
                        raw_snapshot_ids=["raw-1"],
                    )
                ]
            )
        )

        response = asyncio.run(wallet_balance("0xwallet"))

        self.assertEqual(response.status_code, "DATA_FRESH")
        self.assertEqual([item.asset_symbol for item in response.balances], ["MNT"])
        self.assertEqual(response.balances[0].balance, "1")

    @patch("services.agent.app.api.vault.get_settings")
    @patch("services.agent.app.api.vault._get_vault_contract")
    @patch("services.agent.app.api.vault._web3")
    def test_withdraw_prepare_uses_wmnt_when_native_balance_is_missing(
        self,
        web3_factory,
        vault_contract_factory,
        get_settings,
    ) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_wmnt_address="0x0000000000000000000000000000000000000003",
        )
        get_settings.return_value = settings

        web3 = MagicMock()
        web3.to_checksum_address.side_effect = lambda value: value
        web3_factory.return_value = web3

        native_balance_call = MagicMock()
        native_balance_call.call.return_value = 0
        wmnt_balance_call = MagicMock()
        wmnt_balance_call.call.return_value = 10**18

        functions = MagicMock()
        functions.getUserBalance.side_effect = lambda user, token: native_balance_call if token == "0x0000000000000000000000000000000000000000" else wmnt_balance_call

        vault_contract = MagicMock()
        vault_contract.functions = functions
        vault_contract_factory.return_value = vault_contract

        response = asyncio.run(withdraw_prepare(WithdrawPrepareRequest(token="MNT", amount="1", user_address="0xuser")))

        self.assertEqual(response.vault_balance, "1")
        self.assertTrue(response.sufficient_balance)

    @patch("services.agent.app.api.vault.get_settings")
    @patch("services.agent.app.api.vault.VaultFlowRepository")
    @patch("services.agent.app.api.vault.get_price_service")
    @patch("services.agent.app.api.vault._get_vault_contract")
    @patch("services.agent.app.api.vault._web3")
    @patch("services.agent.app.api.vault.configured_vault_assets")
    def test_vault_balance_snapshot_includes_native_mnt(
        self,
        configured_assets_cls,
        web3_factory,
        vault_contract_factory,
        get_price_service,
        vault_flow_repo_cls,
        get_settings,
    ) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
        )
        get_settings.return_value = settings
        configured_assets_cls.return_value = []

        web3 = MagicMock()
        web3.to_checksum_address.side_effect = lambda value: value
        web3.eth.get_balance.return_value = 10**18
        web3_factory.return_value = web3

        get_user_balances_call = MagicMock()
        get_user_balances_call.call.return_value = [10**18]
        functions = MagicMock()
        functions.getUserBalances.return_value = get_user_balances_call
        vault_contract = MagicMock()
        vault_contract.functions = functions
        vault_contract_factory.return_value = vault_contract

        get_price_service.return_value.fetch_latest_prices = AsyncMock(
            return_value=MagicMock(
                normalized_snapshots=[
                    NormalizedPriceSnapshot(
                        snapshot_id="price-1",
                        asset_key="NATIVE_MNT",
                        asset_symbol="MNT",
                        asset_address=None,
                        chain_id=5003,
                        price_usd="1",
                        confidence_interval_usd="0",
                        publish_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                        observed_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                        age_seconds=1,
                        freshness_status="fresh",
                        status_code="DATA_FRESH",
                        status_reason="fresh",
                        derivation_method="test",
                        data_sources_used=["test_price"],
                        raw_snapshot_ids=["raw-1"],
                    )
                ]
            )
        )

        summary = MagicMock(
            flow_count=0,
            last_flow_at=None,
            net_invested_usd=Decimal("0"),
            total_deposits_usd=Decimal("0"),
            total_withdrawals_usd=Decimal("0"),
        )
        vault_flow_repo_cls.return_value.summarize.return_value = summary

        response = asyncio.run(get_vault_balance_snapshot("0xuser"))

        self.assertEqual(response.status_code, "DATA_FRESH")
        native_item = next(item for item in response.balances if item.asset_symbol == "MNT")
        self.assertEqual(native_item.balance, "1")


if __name__ == "__main__":
    unittest.main()
