from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from services.agent.app.schemas.allocation import RebalanceAction


class BacktestRunRequest(BaseModel):
    scenario_id: str
    profile_name: str = "Balanced"
    benchmarks: list[str] = Field(default_factory=lambda: ["hold_usdy", "static_basket", "guardian_strategy"])


class ScenarioDescriptor(BaseModel):
    scenario_id: str
    name: str
    description: str
    category: str
    step_count: int
    data_sources_used: list[str] = Field(default_factory=list)


class BacktestStepResult(BaseModel):
    step_index: int
    observed_at: datetime
    portfolio_value_usd: float
    risk_band: str
    risk_score: float
    recommended_action: str
    rebalance_actions: list[RebalanceAction] = Field(default_factory=list)
    action_notional_usd: float = 0.0
    notes: list[str] = Field(default_factory=list)


class BenchmarkMetrics(BaseModel):
    benchmark_id: str
    label: str
    initial_value_usd: float
    final_value_usd: float
    total_return_pct: float
    max_drawdown_pct: float
    turnover_usd: float = 0.0
    rebalance_count: int = 0
    veto_count: int = 0
    hit_rate: float | None = None
    risk_band_frequency: dict[str, int] = Field(default_factory=dict)


class BacktestRunResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    scenario: ScenarioDescriptor
    profile_name: str
    steps: list[BacktestStepResult] = Field(default_factory=list)
    benchmarks: list[BenchmarkMetrics] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ScenarioListResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    scenarios: list[ScenarioDescriptor] = Field(default_factory=list)


class DemoBacktestSummaryResponse(BaseModel):
    status: str
    status_code: str
    status_label: str
    status_reason: str
    generated_at: datetime
    results: list[BacktestRunResponse] = Field(default_factory=list)
