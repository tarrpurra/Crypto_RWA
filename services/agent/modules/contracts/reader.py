from __future__ import annotations

from pathlib import Path
from typing import Any

from services.agent.modules.contracts.foundry_artifacts import build_contract, load_artifact
from services.agent.modules.contracts.project_contracts import PROJECT_CONTRACTS


def _web3(rpc_url: str) -> Any:
    from web3 import HTTPProvider, Web3

    return Web3(HTTPProvider(rpc_url))


def get_contract_abi(foundry_out_dir: Path, contract_key: str) -> list[dict[str, Any]]:
    spec = PROJECT_CONTRACTS[contract_key]
    artifact = load_artifact(
        foundry_out_dir=foundry_out_dir,
        source_dir=spec.source_dir,
        contract_name=spec.contract_name,
    )
    return artifact.abi


def get_contract_instance(rpc_url: str, foundry_out_dir: Path, contract_key: str, address: str) -> Any:
    web3 = _web3(rpc_url)
    spec = PROJECT_CONTRACTS[contract_key]
    return build_contract(
        web3=web3,
        foundry_out_dir=foundry_out_dir,
        source_dir=spec.source_dir,
        contract_name=spec.contract_name,
        address=address,
    )


def describe_contract(foundry_out_dir: Path, contract_key: str, address: str | None = None) -> dict[str, Any]:
    spec = PROJECT_CONTRACTS[contract_key]
    artifact = load_artifact(
        foundry_out_dir=foundry_out_dir,
        source_dir=spec.source_dir,
        contract_name=spec.contract_name,
    )
    return {
        "key": spec.key,
        "contract_name": spec.contract_name,
        "source_dir": spec.source_dir,
        "artifact_path": str(artifact.artifact_path),
        "address": address,
        "abi": artifact.abi,
    }


def get_pause_guardian_state(rpc_url: str, foundry_out_dir: Path, address: str) -> dict[str, Any]:
    web3 = _web3(rpc_url)
    spec = PROJECT_CONTRACTS["pause_guardian"]
    contract = build_contract(
        web3=web3,
        foundry_out_dir=foundry_out_dir,
        source_dir=spec.source_dir,
        contract_name=spec.contract_name,
        address=address,
    )
    return {
        "address": web3.to_checksum_address(address),
        "paused": bool(contract.functions.paused().call()),
    }


def get_trade_approval_manager_state(rpc_url: str, foundry_out_dir: Path, address: str) -> dict[str, Any]:
    web3 = _web3(rpc_url)
    spec = PROJECT_CONTRACTS["trade_approval_manager"]
    contract = build_contract(
        web3=web3,
        foundry_out_dir=foundry_out_dir,
        source_dir=spec.source_dir,
        contract_name=spec.contract_name,
        address=address,
    )
    return {
        "address": web3.to_checksum_address(address),
        "required_approvals": int(contract.functions.requiredApprovals().call()),
    }


def get_executor_vault_state(rpc_url: str, foundry_out_dir: Path, address: str) -> dict[str, Any]:
    web3 = _web3(rpc_url)
    contract = get_contract_instance(
        rpc_url=rpc_url,
        foundry_out_dir=foundry_out_dir,
        contract_key="executor_vault",
        address=address,
    )
    return {
        "address": web3.to_checksum_address(address),
        "pause_guardian": contract.functions.pauseGuardian().call(),
        "trade_approval_manager": contract.functions.tradeApprovalManager().call(),
    }
