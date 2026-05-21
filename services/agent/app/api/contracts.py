from __future__ import annotations

from fastapi import APIRouter, HTTPException

from services.agent.app.core.settings import get_settings
from services.agent.app.schemas.contracts import ContractListResponse, ContractMetadataResponse
from services.agent.modules.contracts.project_contracts import PROJECT_CONTRACTS
from services.agent.modules.contracts.reader import (
    describe_contract,
    get_executor_vault_state,
    get_pause_guardian_state,
    get_trade_approval_manager_state,
)


router = APIRouter(prefix="/contracts", tags=["contracts"])


def _configured_contracts() -> dict[str, str | None]:
    settings = get_settings()
    return {
        contract_key: getattr(settings, spec.settings_field)
        for contract_key, spec in PROJECT_CONTRACTS.items()
    }


def _contract_state(contract_key: str, rpc_url: str, foundry_out_dir, address: str) -> dict[str, object]:
    if contract_key == "pause_guardian":
        return get_pause_guardian_state(rpc_url=rpc_url, foundry_out_dir=foundry_out_dir, address=address)
    if contract_key == "trade_approval_manager":
        return get_trade_approval_manager_state(rpc_url=rpc_url, foundry_out_dir=foundry_out_dir, address=address)
    if contract_key == "executor_vault":
        return get_executor_vault_state(rpc_url=rpc_url, foundry_out_dir=foundry_out_dir, address=address)
    raise KeyError(f"Unsupported contract key: {contract_key}")


@router.get("", response_model=ContractListResponse)
async def list_contracts() -> ContractListResponse:
    settings = get_settings()
    contracts: dict[str, ContractMetadataResponse] = {}

    for contract_key, address in _configured_contracts().items():
        metadata = describe_contract(
            foundry_out_dir=settings.foundry_out_dir,
            contract_key=contract_key,
            address=address,
        )
        contracts[contract_key] = ContractMetadataResponse(**metadata)

    return ContractListResponse(contracts=contracts)


@router.get("/{contract_key}", response_model=ContractMetadataResponse)
async def get_contract(contract_key: str) -> ContractMetadataResponse:
    settings = get_settings()
    if contract_key not in PROJECT_CONTRACTS:
        raise HTTPException(status_code=404, detail=f"Unknown contract key: {contract_key}")

    address = _configured_contracts()[contract_key]
    response: dict[str, object] = describe_contract(
        foundry_out_dir=settings.foundry_out_dir,
        contract_key=contract_key,
        address=address,
    )
    if address:
        response["state"] = _contract_state(
            contract_key=contract_key,
            rpc_url=settings.effective_http_rpc_url,
            foundry_out_dir=settings.foundry_out_dir,
            address=address,
        )
    return ContractMetadataResponse(**response)
