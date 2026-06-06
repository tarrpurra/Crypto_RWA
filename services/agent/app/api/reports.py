from __future__ import annotations

from fastapi import APIRouter, HTTPException

from services.agent.app.api.investment_scope import InvestmentScopeInput
from services.agent.app.schemas.reports import InvestmentReportResponse
from services.agent.modules.reports import build_investment_report


router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/latest", response_model=InvestmentReportResponse)
async def latest_report(
    wallet_address: str | None = None,
    deposit_asset_symbol: str | None = None,
    deposit_amount: float | None = None,
    risk_profile: str | None = None,
    allocation_mode: str | None = None,
) -> InvestmentReportResponse:
    provided = [deposit_asset_symbol, deposit_amount, risk_profile]
    if any(value is not None for value in provided) and not all(value is not None for value in provided):
        raise HTTPException(
            status_code=400,
            detail="deposit_asset_symbol, deposit_amount, and risk_profile must be provided together for scoped reports.",
        )
    if deposit_amount is not None and deposit_amount <= 0:
        raise HTTPException(status_code=400, detail="deposit_amount must be greater than zero for scoped reports.")

    scope = None
    if all(value is not None for value in provided):
        scope = InvestmentScopeInput(
            wallet_address=wallet_address,
            deposit_asset_symbol=deposit_asset_symbol or "",
            deposit_amount=deposit_amount or 0,
            risk_profile=risk_profile or "",
            allocation_mode=allocation_mode or "AI Suggested",
        )

    return await build_investment_report(wallet_address=wallet_address, scope=scope)
