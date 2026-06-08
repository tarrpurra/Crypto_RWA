from __future__ import annotations

from pydantic import BaseModel

from fastapi import APIRouter

from services.agent.app.core import runtime_config


router = APIRouter(tags=["settings"])


class SettingsResponse(BaseModel):
    ai_decision_maker_enabled: bool
    chain_id: int
    native_mnt_enabled: bool
    sepolia_usdy_address: str | None
    sepolia_meth_address: str | None
    sepolia_meth_is_test_token: bool
    sepolia_meth_price_mode: str
    sepolia_wmnt_address: str | None


class UpdateSettingsRequest(BaseModel):
    ai_decision_maker_enabled: bool


@router.get("/settings", response_model=SettingsResponse)
async def get_runtime_settings() -> SettingsResponse:
    from services.agent.app.core.settings import get_settings

    settings = get_settings()
    return SettingsResponse(
        ai_decision_maker_enabled=runtime_config.get_ai_decision_maker_enabled(),
        chain_id=settings.effective_chain_id,
        native_mnt_enabled=settings.native_mnt_enabled,
        sepolia_usdy_address=settings.sepolia_usdy_address,
        sepolia_meth_address=settings.effective_sepolia_meth_address,
        sepolia_meth_is_test_token=settings.sepolia_meth_is_test_token,
        sepolia_meth_price_mode=settings.effective_sepolia_meth_price_mode,
        sepolia_wmnt_address=settings.sepolia_wmnt_address,
    )


@router.put("/settings", response_model=SettingsResponse)
async def update_runtime_settings(body: UpdateSettingsRequest) -> SettingsResponse:
    from services.agent.app.core import runtime_config
    from services.agent.app.core.settings import get_settings

    settings = get_settings()
    runtime_config.AI_DECISION_MAKER_ENABLED = body.ai_decision_maker_enabled
    return SettingsResponse(
        ai_decision_maker_enabled=runtime_config.get_ai_decision_maker_enabled(),
        chain_id=settings.effective_chain_id,
        native_mnt_enabled=settings.native_mnt_enabled,
        sepolia_usdy_address=settings.sepolia_usdy_address,
        sepolia_meth_address=settings.effective_sepolia_meth_address,
        sepolia_meth_is_test_token=settings.sepolia_meth_is_test_token,
        sepolia_meth_price_mode=settings.effective_sepolia_meth_price_mode,
        sepolia_wmnt_address=settings.sepolia_wmnt_address,
    )
