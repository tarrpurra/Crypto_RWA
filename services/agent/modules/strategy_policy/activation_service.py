from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException

from services.agent.app.core.status_codes import DataStatusCode
from services.agent.modules.oracle.freshness import utc_now
from services.agent.modules.strategy_policy.policy_extractor import extract_policy
from services.agent.modules.strategy_policy.policy_validator import PolicyValidationResult, validate_policy
from services.agent.modules.strategy_policy.prompt_safety import SafetyScanResult, scan_prompt
from services.agent.modules.strategy_policy.repository import StrategyPolicyRepository
from services.agent.modules.strategy_policy.schemas import (
    StrategyActiveResponse,
    StrategyAuditListResponse,
    StrategyDraftResponse,
    StrategyPolicyDraftRequest,
    StrategyPolicyConfig,
    StrategySchedulerSettingsResponse,
    StrategySimulationResponse,
    StrategyTemplateListResponse,
    StrategyValidationResponse,
    StrategyVersionListResponse,
    StrategyActiveVersionUpdateRequest,
)
from services.agent.modules.strategy_policy.simulation_runner import SimulationContext, run_simulation
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.repositories.db.risk_repository import RiskAssessmentRepository


@dataclass(frozen=True)
class StrategyEvaluation:
    scan: SafetyScanResult
    validation: PolicyValidationResult
    policy_json: StrategyPolicyConfig


class StrategyActivationService:
    def __init__(self) -> None:
        self.repository = StrategyPolicyRepository()

    def templates(self) -> StrategyTemplateListResponse:
        templates = self.repository.list_templates()
        return StrategyTemplateListResponse(
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="Strategy templates loaded.",
            templates=templates,
        )

    def versions(self, user_address: str | None = None) -> StrategyVersionListResponse:
        return StrategyVersionListResponse(
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="Strategy versions loaded.",
            versions=self.repository.list_versions(),
        )

    def audit(self, version: str | None = None) -> StrategyAuditListResponse:
        strategy_version = None
        if version:
            matched = next((item.id for item in self.repository.list_versions() if item.version == version), None)
            if matched is None:
                raise HTTPException(status_code=404, detail={"status": "rejected", "message": f"Strategy version not found: {version}"})
            strategy_version = matched
        return StrategyAuditListResponse(
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="Strategy audit trail loaded.",
            events=self.repository.list_audit_events(strategy_version_id=strategy_version),
        )

    def active_state(self, user_address: str | None = None) -> StrategyActiveResponse:
        active_version = self.repository.get_active_version()
        scheduler = None
        if active_version is not None:
            scheduler = self.repository.get_scheduler(strategy_version_id=active_version.id)
        versions = self.repository.list_versions()
        audit_events = self.repository.list_audit_events(strategy_version_id=active_version.id if active_version else None)
        templates = self.repository.list_templates()
        last_validation = self.repository.latest_validation(user_address=user_address)
        latest_simulation = self._latest_simulation_from_draft(user_address=user_address, last_validation=last_validation)
        return StrategyActiveResponse(
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="Active strategy loaded.",
            active_version=active_version,
            scheduler=scheduler,
            templates=templates,
            versions=versions,
            audit_events=audit_events,
            last_validation=last_validation,
            latest_simulation=latest_simulation,
        )

    def draft(self, request: StrategyPolicyDraftRequest) -> StrategyDraftResponse:
        evaluation = self._evaluate(request)
        draft = self.repository.save_draft(
            user_address=request.user_address,
            raw_prompt=request.strategy_text,
            extracted_policy_json=evaluation.policy_json,
            validation_status=evaluation.validation.status,
            validation_errors_json=[error.model_dump(mode="json") for error in evaluation.validation.validation_errors],
            safety_score=evaluation.validation.safety_score,
            template_id=request.template_id,
        )
        self.repository.save_audit_event(
            strategy_version_id=None,
            event_type="draft_saved" if evaluation.validation.is_valid else "draft_rejected",
            actor=request.actor or request.user_address or "operator",
            details_json={
                "safety_score": evaluation.validation.safety_score,
                "validation_status": evaluation.validation.status,
                "errors": [error.model_dump(mode="json") for error in evaluation.validation.validation_errors],
                "template_id": request.template_id,
            },
        )
        return draft

    def validate(self, request: StrategyPolicyDraftRequest) -> StrategyValidationResponse:
        draft = self.draft(request)
        return StrategyValidationResponse(
            status="ok" if draft.validation_status == "validated" else "error",
            status_code="VALIDATED" if draft.validation_status == "validated" else "REJECTED",
            status_label="VALIDATED" if draft.validation_status == "validated" else "REJECTED",
            status_reason="Strategy policy validated." if draft.validation_status == "validated" else "Strategy policy validation failed.",
            draft_id=draft.draft_id,
            user_address=draft.user_address,
            raw_prompt=draft.raw_prompt,
            safety_score=draft.safety_score,
            validation_errors=draft.validation_errors,
            extracted_policy_json=draft.extracted_policy_json,
            requires_simulation=draft.validation_status == "validated",
            safe_suggestion="Describe only portfolio objectives, allowed assets, hard limits, and monitoring cadence.",
        )

    def simulate(self, request: StrategyPolicyDraftRequest) -> StrategySimulationResponse:
        draft = self.draft(request)
        policy = draft.extracted_policy_json or extract_policy(request.strategy_text, template_name=None, policy_json=request.policy_json)
        simulation = run_simulation(
            policy,
            SimulationContext(
                current_risk_score=self._latest_risk_score(),
                current_quote_slippage_bps=self._latest_quote_slippage_bps(),
                market_fresh=self._market_context_is_fresh(),
                data_sources_used=self._latest_data_sources(),
            ),
        )
        self.repository.save_audit_event(
            strategy_version_id=None,
            event_type="simulated",
            actor=request.actor or request.user_address or "operator",
            details_json={
                "safety_score": draft.safety_score,
                "simulation": simulation.model_dump(mode="json"),
                "template_id": request.template_id,
            },
        )
        return StrategySimulationResponse(
            status="ok" if draft.validation_status == "validated" else "degraded",
            status_code="SIMULATED" if draft.validation_status == "validated" else "SIMULATED_WITH_ERRORS",
            status_label="SIMULATED" if draft.validation_status == "validated" else "SIMULATED_WITH_ERRORS",
            status_reason="Strategy policy simulated against backend context.",
            draft_id=draft.draft_id,
            user_address=draft.user_address,
            raw_prompt=draft.raw_prompt,
            safety_score=draft.safety_score,
            extracted_policy_json=policy,
            simulation=simulation,
            market_context=self._market_context_payload(),
            risk_context=self._risk_context_payload(),
            validation_errors=draft.validation_errors,
            safe_suggestion="Describe only portfolio objectives, allowed assets, hard limits, and monitoring cadence.",
        )

    def activate(self, request: StrategyPolicyDraftRequest) -> StrategyActiveResponse:
        draft = self.draft(request)
        if draft.validation_status != "validated":
            raise HTTPException(
                status_code=400,
                detail={
                    "status": "rejected",
                    "safety_score": draft.safety_score,
                    "errors": [error.model_dump(mode="json") for error in draft.validation_errors],
                    "safe_suggestion": "Describe only portfolio objectives, allowed assets, hard limits, and monitoring cadence.",
                },
            )

        policy = draft.extracted_policy_json or extract_policy(request.strategy_text, template_name=None, policy_json=request.policy_json)
        simulation = run_simulation(
            policy,
            SimulationContext(
                current_risk_score=self._latest_risk_score(),
                current_quote_slippage_bps=self._latest_quote_slippage_bps(),
                market_fresh=self._market_context_is_fresh(),
                data_sources_used=self._latest_data_sources(),
            ),
        )
        blockers = [
            finding
            for finding in simulation.critical_findings
            if "Global circuit breaker" in finding or "stale" in finding.lower() or "No allowed assets" in finding
        ]
        if simulation.recommendation == "reject" or blockers:
            raise HTTPException(
                status_code=400,
                detail={
                    "status": "rejected",
                    "safety_score": draft.safety_score,
                    "errors": [error.model_dump(mode="json") for error in draft.validation_errors],
                    "simulation": simulation.model_dump(mode="json"),
                    "safe_suggestion": "Describe only portfolio objectives, allowed assets, hard limits, and monitoring cadence.",
                },
            )

        version = self._next_version_name(policy.strategy_version, request.user_address)
        active_policy = policy.model_copy(update={"strategy_version": version})
        version_record = self.repository.save_version(
            version=version,
            user_address=request.user_address,
            active_policy_json=active_policy,
            raw_prompt_snapshot=request.strategy_text,
            simulation_result_json=simulation.model_dump(mode="json"),
            activated_by=request.actor or request.user_address,
            status="active",
        )
        scheduler = self.repository.save_scheduler(
            strategy_version_id=version_record.id,
            market_check_interval_seconds=active_policy.market_check_interval_seconds,
            quote_refresh_interval_seconds=active_policy.quote_refresh_interval_seconds,
            risk_recompute_interval_seconds=active_policy.risk_recompute_interval_seconds,
            execution_window_seconds=active_policy.proposal_expiry_seconds,
        )
        self.repository.save_audit_event(
            strategy_version_id=version_record.id,
            event_type="activated",
            actor=request.actor or request.user_address or "operator",
            details_json={
                "simulation": simulation.model_dump(mode="json"),
                "scheduler": scheduler.model_dump(mode="json"),
            },
        )
        return self.active_state(user_address=request.user_address)

    def update_active(self, request: StrategyActiveVersionUpdateRequest) -> StrategyActiveResponse:
        draft_request = StrategyPolicyDraftRequest(
            user_address=request.user_address,
            strategy_text=request.strategy_text,
            policy_json=request.policy_json,
            template_id=request.template_id,
            actor=request.actor,
        )
        return self.activate(draft_request)

    def revert(self, version: str, actor: str | None = None) -> StrategyActiveResponse:
        reverted = self.repository.revert_version(version, actor=actor)
        if reverted is None:
            raise HTTPException(status_code=404, detail={"status": "rejected", "message": f"Strategy version not found: {version}"})
        record = self.repository.get_active_version_record()
        if record is not None:
            self.repository.save_audit_event(
                strategy_version_id=record.id,
                event_type="reverted",
                actor=actor or "operator",
                details_json={"version": version},
            )
        return self.active_state()

    def update_scheduler(self, version: str | None, market_check_interval_seconds: int, quote_refresh_interval_seconds: int, risk_recompute_interval_seconds: int, execution_window_seconds: int, actor: str | None = None) -> StrategySchedulerSettingsResponse:
        active_version = self.repository.get_active_version_record()
        if version:
            active_version = next((record for record in self._version_records() if record.version == version), None)
        if active_version is None:
            raise HTTPException(status_code=404, detail={"status": "rejected", "message": "No active strategy version is available."})
        scheduler = self.repository.save_scheduler(
            strategy_version_id=active_version.id,
            market_check_interval_seconds=market_check_interval_seconds,
            quote_refresh_interval_seconds=quote_refresh_interval_seconds,
            risk_recompute_interval_seconds=risk_recompute_interval_seconds,
            execution_window_seconds=execution_window_seconds,
        )
        self.repository.save_audit_event(
            strategy_version_id=active_version.id,
            event_type="scheduler_updated",
            actor=actor or "operator",
            details_json=scheduler.model_dump(mode="json"),
        )
        return scheduler

    def _evaluate(self, request: StrategyPolicyDraftRequest) -> StrategyEvaluation:
        template = self.repository.get_template(request.template_id)
        scan = scan_prompt(request.strategy_text)
        policy = extract_policy(
            request.strategy_text,
            template_name=template.name if template else None,
            policy_json=request.policy_json,
        )
        active_version = self.repository.get_active_version()
        baseline = active_version.active_policy_json if active_version else None
        validation = validate_policy(policy, scan=scan, baseline=baseline)
        return StrategyEvaluation(scan=scan, validation=validation, policy_json=policy)

    def _latest_risk_score(self) -> float | None:
        latest = RiskAssessmentRepository().latest_assessment()
        if latest is None:
            return None
        return float(latest.risk_score_normalized if hasattr(latest, "risk_score_normalized") else latest.risk_score)

    def _latest_quote_slippage_bps(self) -> int | None:
        try:
            quotes = MarketDataRepository().latest_normalized_quotes()
        except Exception:
            return None
        values: list[int] = []
        for quote in quotes:
            try:
                if quote.estimated_slippage_bps is not None:
                    values.append(int(float(quote.estimated_slippage_bps)))
            except (TypeError, ValueError):
                continue
        return max(values) if values else None

    def _market_context_is_fresh(self) -> bool:
        try:
            prices = MarketDataRepository().latest_normalized_prices()
            quotes = MarketDataRepository().latest_normalized_quotes()
        except Exception:
            return False
        return bool(prices) and bool(quotes)

    def _latest_data_sources(self) -> list[str]:
        sources: set[str] = set()
        try:
            for price in MarketDataRepository().latest_normalized_prices():
                sources.update(price.data_sources_used)
            for quote in MarketDataRepository().latest_normalized_quotes():
                sources.update(quote.data_sources_used)
        except Exception:
            pass
        latest_risk = RiskAssessmentRepository().latest_assessment()
        if latest_risk:
            sources.update(latest_risk.data_sources_used)
        return sorted(sources)

    def _market_context_payload(self) -> dict[str, object]:
        return {
            "fresh": self._market_context_is_fresh(),
            "latest_risk_score": self._latest_risk_score(),
            "latest_quote_slippage_bps": self._latest_quote_slippage_bps(),
            "data_sources_used": self._latest_data_sources(),
        }

    def _risk_context_payload(self) -> dict[str, object]:
        latest = RiskAssessmentRepository().latest_assessment()
        if latest is None:
            return {"status": "missing", "status_code": DataStatusCode.DATA_MISSING.value}
        return {
            "status": latest.status,
            "status_code": latest.status_code,
            "risk_band": latest.risk_band,
            "risk_score": latest.risk_score,
            "hard_veto_status": latest.hard_veto_status,
            "required_human_approval_status": latest.required_human_approval_status,
        }

    def _version_records(self) -> list:
        with create_session() as session:
            from sqlalchemy import select

            from services.agent.repositories.db.models import StrategyVersionRecord

            return session.scalars(select(StrategyVersionRecord)).all()

    def _next_version_name(self, base_version: str, user_address: str | None) -> str:
        suffix = utc_now().strftime("%Y%m%d%H%M%S")
        user_fragment = (user_address or "system").lower().replace("0x", "")[:8]
        return f"{base_version}-{user_fragment}-{suffix}"

    def _latest_simulation_from_draft(
        self,
        *,
        user_address: str | None = None,
        last_validation: StrategyValidationResponse | None = None,
    ) -> StrategySimulationResponse | None:
        draft = self.repository.latest_draft(user_address=user_address)
        if draft is None or draft.extracted_policy_json is None:
            return None
        simulation = run_simulation(
            draft.extracted_policy_json,
            SimulationContext(
                current_risk_score=self._latest_risk_score(),
                current_quote_slippage_bps=self._latest_quote_slippage_bps(),
                market_fresh=self._market_context_is_fresh(),
                data_sources_used=self._latest_data_sources(),
            ),
        )
        return StrategySimulationResponse(
            status="ok" if (last_validation is None or last_validation.status == "ok") else "degraded",
            status_code="SIMULATED",
            status_label="SIMULATED",
            status_reason="Latest simulation snapshot.",
            draft_id=draft.draft_id,
            user_address=draft.user_address,
            raw_prompt=draft.raw_prompt,
            safety_score=draft.safety_score,
            extracted_policy_json=draft.extracted_policy_json,
            simulation=simulation,
            market_context=self._market_context_payload(),
            risk_context=self._risk_context_payload(),
            validation_errors=draft.validation_errors,
            safe_suggestion="Describe only portfolio objectives, allowed assets, hard limits, and monitoring cadence.",
        )
