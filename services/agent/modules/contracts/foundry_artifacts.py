from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ContractArtifact:
    contract_name: str
    source_dir: str
    abi: list[dict[str, Any]]
    artifact_path: Path


def artifact_file(foundry_out_dir: Path, source_dir: str, contract_name: str) -> Path:
    return foundry_out_dir / source_dir / f"{contract_name}.json"


def load_artifact(foundry_out_dir: Path, source_dir: str, contract_name: str) -> ContractArtifact:
    path = artifact_file(foundry_out_dir, source_dir, contract_name)
    if not path.exists():
        raise FileNotFoundError(
            f"Foundry artifact not found for {contract_name} at {path}. "
            "Run `forge build` in contracts/ before starting the Python service."
        )

    payload = json.loads(path.read_text(encoding="utf-8"))
    abi = payload.get("abi") or payload.get("metadata", {}).get("output", {}).get("abi")
    if not abi:
        raise ValueError(f"Artifact {path} does not contain an ABI.")

    return ContractArtifact(
        contract_name=contract_name,
        source_dir=source_dir,
        abi=abi,
        artifact_path=path,
    )


def build_contract(web3: Any, foundry_out_dir: Path, source_dir: str, contract_name: str, address: str) -> Any:
    artifact = load_artifact(foundry_out_dir, source_dir, contract_name)
    checksum_address = web3.to_checksum_address(address)
    return web3.eth.contract(address=checksum_address, abi=artifact.abi)
