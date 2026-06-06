from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ReportField(BaseModel):
    label: str
    value: str
    detail: str | None = None


class ReportSection(BaseModel):
    key: str
    title: str
    status: str
    summary: str
    fields: list[ReportField] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class InvestmentReportResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    report_id: str
    download_name: str
    wallet_address: str | None = None
    ai_decision_maker_enabled: bool
    ai_mode: str
    sections: list[ReportSection] = Field(default_factory=list)
    data_gaps: list[str] = Field(default_factory=list)
    markdown: str
    metadata: dict[str, Any] = Field(default_factory=dict)
