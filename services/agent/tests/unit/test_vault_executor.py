from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import TargetChain
from services.agent.modules.execution.vault_executor import submit_executor_vault_trade


class VaultExecutorTests(unittest.TestCase):
    @patch("services.agent.modules.execution.vault_executor.build_contract")
    @patch("services.agent.modules.execution.vault_executor.Account")
    @patch("services.agent.modules.execution.vault_executor.Web3")
    def test_submit_executor_vault_trade_signs_and_sends_transaction(
        self,
        web3_cls,
        account_cls,
        build_contract,
    ) -> None:
        web3 = MagicMock()
        web3.is_connected.return_value = True
        web3.eth.get_transaction_count.return_value = 7
        web3.eth.gas_price = 100
        web3.eth.account.sign_transaction.return_value = MagicMock(raw_transaction=b"signed")
        web3.eth.send_raw_transaction.return_value = b"\x12" * 32
        web3.to_checksum_address.side_effect = lambda value: value
        web3_cls.to_hex.side_effect = lambda value: f"0x{value.hex()}" if hasattr(value, "hex") else str(value)
        web3_cls.return_value = web3

        account = MagicMock()
        account.address = "0x1111111111111111111111111111111111111111"
        account_cls.from_key.return_value = account

        contract_fn = MagicMock()
        contract_fn.estimate_gas.return_value = 100_000
        contract_fn.build_transaction.return_value = {"to": "0xvault", "data": "0xdeadbeef"}
        vault_contract = MagicMock()
        vault_contract.functions.executeApprovedTrade.return_value = contract_fn
        build_contract.return_value = vault_contract

        settings = Settings(
            _env_file=None,
            target_chain=TargetChain.MANTLE_SEPOLIA,
            mantle_sepolia_rpc_url="http://example",
            executor_vault_address="0x301e982dbc40f4aa42C291427E7cB0E9491102F1",
            executor_private_key="0x" + "11" * 32,
        )
        proposal = MagicMock(
            proposal_id="0xproposal",
            plan_hash="0xplan",
            router="0xrouter",
            selector="0x12345678",
            calldata_hash="0xcalldatahash",
            token_in="0xtoken_in",
            token_out="0xtoken_out",
            recipient="0xrecipient",
            max_amount_in="10",
            min_amount_out="9",
            native_value="0",
            deadline=123,
            proposal_expiry=456,
            nonce=1,
            calldata="0x1234",
        )

        submission = submit_executor_vault_trade(
            settings=settings,
            foundry_out_dir=settings.foundry_out_dir,
            proposal=proposal,
        )

        self.assertEqual(submission.tx_hash, "0x" + "12" * 32)
        self.assertEqual(submission.executor_address, account.address)
        account_cls.from_key.assert_called_once()
        web3.eth.send_raw_transaction.assert_called_once()


if __name__ == "__main__":
    unittest.main()
