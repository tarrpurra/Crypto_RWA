from __future__ import annotations

from pydantic import BaseModel

from fastapi import APIRouter

from services.agent.app.core.runtime_config import AI_DECISION_MAKER_ENABLED


router = APIRouter(tags=["settings"])


class SettingsResponse(BaseModel):
    ai_decision_maker_enabled: bool


class UpdateSettingsRequest(BaseModel):
    ai_decision_maker_enabled: bool


@router.get("/settings", response_model=SettingsResponse)
async def get_runtime_settings() -> SettingsResponse:
    return SettingsResponse(
        ai_decision_maker_enabled=AI_DECISION_MAKER_ENABLED,
    )


@router.put("/settings", response_model=SettingsResponse)
async def update_runtime_settings(body: UpdateSettingsRequest) -> SettingsResponse:
    from services.agent.app.core import runtime_config
    runtime_config.AI_DECISION_MAKER_ENABLED = body.ai_decision_maker_enabled
    return SettingsResponse(
        ai_decision_maker_enabled=runtime_config.AI_DECISION_MAKER_ENABLED,
    )
