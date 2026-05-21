from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ContractMetadataResponse(BaseModel):
    key: str
    contract_name: str
    source_dir: str
    artifact_path: str
    address: str | None
    abi: list[dict[str, Any]]
    state: dict[str, Any] | None = None


class ContractListResponse(BaseModel):
    contracts: dict[str, ContractMetadataResponse]
