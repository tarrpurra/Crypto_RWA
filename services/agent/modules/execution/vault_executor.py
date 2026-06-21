from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

from eth_account import Account
from fastapi import HTTPException
from web3 import HTTPProvider, Web3
from web3.exceptions import TimeExhausted

from services.agent.app.core.settings import Settings
from services.agent.app.schemas.proposals import ExecutionPayloadSchema
from services.agent.modules.contracts.foundry_artifacts import build_contract
from services.agent.repositories.db.models import TradeProposalRecord


logger = logging.getLogger("services.agent.execution.vault")


@dataclass(frozen=True)
class VaultExecutionSubmission:
    tx_hash: str
    executor_address: str
    chain_id: int
    amount_in: int
    native_value: int
    calldata_hash: str
    receipt_status: int | None = None
    receipt_block_number: int | None = None


def _require_address(value: str | None, field_name: str) -> str:
    if not value:
        raise HTTPException(status_code=400, detail=f"{field_name} is not configured.")
    if not Web3.is_address(value):
        raise HTTPException(status_code=400, detail=f"{field_name} is not a valid EVM address.")
    return Web3.to_checksum_address(value)


def _require_int(value: str | None, field_name: str) -> int:
    try:
        return int(Decimal(str(value or "0")))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} is not a valid integer value.") from exc


def _execution_payload_from_record(proposal: TradeProposalRecord) -> ExecutionPayloadSchema:
    return ExecutionPayloadSchema(
        proposalId=proposal.proposal_id,
        planHash=proposal.plan_hash,
        router=proposal.router,
        selector=proposal.selector,
        calldataHash=proposal.calldata_hash,
        tokenIn=proposal.token_in,
        tokenOut=proposal.token_out,
        recipient=proposal.recipient,
        maxAmountIn=_require_int(proposal.max_amount_in, "max_amount_in"),
        minAmountOut=_require_int(proposal.min_amount_out, "min_amount_out"),
        nativeValue=_require_int(proposal.native_value, "native_value"),
        deadline=int(proposal.deadline),
        proposalExpiry=int(proposal.proposal_expiry),
        nonce=int(proposal.nonce),
    )


def _execution_payload_tuple(payload: ExecutionPayloadSchema) -> tuple[object, ...]:
    return (
        Web3.to_bytes(hexstr=payload.proposalId),
        Web3.to_bytes(hexstr=payload.planHash),
        Web3.to_checksum_address(payload.router),
        Web3.to_bytes(hexstr=payload.selector),
        Web3.to_bytes(hexstr=payload.calldataHash),
        Web3.to_checksum_address(payload.tokenIn),
        Web3.to_checksum_address(payload.tokenOut),
        Web3.to_checksum_address(payload.recipient),
        int(payload.maxAmountIn),
        int(payload.minAmountOut),
        int(payload.nativeValue),
        int(payload.deadline),
        int(payload.proposalExpiry),
        int(payload.nonce),
    )


def submit_executor_vault_trade(
    *,
    settings: Settings,
    foundry_out_dir: Path,
    proposal: TradeProposalRecord,
) -> VaultExecutionSubmission:
    executor_private_key = (settings.executor_private_key or "").strip()
    if not executor_private_key:
        raise HTTPException(status_code=400, detail="EXECUTOR_PRIVATE_KEY is not configured.")

    vault_address = _require_address(settings.executor_vault_address, "EXECUTOR_VAULT_ADDRESS")
    if not proposal.calldata:
        raise HTTPException(status_code=400, detail="Proposal calldata is missing and cannot be submitted on-chain.")

    web3 = Web3(HTTPProvider(settings.effective_http_rpc_url))
    if not web3.is_connected():
        raise HTTPException(status_code=502, detail="Unable to connect to the configured RPC endpoint.")

    account = Account.from_key(executor_private_key)
    vault_contract = build_contract(
        web3=web3,
        foundry_out_dir=foundry_out_dir,
        source_dir="ExecutorVault.sol",
        contract_name="ExecutorVault",
        address=vault_address,
    )

    payload = _execution_payload_from_record(proposal)
    router_calldata = Web3.to_bytes(hexstr=proposal.calldata)
    amount_in = _require_int(proposal.max_amount_in, "max_amount_in")

    contract_fn = vault_contract.functions.executeApprovedTrade(
        _execution_payload_tuple(payload),
        router_calldata,
        amount_in,
    )

    tx_params: dict[str, object] = {
        "from": account.address,
        "nonce": web3.eth.get_transaction_count(account.address),
        "chainId": settings.effective_chain_id,
        "value": int(payload.nativeValue),
        "gasPrice": web3.eth.gas_price,
    }

    try:
        estimated_gas = contract_fn.estimate_gas(tx_params)
        tx_params["gas"] = int(estimated_gas * 12 // 10)
    except Exception as exc:
        logger.warning("ExecutorVault gas estimation failed for proposal %s: %s", proposal.proposal_id, exc)
        tx_params["gas"] = 1_500_000

    tx = contract_fn.build_transaction(tx_params)
    signed_tx = web3.eth.account.sign_transaction(tx, private_key=executor_private_key)
    tx_hash = web3.eth.send_raw_transaction(signed_tx.raw_transaction)

    receipt_status: int | None = None
    receipt_block_number: int | None = None
    try:
        receipt = web3.eth.wait_for_transaction_receipt(
            tx_hash,
            timeout=settings.execution_receipt_timeout_seconds,
            poll_latency=settings.execution_receipt_poll_latency_seconds,
        )
        receipt_status = int(receipt.get("status")) if receipt.get("status") is not None else None
        receipt_block_number = int(receipt.get("blockNumber")) if receipt.get("blockNumber") is not None else None
    except TimeExhausted:
        logger.info(
            "ExecutorVault receipt polling timed out for proposal %s tx_hash=%s after %ss.",
            proposal.proposal_id,
            Web3.to_hex(tx_hash),
            settings.execution_receipt_timeout_seconds,
        )
    except Exception as exc:
        logger.warning(
            "ExecutorVault receipt polling failed for proposal %s tx_hash=%s: %s",
            proposal.proposal_id,
            Web3.to_hex(tx_hash),
            exc,
        )

    return VaultExecutionSubmission(
        tx_hash=Web3.to_hex(tx_hash),
        executor_address=account.address,
        chain_id=settings.effective_chain_id,
        amount_in=amount_in,
        native_value=int(payload.nativeValue),
        calldata_hash=proposal.calldata_hash,
        receipt_status=receipt_status,
        receipt_block_number=receipt_block_number,
    )
