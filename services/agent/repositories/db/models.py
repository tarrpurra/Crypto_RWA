from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

JSON_TYPE = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


class PriceSnapshotRecord(Base):
    __tablename__ = "price_snapshots"
    __table_args__ = (UniqueConstraint("snapshot_id", name="uq_price_snapshots_snapshot_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_id: Mapped[str] = mapped_column(String(64), nullable=False)
    asset_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    asset_symbol: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    asset_address: Mapped[str | None] = mapped_column(String(128), nullable=True)
    chain_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    record_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    feed_id: Mapped[str | None] = mapped_column(String(130), nullable=True)
    price: Mapped[str | None] = mapped_column(String(78), nullable=True)
    confidence: Mapped[str | None] = mapped_column(String(78), nullable=True)
    publish_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ingest_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    observed_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    freshness_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    status_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status_reason: Mapped[str] = mapped_column(Text, nullable=False)
    derivation_method: Mapped[str | None] = mapped_column(String(128), nullable=True)
    raw_payload_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    metadata_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class QuoteSnapshotRecord(Base):
    __tablename__ = "quote_snapshots"
    __table_args__ = (UniqueConstraint("snapshot_id", name="uq_quote_snapshots_snapshot_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_id: Mapped[str] = mapped_column(String(64), nullable=False)
    protocol: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    route_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    route_type: Mapped[str] = mapped_column(String(64), nullable=False)
    token_in: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    token_out: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    chain_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    record_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    amount_in: Mapped[str] = mapped_column(String(78), nullable=False)
    quoted_amount_out: Mapped[str | None] = mapped_column(String(78), nullable=True)
    quoted_price: Mapped[str | None] = mapped_column(String(78), nullable=True)
    estimated_slippage_bps: Mapped[str | None] = mapped_column(String(78), nullable=True)
    route_depth_usd: Mapped[str | None] = mapped_column(String(78), nullable=True)
    quote_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    freshness_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    status_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status_reason: Mapped[str] = mapped_column(Text, nullable=False)
    raw_payload_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    metadata_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PortfolioSnapshotRecord(Base):
    __tablename__ = "portfolio_snapshots"
    __table_args__ = (UniqueConstraint("snapshot_id", name="uq_portfolio_snapshots_snapshot_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_id: Mapped[str] = mapped_column(String(64), nullable=False)
    portfolio_address: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    chain_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    base_currency: Mapped[str] = mapped_column(String(16), nullable=False)
    total_value_usd: Mapped[str | None] = mapped_column(String(78), nullable=True)
    invested_amount_usd: Mapped[str | None] = mapped_column(String(78), nullable=True)
    total_deposits_usd: Mapped[str | None] = mapped_column(String(78), nullable=True)
    total_withdrawals_usd: Mapped[str | None] = mapped_column(String(78), nullable=True)
    pnl_usd: Mapped[str | None] = mapped_column(String(78), nullable=True)
    pnl_percent: Mapped[str | None] = mapped_column(String(78), nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    status_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status_reason: Mapped[str] = mapped_column(Text, nullable=False)
    positions_json: Mapped[list] = mapped_column(JSON_TYPE, nullable=False, default=list)
    data_sources_json: Mapped[list] = mapped_column(JSON_TYPE, nullable=False, default=list)
    metadata_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class RiskAssessmentRecord(Base):
    __tablename__ = "risk_assessments"
    __table_args__ = (UniqueConstraint("assessment_id", name="uq_risk_assessments_assessment_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    assessment_id: Mapped[str] = mapped_column(String(64), nullable=False)
    asset: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    recommended_action: Mapped[str] = mapped_column(String(64), nullable=False)
    risk_score: Mapped[str] = mapped_column(String(32), nullable=False)
    risk_band: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    confidence: Mapped[str] = mapped_column(String(32), nullable=False)
    hard_veto_status: Mapped[str] = mapped_column(String(32), nullable=False)
    required_human_approval_status: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    status_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status_reason: Mapped[str] = mapped_column(Text, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    runtime_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    target_chain: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    freshness_status: Mapped[str] = mapped_column(String(64), nullable=False)
    reasoning_summary: Mapped[str] = mapped_column(Text, nullable=False)
    buckets_json: Mapped[list] = mapped_column(JSON_TYPE, nullable=False, default=list)
    data_sources_json: Mapped[list] = mapped_column(JSON_TYPE, nullable=False, default=list)
    notes_json: Mapped[list] = mapped_column(JSON_TYPE, nullable=False, default=list)
    metadata_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AllocationDecisionRecord(Base):
    __tablename__ = "allocation_decisions"
    __table_args__ = (UniqueConstraint("decision_id", name="uq_allocation_decisions_decision_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    decision_id: Mapped[str] = mapped_column(String(64), nullable=False)
    wallet_or_vault: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    profile_name: Mapped[str] = mapped_column(String(64), nullable=False)
    current_weights_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    target_weights_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    recommended_action: Mapped[str] = mapped_column(String(64), nullable=False)
    confidence: Mapped[float] = mapped_column(nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    risk_snapshot_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class TradeProposalRecord(Base):
    __tablename__ = "trade_proposals"
    __table_args__ = (UniqueConstraint("proposal_id", name="uq_trade_proposals_proposal_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    proposal_id: Mapped[str] = mapped_column(String(66), nullable=False)
    plan_hash: Mapped[str] = mapped_column(String(66), nullable=False)
    wallet_or_vault: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    router: Mapped[str] = mapped_column(String(128), nullable=False)
    selector: Mapped[str] = mapped_column(String(10), nullable=False)
    calldata_hash: Mapped[str] = mapped_column(String(66), nullable=False)
    token_in: Mapped[str] = mapped_column(String(128), nullable=False)
    token_out: Mapped[str] = mapped_column(String(128), nullable=False)
    recipient: Mapped[str] = mapped_column(String(128), nullable=False)
    max_amount_in: Mapped[str] = mapped_column(String(78), nullable=False)
    min_amount_out: Mapped[str] = mapped_column(String(78), nullable=False)
    native_value: Mapped[str] = mapped_column(String(78), nullable=False)
    deadline: Mapped[int] = mapped_column(BigInteger, nullable=False)
    proposal_expiry: Mapped[int] = mapped_column(BigInteger, nullable=False)
    nonce: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    risk_snapshot_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    calldata: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class InvestmentPlanRecord(Base):
    __tablename__ = "investment_plans"
    __table_args__ = (UniqueConstraint("proposal_id", name="uq_investment_plans_proposal_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    proposal_id: Mapped[str] = mapped_column(String(66), nullable=False, index=True)
    plan_id: Mapped[str] = mapped_column(String(66), nullable=False, index=True)
    portfolio_address: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    deposit_asset_symbol: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    deposit_amount: Mapped[str | None] = mapped_column(String(78), nullable=True)
    deposit_value_usd: Mapped[str | None] = mapped_column(String(78), nullable=True)
    plan_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class TradeExecutionRecord(Base):
    __tablename__ = "trade_executions"
    __table_args__ = (UniqueConstraint("proposal_id", name="uq_trade_executions_proposal_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    proposal_id: Mapped[str] = mapped_column(String(64), nullable=False)
    tx_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    quoted_amount_out: Mapped[str | None] = mapped_column(String(78), nullable=True)
    actual_amount_out: Mapped[str | None] = mapped_column(String(78), nullable=True)
    gas_used: Mapped[int | None] = mapped_column(nullable=True)
    realized_slippage_bps: Mapped[int | None] = mapped_column(nullable=True)
    status_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class VaultFlowRecord(Base):
    __tablename__ = "vault_flows"
    __table_args__ = (UniqueConstraint("flow_id", name="uq_vault_flows_flow_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    flow_id: Mapped[str] = mapped_column(String(64), nullable=False)
    vault_address: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    user_address: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    flow_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    asset_symbol: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    asset_address: Mapped[str | None] = mapped_column(String(128), nullable=True)
    asset_amount: Mapped[str | None] = mapped_column(String(78), nullable=True)
    usd_value: Mapped[str] = mapped_column(String(78), nullable=False)
    tx_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    metadata_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class StrategyTemplateRecord(Base):
    __tablename__ = "strategy_templates"
    __table_args__ = (UniqueConstraint("name", name="uq_strategy_templates_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    policy_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    is_system_template: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class StrategyDraftRecord(Base):
    __tablename__ = "strategy_drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_address: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    template_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    raw_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    extracted_policy_json: Mapped[dict | None] = mapped_column(JSON_TYPE, nullable=True)
    validation_status: Mapped[str] = mapped_column(String(32), nullable=False)
    validation_errors_json: Mapped[list] = mapped_column(JSON_TYPE, nullable=False, default=list)
    safety_score: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class StrategyVersionRecord(Base):
    __tablename__ = "strategy_versions"
    __table_args__ = (UniqueConstraint("version", name="uq_strategy_versions_version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    user_address: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    active_policy_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    raw_prompt_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    simulation_result_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    activated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)


class StrategyAuditEventRecord(Base):
    __tablename__ = "strategy_audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    strategy_version_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor: Mapped[str] = mapped_column(String(128), nullable=False)
    details_json: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class StrategySchedulerRecord(Base):
    __tablename__ = "scheduler_settings"
    __table_args__ = (UniqueConstraint("strategy_version_id", name="uq_scheduler_settings_strategy_version_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    strategy_version_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    market_check_interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    quote_refresh_interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    risk_recompute_interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    execution_window_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
