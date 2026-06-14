from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrategyStatusEnvelope(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str


class StrategyRiskWeights(BaseModel):
    model_config = ConfigDict(extra="forbid")

    llm_sentiment: float = 0.35
    liquidity: float = 0.20
    oracle: float = 0.15
    depeg: float = 0.20
    execution: float = 0.10

    @field_validator("llm_sentiment", "liquidity", "oracle", "depeg", "execution")
    @classmethod
    def _validate_non_negative(cls, value: float) -> float:
        if value < 0:
            raise ValueError("risk weights must be non-negative")
        return value


class StrategyHardLimits(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_slippage_bps: int = 50
    max_gas_gwei: int = 50
    max_asset_exposure_pct: int = 35
    max_issuer_exposure_pct: int = 60
    min_stable_reserve_pct: int = 10
    max_llm_influence_pct: int = 40
    max_risk_score_for_fresh_allocation: int = 45
    force_human_approval_risk_score: int = 65
    pause_risk_score: int = 80
    global_circuit_breaker: bool = True


class StrategyPolicyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strategy_version: str = "v1.0.0"
    objective: str = "capital_preservation_first"
    allowed_assets: list[str] = Field(default_factory=lambda: ["USDY", "mETH"])
    risk_weights: StrategyRiskWeights = Field(default_factory=StrategyRiskWeights)
    hard_limits: StrategyHardLimits = Field(default_factory=StrategyHardLimits)
    market_check_interval_seconds: int = 300
    quote_refresh_interval_seconds: int = 120
    risk_recompute_interval_seconds: int = 300
    proposal_expiry_seconds: int = 180
    simulation_only_mode: bool = False
    human_approval_required: bool = True
    notes: list[str] = Field(default_factory=list)

    @field_validator("allowed_assets")
    @classmethod
    def _validate_assets(cls, value: list[str]) -> list[str]:
        cleaned = [asset.strip() for asset in value if asset and asset.strip()]
        if not cleaned:
            raise ValueError("allowed_assets must not be empty")
        return cleaned


class StrategyPolicyDraftRequest(BaseModel):
    user_address: str | None = None
    strategy_text: str
    policy_json: dict[str, Any] | None = None
    template_id: int | None = None
    actor: str | None = None


class StrategyValidationError(BaseModel):
    code: str
    message: str
    field: str | None = None
    severity: str = "error"


class StrategyTemplateSummary(BaseModel):
    id: int
    name: str
    description: str
    category: str
    prompt_text: str
    policy_json: StrategyPolicyConfig
    is_system_template: bool
    created_at: datetime


class StrategyDraftResponse(StrategyStatusEnvelope):
    draft_id: int
    user_address: str | None
    raw_prompt: str
    extracted_policy_json: StrategyPolicyConfig | None = None
    validation_status: str
    validation_errors: list[StrategyValidationError] = Field(default_factory=list)
    safety_score: int
    created_at: datetime
    requires_simulation: bool = True
    template: StrategyTemplateSummary | None = None


class StrategyValidationResponse(StrategyStatusEnvelope):
    draft_id: int | None = None
    user_address: str | None = None
    raw_prompt: str
    safety_score: int
    validation_errors: list[StrategyValidationError] = Field(default_factory=list)
    extracted_policy_json: StrategyPolicyConfig | None = None
    requires_simulation: bool = True
    safe_suggestion: str | None = None


class StrategySimulationMetrics(BaseModel):
    expected_risk_score: int
    expected_slippage_bps: int
    expected_human_approval_required: bool
    expected_pause_required: bool
    recommendation: str
    critical_findings: list[str] = Field(default_factory=list)
    protective_actions: list[str] = Field(default_factory=list)
    data_sources_used: list[str] = Field(default_factory=list)


class StrategySimulationResponse(StrategyStatusEnvelope):
    draft_id: int | None = None
    user_address: str | None = None
    raw_prompt: str
    safety_score: int
    extracted_policy_json: StrategyPolicyConfig
    simulation: StrategySimulationMetrics
    market_context: dict[str, Any] = Field(default_factory=dict)
    risk_context: dict[str, Any] = Field(default_factory=dict)
    validation_errors: list[StrategyValidationError] = Field(default_factory=list)
    safe_suggestion: str | None = None


class StrategyVersionRecordResponse(BaseModel):
    id: int
    version: str
    user_address: str | None
    active_policy_json: StrategyPolicyConfig
    raw_prompt_snapshot: str
    simulation_result_json: dict[str, Any] = Field(default_factory=dict)
    activated_by: str | None
    activated_at: datetime | None
    status: str


class StrategyAuditEventResponse(BaseModel):
    id: int
    strategy_version_id: int | None
    event_type: str
    actor: str
    details_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class StrategySchedulerSettingsResponse(BaseModel):
    id: int
    strategy_version_id: int | None
    market_check_interval_seconds: int
    quote_refresh_interval_seconds: int
    risk_recompute_interval_seconds: int
    execution_window_seconds: int
    updated_at: datetime


class StrategyActiveResponse(StrategyStatusEnvelope):
    active_version: StrategyVersionRecordResponse | None = None
    scheduler: StrategySchedulerSettingsResponse | None = None
    templates: list[StrategyTemplateSummary] = Field(default_factory=list)
    versions: list[StrategyVersionRecordResponse] = Field(default_factory=list)
    audit_events: list[StrategyAuditEventResponse] = Field(default_factory=list)
    last_validation: StrategyValidationResponse | None = None
    latest_simulation: StrategySimulationResponse | None = None


class StrategyVersionListResponse(StrategyStatusEnvelope):
    versions: list[StrategyVersionRecordResponse] = Field(default_factory=list)


class StrategyTemplateListResponse(StrategyStatusEnvelope):
    templates: list[StrategyTemplateSummary] = Field(default_factory=list)


class StrategyAuditListResponse(StrategyStatusEnvelope):
    events: list[StrategyAuditEventResponse] = Field(default_factory=list)


class StrategyRevertRequest(BaseModel):
    version: str
    actor: str | None = None


class StrategySchedulerUpdateRequest(BaseModel):
    version: str | None = None
    market_check_interval_seconds: int
    quote_refresh_interval_seconds: int
    risk_recompute_interval_seconds: int
    execution_window_seconds: int
    actor: str | None = None


class StrategyActiveVersionUpdateRequest(BaseModel):
    strategy_text: str
    policy_json: dict[str, Any] | None = None
    template_id: int | None = None
    user_address: str | None = None
    actor: str | None = None
