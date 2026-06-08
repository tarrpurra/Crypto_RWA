from __future__ import annotations

from collections import Counter
from decimal import Decimal
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from services.agent.app.api.allocation import get_allocation_recommendation
from services.agent.app.api.decisions import get_latest_decisions
from services.agent.app.api.health import service_status, system_readiness
from services.agent.app.api.investment_scope import InvestmentScopeInput
from services.agent.app.api.market import ingestion_status, latest_prices, latest_quotes, latest_usdy_oracle_status, market_routes
from services.agent.app.api.portfolio import current_portfolio
from services.agent.app.api.risk import current_risk
from services.agent.app.core import runtime_config
from services.agent.app.core.settings import get_settings
from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.schemas.reports import InvestmentReportResponse, ReportField, ReportSection
from services.agent.app.schemas.proposals import InvestmentPlanResponse
from services.agent.modules.market_data import fetch_portfolio_snapshot
from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.investment_plan_repository import InvestmentPlanRepository
from services.agent.repositories.db.models import TradeProposalRecord
from services.agent.repositories.db.session import create_session, init_db


class _ReportRequestCache:
    def __init__(self) -> None:
        self._values: dict[str, Any] = {}

    async def get_or_fetch(self, key: str, fetch_fn):
        if key not in self._values:
            self._values[key] = await fetch_fn()
        return self._values[key]


def _normalize_value(value: Any) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, (int, float, Decimal)):
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)
    return str(value)


def _field(label: str, value: Any, detail: str | None = None) -> ReportField:
    return ReportField(label=label, value=_normalize_value(value), detail=detail)


def _section(
    key: str,
    title: str,
    status: str,
    summary: str,
    *,
    fields: list[ReportField] | None = None,
    notes: list[str] | None = None,
) -> ReportSection:
    return ReportSection(
        key=key,
        title=title,
        status=status,
        summary=summary,
        fields=fields or [],
        notes=notes or [],
    )


def _table_from_fields(fields: list[ReportField]) -> str:
    lines = ["| Field | Value |", "| --- | --- |"]
    for item in fields:
        value = item.value if not item.detail else f"{item.value}<br /><sub>{item.detail}</sub>"
        lines.append(f"| {item.label} | {value} |")
    return "\n".join(lines)


def _format_notes(notes: list[str]) -> str:
    if not notes:
        return ""
    return "\n".join(f"- {note}" for note in notes)


def _section_markdown(section: ReportSection) -> str:
    lines = [f"## {section.title}", f"Status: `{section.status}`", "", section.summary]
    if section.fields:
        lines.extend(["", _table_from_fields(section.fields)])
    if section.notes:
        lines.extend(["", _format_notes(section.notes)])
    return "\n".join(lines).strip()


def _portfolio_notes(snapshot) -> list[str]:
    notes: list[str] = []
    for position in snapshot.positions[:3]:
        notes.append(
            f"{position.asset_symbol}: balance {position.balance or 'n/a'}, value {position.value_usd or 'n/a'}, status {position.status_code}"
        )
    return notes


def _risk_notes(assessment) -> list[str]:
    notes: list[str] = []
    for bucket in assessment.buckets[:4]:
        notes.append(f"{bucket.bucket}: {bucket.status} ({bucket.reason})")
    if assessment.notes:
        notes.extend(assessment.notes[:3])
    return notes


def _allocation_notes(response) -> list[str]:
    notes: list[str] = []
    for action in response.rebalance_actions[:4]:
        notes.append(f"{action.asset_symbol}: {action.action} {action.amount}")
    return notes


def _proposal_notes(records: list[TradeProposalRecord]) -> list[str]:
    notes: list[str] = []
    for record in records[:5]:
        notes.append(
            f"{record.proposal_id[:12]}... {record.token_in}->{record.token_out} status {record.status_code} nonce {record.nonce}"
        )
    return notes


def _plan_notes(plan: InvestmentPlanResponse | None) -> list[str]:
    if plan is None:
        return []
    notes: list[str] = []
    for step in plan.transaction_steps[:6]:
        notes.append(f"Step {step.step_index}: {step.step_type} - {step.description}")
    return notes


def _serialize_scope(scope: InvestmentScopeInput | None) -> dict[str, Any] | None:
    if scope is None:
        return None
    return {
        "wallet_address": scope.wallet_address,
        "deposit_asset_symbol": scope.deposit_asset_symbol,
        "deposit_amount": scope.deposit_amount,
        "risk_profile": scope.risk_profile,
        "allocation_mode": scope.allocation_mode,
    }


def _recent_proposals(wallet_address: str | None, limit: int = 5) -> list[TradeProposalRecord]:
    init_db()
    statement = select(TradeProposalRecord).order_by(TradeProposalRecord.created_at.desc()).limit(limit)
    if wallet_address:
        statement = statement.where(TradeProposalRecord.wallet_or_vault == wallet_address)

    with create_session() as session:
        return list(session.scalars(statement).all())


def _latest_plan_for_proposals(records: list[TradeProposalRecord]) -> InvestmentPlanResponse | None:
    if not records:
        return None
    repository = InvestmentPlanRepository()
    for record in records:
        plan = repository.get_plan_for_proposal(record.proposal_id)
        if plan is not None:
            return plan
    return None


def _append_gap(data_gaps: list[str], section: ReportSection, prefix: str | None = None) -> None:
    if section.status == "ok":
        return
    label = prefix or section.title
    data_gaps.append(f"{label}: {section.summary}")
    for note in section.notes:
        if note and note not in data_gaps:
            data_gaps.append(note)


async def build_investment_report(
    *,
    wallet_address: str | None = None,
    scope: InvestmentScopeInput | None = None,
) -> InvestmentReportResponse:
    settings = get_settings()
    generated_at = utc_now()
    report_id = f"report_{uuid4().hex}"
    download_name = f"aixrwa_report_{generated_at.strftime('%Y%m%d-%H%M%S')}.md"
    ai_mode = "Full access AI" if runtime_config.get_ai_decision_maker_enabled() else "Recommendation only"

    sections: list[ReportSection] = []
    data_gaps: list[str] = []
    request_cache = _ReportRequestCache()
    metadata: dict[str, Any] = {
        "report_id": report_id,
        "target_chain": settings.target_chain.value,
        "runtime_mode": settings.runtime_mode.value,
        "ai_mode": ai_mode,
        "ai_decision_maker_enabled": runtime_config.get_ai_decision_maker_enabled(),
        "scope": _serialize_scope(scope),
    }

    overview_fields = [
        _field("Wallet", wallet_address or "not connected"),
        _field("AI access", ai_mode),
        _field("Runtime mode", settings.runtime_mode.value),
        _field("Target chain", settings.target_chain.value),
        _field("Report generated", generated_at.isoformat()),
    ]
    if scope is not None:
        overview_fields.extend(
            [
                _field("Deposit asset", scope.deposit_asset_symbol),
                _field("Deposit amount", scope.deposit_amount),
                _field("Risk profile", scope.risk_profile),
                _field("Allocation mode", scope.allocation_mode),
            ]
        )
    sections.append(
        _section(
            "overview",
            "Overview",
            "ok",
            "Current runtime context for the wallet, AI access mode, and investment scope.",
            fields=overview_fields,
        )
    )

    portfolio_response = None
    portfolio_status = "degraded"
    try:
        portfolio_response = await request_cache.get_or_fetch(
            "portfolio",
            lambda: current_portfolio(wallet_address=wallet_address),
        )
        portfolio_status = portfolio_response.status
    except Exception as exc:
        fallback_snapshot = fetch_portfolio_snapshot(wallet_address=wallet_address, allow_env_fallback=False)
        metadata["portfolio_fallback_snapshot_id"] = fallback_snapshot.snapshot_id
        data_gaps.append(f"Portfolio snapshot unavailable: {exc}")

    if portfolio_response is not None:
        portfolio_fields = [
            _field("Status", portfolio_response.status),
            _field("Status code", portfolio_response.status_code),
            _field("Total value", f"${portfolio_response.total_value_usd}" if portfolio_response.total_value_usd else "n/a"),
            _field("Positions", len(portfolio_response.positions)),
            _field("Data sources", ", ".join(portfolio_response.data_sources_used) if portfolio_response.data_sources_used else "none"),
        ]
        portfolio_section = _section(
            "portfolio",
            "Wallet Snapshot",
            portfolio_status,
            portfolio_response.status_reason,
            fields=portfolio_fields,
            notes=_portfolio_notes(portfolio_response),
        )
    else:
        portfolio_section = _section(
            "portfolio",
            "Wallet Snapshot",
            "degraded",
            "The current wallet snapshot could not be loaded.",
            fields=[
                _field("Wallet", wallet_address or "not connected"),
                _field("Status code", DataStatusCode.DATA_MISSING.value),
            ],
            notes=["No live wallet portfolio was available for report generation."],
        )
    sections.append(portfolio_section)
    _append_gap(data_gaps, portfolio_section)

    scope_query = None
    if scope is not None:
        scope_query = {
            "wallet_address": scope.wallet_address,
            "deposit_asset_symbol": scope.deposit_asset_symbol,
            "deposit_amount": scope.deposit_amount,
            "risk_profile": scope.risk_profile,
            "allocation_mode": scope.allocation_mode,
        }
        sections.append(
            _section(
                "scope",
                "Investment Scope",
                "ok",
                "The scoped investment preview is ready for review.",
                fields=[
                    _field("Wallet", scope.wallet_address or wallet_address or "not connected"),
                    _field("Deposit asset", scope.deposit_asset_symbol),
                    _field("Deposit amount", scope.deposit_amount),
                    _field("Risk profile", scope.risk_profile),
                    _field("Allocation mode", scope.allocation_mode),
                ],
                notes=[
                    "This scope drives the recommendation-only review path and the full-access AI execution path.",
                ],
            )
        )

    risk_response = None
    try:
        risk_key = f"risk:{wallet_address}:{scope_query!r}"
        risk_response = await request_cache.get_or_fetch(
            risk_key,
            lambda: current_risk(
                wallet_address=wallet_address,
                allow_env_fallback=False,
                **(scope_query or {}),
            ),
        )
    except Exception as exc:
        data_gaps.append(f"Risk assessment unavailable: {exc}")

    if risk_response is not None:
        risk_section = _section(
            "risk",
            "Risk View" if scope is None else "Scoped Risk View",
            risk_response.status,
            risk_response.status_reason,
            fields=[
                _field("Action", risk_response.recommended_action),
                _field("Risk score", risk_response.risk_score),
                _field("Risk band", risk_response.risk_band),
                _field("Confidence", f"{risk_response.confidence * 100:.1f}%"),
                _field("Hard veto", risk_response.hard_veto_status),
                _field("Freshness", risk_response.freshness_status),
            ],
            notes=_risk_notes(risk_response),
        )
    else:
        risk_section = _section(
            "risk",
            "Risk View" if scope is None else "Scoped Risk View",
            "degraded",
            "The risk engine could not return a view for this report.",
            fields=[_field("Status code", DataStatusCode.DATA_MISSING.value)],
            notes=["Risk analysis is unavailable until the portfolio and market surfaces can be read."],
        )
    sections.append(risk_section)
    _append_gap(data_gaps, risk_section)

    allocation_response = None
    try:
        allocation_key = f"allocation:{wallet_address}:{scope_query!r}"
        allocation_response = await request_cache.get_or_fetch(
            allocation_key,
            lambda: get_allocation_recommendation(
                wallet_address=wallet_address,
                **(scope_query or {}),
            ),
        )
    except Exception as exc:
        data_gaps.append(f"Allocation recommendation unavailable: {exc}")

    if allocation_response is not None:
        allocation_section = _section(
            "allocation",
            "Allocation Planner" if scope is None else "Scoped Allocation Planner",
            allocation_response.status,
            allocation_response.status_reason,
            fields=[
                _field("Decision", allocation_response.decision.recommended_action),
                _field("Profile", allocation_response.decision.profile_name),
                _field("Confidence", f"{allocation_response.decision.confidence * 100:.1f}%"),
                _field("Actions", len(allocation_response.rebalance_actions)),
            ],
            notes=_allocation_notes(allocation_response),
        )
    else:
        allocation_section = _section(
            "allocation",
            "Allocation Planner" if scope is None else "Scoped Allocation Planner",
            "degraded",
            "The allocation planner could not build a recommendation.",
            fields=[_field("Status code", DataStatusCode.DATA_MISSING.value)],
            notes=["No allocation recommendation was generated for this report."],
        )
    sections.append(allocation_section)
    _append_gap(data_gaps, allocation_section)

    decision_response = None
    try:
        decision_key = f"decision:{wallet_address}:{scope_query!r}"
        decision_response = await request_cache.get_or_fetch(
            decision_key,
            lambda: get_latest_decisions(
                wallet_address=wallet_address,
                **(scope_query or {}),
            ),
        )
    except Exception as exc:
        data_gaps.append(f"Recommendation engine unavailable: {exc}")

    if decision_response is not None:
        decision_section = _section(
            "decision",
            "Recommendation Engine" if scope is None else "Scoped Recommendation Engine",
            decision_response.status,
            decision_response.status_reason,
            fields=[
                _field("Recommended action", decision_response.recommended_action),
                _field("Risk score", decision_response.risk_score),
                _field("Confidence", f"{decision_response.confidence * 100:.1f}%"),
                _field("Hard veto", decision_response.hard_veto_status),
                _field("Human approval", decision_response.required_human_approval_status),
                _field("Data sources", ", ".join(decision_response.data_sources_used) if decision_response.data_sources_used else "none"),
            ],
            notes=[
                decision_response.reasoning_summary,
                *decision_response.notes[:3],
            ],
        )
    else:
        decision_section = _section(
            "decision",
            "Recommendation Engine" if scope is None else "Scoped Recommendation Engine",
            "degraded",
            "The recommendation engine could not produce an output.",
            fields=[_field("Status code", DataStatusCode.DATA_MISSING.value)],
            notes=["Recommendation output is unavailable until the AI and data surfaces recover."],
        )
    sections.append(decision_section)
    _append_gap(data_gaps, decision_section)

    system_status_response = None
    readiness_response = None
    try:
        system_status_response = await service_status()
    except Exception as exc:
        data_gaps.append(f"Service status unavailable: {exc}")
    try:
        readiness_response = await system_readiness()
    except Exception as exc:
        data_gaps.append(f"System readiness unavailable: {exc}")

    if system_status_response is not None and readiness_response is not None:
        readiness_tokens = readiness_response.tokens
        token_ready_count = sum(1 for token in readiness_tokens.values() if token.code_exists and token.symbol_ok)
        system_section = _section(
            "system",
            "System Readiness",
            system_status_response.status,
            system_status_response.status_reason,
            fields=[
                _field("Chain id", system_status_response.chain_id),
                _field("RPC URL", system_status_response.rpc_url),
                _field("AI access", "Full access AI" if system_status_response.ai_decision_maker_enabled else "Recommendation only"),
                _field("Contracts configured", sum(1 for value in system_status_response.configured_contracts.values() if value)),
                _field("Token readiness", f"{token_ready_count}/{len(readiness_tokens)}"),
            ],
            notes=[
                f"Execution mode: {readiness_response.execution.mode}",
                *(
                    [
                        f"{token_name}: {'ready' if token.code_exists and token.symbol_ok else 'unverified'}"
                        for token_name, token in readiness_tokens.items()
                    ]
                    if readiness_tokens
                    else []
                ),
            ],
        )
    else:
        system_section = _section(
            "system",
            "System Readiness",
            "degraded",
            "The backend status endpoints could not be loaded.",
            fields=[_field("Status code", DataStatusCode.DATA_MISSING.value)],
            notes=["System diagnostics are unavailable for this report."],
        )
    sections.append(system_section)
    _append_gap(data_gaps, system_section)

    market_section_fields: list[ReportField] = []
    market_notes: list[str] = []
    market_status = "degraded"
    market_summary = "Market diagnostics are unavailable."
    try:
        market_ingestion = await request_cache.get_or_fetch("market_ingestion", ingestion_status)
        market_section_fields.extend(
            [
                _field("Ingestion status", market_ingestion.status),
                _field("Assets configured", len(market_ingestion.assets)),
                _field("Data sources", ", ".join(sorted({source for asset in market_ingestion.assets for source in asset.required_sources})) or "none"),
            ]
        )
        market_summary = market_ingestion.status_reason
        market_status = market_ingestion.status
        market_notes.extend(f"{asset.asset_symbol}: {asset.status} ({asset.status_reason})" for asset in market_ingestion.assets[:5])
    except Exception as exc:
        data_gaps.append(f"Market ingestion unavailable: {exc}")

    try:
        routes_response = await request_cache.get_or_fetch("market_routes", market_routes)
        market_section_fields.extend(
            [
                _field("Routes", len(routes_response.routes)),
                _field("Route status", routes_response.status),
            ]
        )
        if not market_summary or market_summary == "Market diagnostics are unavailable.":
            market_summary = routes_response.status_reason
        market_notes.extend(
            f"{route.protocol} {route.token_in}->{route.token_out} {route.verification_state}"
            for route in routes_response.routes[:5]
        )
    except Exception as exc:
        data_gaps.append(f"Route discovery unavailable: {exc}")

    try:
        prices_response = await request_cache.get_or_fetch("market_prices", latest_prices)
        market_section_fields.extend(
            [
                _field("Price snapshots", len(prices_response.prices)),
                _field("Price status", prices_response.status),
            ]
        )
        market_notes.extend(
            f"{price.asset_symbol}: {price.price_usd or 'n/a'} ({price.status_code})"
            for price in prices_response.prices[:5]
        )
    except Exception as exc:
        data_gaps.append(f"Price ingestion unavailable: {exc}")

    try:
        quotes_response = await request_cache.get_or_fetch("market_quotes", latest_quotes)
        market_section_fields.extend(
            [
                _field("Quote snapshots", len(quotes_response.quotes)),
                _field("Quote status", quotes_response.status),
            ]
        )
        market_notes.extend(
            f"{quote.token_in_symbol}->{quote.token_out_symbol}: {quote.status_code}"
            for quote in quotes_response.quotes[:5]
        )
    except Exception as exc:
        data_gaps.append(f"Quote ingestion unavailable: {exc}")

    try:
        oracle_status = latest_usdy_oracle_status()
        market_section_fields.append(_field("USDY oracle", oracle_status.status))
        market_notes.append(f"USDY oracle price: {oracle_status.price or 'n/a'}")
    except Exception as exc:
        data_gaps.append(f"USDY oracle unavailable: {exc}")

    if market_section_fields:
        market_section = _section(
            "market",
            "Market Health",
            market_status,
            market_summary,
            fields=market_section_fields,
            notes=market_notes,
        )
    else:
        market_section = _section(
            "market",
            "Market Health",
            "degraded",
            "No market diagnostics were available.",
            fields=[_field("Status code", DataStatusCode.DATA_MISSING.value)],
        )
    sections.append(market_section)
    _append_gap(data_gaps, market_section)

    proposal_wallet = wallet_address or (scope.wallet_address if scope is not None else None)
    proposal_records = _recent_proposals(proposal_wallet)
    latest_plan = _latest_plan_for_proposals(proposal_records)
    if latest_plan is not None:
        metadata["latest_plan_id"] = latest_plan.plan_id
        metadata["latest_plan_status"] = latest_plan.status_code

    execution_fields = [
        _field("Tracked proposals", len(proposal_records)),
        _field("Latest plan", latest_plan.plan_id if latest_plan else "none"),
        _field("Approval enabled", latest_plan.approval_enabled if latest_plan else False),
        _field("Linked proposals", len(latest_plan.linked_proposals) if latest_plan else 0),
    ]
    execution_notes = _proposal_notes(proposal_records)
    execution_notes.extend(_plan_notes(latest_plan))
    if latest_plan is not None and latest_plan.approval_blockers:
        execution_notes.extend(f"Blocker: {blocker}" for blocker in latest_plan.approval_blockers)

    execution_status = "ok"
    execution_summary = "Execution state loaded."
    if latest_plan is not None and latest_plan.status != "ok":
        execution_status = latest_plan.status
        execution_summary = latest_plan.status_reason
        data_gaps.append(f"Execution planning: {latest_plan.status_reason}")
    elif not proposal_records:
        execution_status = "ok"
        execution_summary = "No recent proposals were found for the current wallet."

    execution_section = _section(
        "execution",
        "Execution Queue",
        execution_status,
        execution_summary,
        fields=execution_fields,
        notes=execution_notes,
    )
    sections.append(execution_section)
    _append_gap(data_gaps, execution_section)

    proposals_by_status = Counter(record.status_code for record in proposal_records)
    proposal_section = _section(
        "proposals",
        "Recent Proposals",
        "ok",
        "Most recent proposal records for the active wallet.",
        fields=[
            _field("Total proposals", len(proposal_records)),
            _field("Distinct statuses", len(proposals_by_status)),
        ],
        notes=_proposal_notes(proposal_records),
    )
    if not proposal_records:
        proposal_section = proposal_section.model_copy(
            update={
                "summary": "No recent proposals were found for the current wallet.",
                "notes": ["No proposal queue entries were available for this report."],
            }
        )
    sections.append(proposal_section)
    _append_gap(data_gaps, proposal_section)

    overall_status = "ok" if not data_gaps else "degraded"
    overall_status_code = DataStatusCode.DATA_FRESH.value if not data_gaps else DataStatusCode.DATA_PARTIAL.value
    overall_reason = "Detailed investment report generated successfully."
    if data_gaps:
        overall_reason = "Detailed investment report generated. Missing data sources are listed below."

    markdown_sections = [
        "# AIxRWA Investment Report",
        f"Generated at: `{generated_at.isoformat()}`",
        f"AI access: `{ai_mode}`",
    ]
    if wallet_address:
        markdown_sections.append(f"Wallet: `{wallet_address}`")
    if scope is not None:
        markdown_sections.append(
            f"Scope: `{scope.deposit_asset_symbol}` / `{scope.deposit_amount}` / `{scope.risk_profile}` / `{scope.allocation_mode}`"
        )
    markdown_sections.append("")
    markdown_sections.extend(_section_markdown(section) for section in sections)
    if data_gaps:
        markdown_sections.extend(
            [
                "## Missing Data",
                *[f"- {gap}" for gap in data_gaps],
            ]
        )

    metadata["proposal_status_counts"] = dict(proposals_by_status)
    metadata["data_gaps"] = list(data_gaps)

    return InvestmentReportResponse(
        status=overall_status,
        status_code=overall_status_code,
        status_label=overall_status_code,
        status_reason=overall_reason,
        generated_at=generated_at,
        report_id=report_id,
        download_name=download_name,
        wallet_address=wallet_address,
        ai_decision_maker_enabled=runtime_config.get_ai_decision_maker_enabled(),
        ai_mode=ai_mode,
        sections=sections,
        data_gaps=data_gaps,
        markdown="\n\n".join(markdown_sections).strip() + "\n",
        metadata=metadata,
    )
