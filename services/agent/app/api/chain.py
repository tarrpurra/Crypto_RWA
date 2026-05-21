from __future__ import annotations

from fastapi import APIRouter

from services.agent.app.core.settings import get_settings
from services.agent.app.schemas.chain import ChainStatusResponse
from services.agent.modules.chain.quicknode import QuickNodeRpcClient, status_to_dict
from services.agent.modules.contracts.project_contracts import PROJECT_CONTRACTS
from services.agent.modules.contracts.reader import (
    get_executor_vault_state,
    get_pause_guardian_state,
    get_trade_approval_manager_state,
)


router = APIRouter(prefix="/chain", tags=["chain"])


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


@router.get("/status", response_model=ChainStatusResponse)
async def chain_status() -> ChainStatusResponse:
    settings = get_settings()
    rpc_client = QuickNodeRpcClient(
        http_url=settings.effective_http_rpc_url,
        ws_url=settings.effective_wss_rpc_url,
    )
    status = await rpc_client.status()

    response: dict[str, object] = status_to_dict(status)
    response.update(
        {
            "status": "ok",
            "status_code": "DATA_FRESH",
            "status_label": "DATA_FRESH",
            "status_reason": "Chain RPC responded with a fresh sample.",
        }
    )
    for contract_key, address in _configured_contracts().items():
        if not address:
            continue
        response[contract_key] = _contract_state(
            contract_key=contract_key,
            rpc_url=settings.effective_http_rpc_url,
            foundry_out_dir=settings.foundry_out_dir,
            address=address,
        )

    return ChainStatusResponse(**response)
