from __future__ import annotations

from datetime import datetime
import re
from typing import Any

from sqlalchemy import func, select

from services.agent.modules.oracle.freshness import utc_now
from services.agent.modules.strategy_policy.policy_extractor import DEFAULT_POLICY, TEMPLATE_PRESETS
from services.agent.modules.strategy_policy.schemas import (
    StrategyAuditEventResponse,
    StrategyDraftResponse,
    StrategyPolicyConfig,
    StrategySchedulerSettingsResponse,
    StrategySimulationResponse,
    StrategyTemplateSummary,
    StrategyValidationError,
    StrategyValidationResponse,
    StrategyVersionRecordResponse,
)
from services.agent.repositories.db.models import (
    StrategyAuditEventRecord,
    StrategyDraftRecord,
    StrategySchedulerRecord,
    StrategyTemplateRecord,
    StrategyVersionRecord,
)
from services.agent.repositories.db.session import create_session, init_db


class StrategyPolicyRepository:
    def __init__(self) -> None:
        init_db()
        self.ensure_seed_state()

    def ensure_seed_state(self) -> None:
        with create_session() as session:
            existing_templates = {
                record.name: record
                for record in session.scalars(select(StrategyTemplateRecord)).all()
            }
            for name, policy in TEMPLATE_PRESETS.items():
                normalized_policy = self._normalize_policy_config(policy)
                normalized_prompt = self._normalize_strategy_text(self._template_prompt_text(name, normalized_policy))
                existing = existing_templates.get(name)
                if existing is None:
                    session.add(
                        StrategyTemplateRecord(
                            name=name,
                            description=normalized_policy.notes[0] if normalized_policy.notes else name,
                            category="policy_template",
                            prompt_text=normalized_prompt,
                            policy_json=normalized_policy.model_dump(mode="json"),
                            is_system_template=True,
                            created_at=utc_now(),
                        )
                    )
                else:
                    existing.description = normalized_policy.notes[0] if normalized_policy.notes else name
                    existing.category = "policy_template"
                    existing.prompt_text = normalized_prompt
                    existing.policy_json = normalized_policy.model_dump(mode="json")
                    existing.is_system_template = True

            if session.scalar(select(func.count(StrategyVersionRecord.id))) == 0:
                normalized_default_policy = self._normalize_policy_config(DEFAULT_POLICY)
                default_version = StrategyVersionRecord(
                    version=normalized_default_policy.strategy_version,
                    user_address=None,
                    active_policy_json=normalized_default_policy.model_dump(mode="json"),
                    raw_prompt_snapshot=self._normalize_strategy_text("Seeded default strategy policy."),
                    simulation_result_json={
                        "expected_risk_score": 24,
                        "expected_slippage_bps": normalized_default_policy.hard_limits.max_slippage_bps,
                        "expected_human_approval_required": True,
                        "expected_pause_required": False,
                        "recommendation": "approve",
                        "critical_findings": [],
                        "protective_actions": ["allow_activation_with_monitoring"],
                        "data_sources_used": [],
                    },
                    activated_by="system",
                    activated_at=utc_now(),
                    status="active",
                )
                session.add(default_version)
                session.flush()
                session.add(
                    StrategySchedulerRecord(
                        strategy_version_id=default_version.id,
                        market_check_interval_seconds=normalized_default_policy.market_check_interval_seconds,
                        quote_refresh_interval_seconds=normalized_default_policy.quote_refresh_interval_seconds,
                        risk_recompute_interval_seconds=normalized_default_policy.risk_recompute_interval_seconds,
                        execution_window_seconds=normalized_default_policy.proposal_expiry_seconds,
                        updated_at=utc_now(),
                    )
                )
                session.add(
                    StrategyAuditEventRecord(
                        strategy_version_id=default_version.id,
                        event_type="seeded",
                        actor="system",
                        details_json={"status": "seeded_default_policy"},
                        created_at=utc_now(),
                    )
                )
            else:
                for record in session.scalars(select(StrategyVersionRecord)).all():
                    record.active_policy_json = self._normalize_policy_payload(record.active_policy_json)
                    record.raw_prompt_snapshot = self._normalize_strategy_text(record.raw_prompt_snapshot)

            for record in session.scalars(select(StrategyDraftRecord)).all():
                record.raw_prompt = self._normalize_strategy_text(record.raw_prompt)
                record.extracted_policy_json = self._normalize_policy_payload(record.extracted_policy_json)
            session.commit()

    def list_templates(self) -> list[StrategyTemplateSummary]:
        with create_session() as session:
            records = session.scalars(select(StrategyTemplateRecord).order_by(StrategyTemplateRecord.created_at.asc())).all()
        return [self._template_from_record(record) for record in records]

    def get_template(self, template_id: int | None) -> StrategyTemplateSummary | None:
        if template_id is None:
            return None
        with create_session() as session:
            record = session.get(StrategyTemplateRecord, template_id)
        return self._template_from_record(record) if record else None

    def save_draft(
        self,
        *,
        user_address: str | None,
        raw_prompt: str,
        extracted_policy_json: StrategyPolicyConfig | None,
        validation_status: str,
        validation_errors_json: list[dict[str, Any]],
        safety_score: int,
        template_id: int | None = None,
    ) -> StrategyDraftResponse:
        with create_session() as session:
            record = StrategyDraftRecord(
                user_address=user_address,
                raw_prompt=raw_prompt,
                extracted_policy_json=extracted_policy_json.model_dump(mode="json") if extracted_policy_json else None,
                validation_status=validation_status,
                validation_errors_json=validation_errors_json,
                safety_score=safety_score,
                template_id=template_id,
                created_at=utc_now(),
            )
            session.add(record)
            session.flush()
            session.commit()
            session.refresh(record)
        return self._draft_from_record(record)

    def list_drafts(self, limit: int = 1) -> list[StrategyDraftResponse]:
        with create_session() as session:
            records = session.scalars(select(StrategyDraftRecord).order_by(StrategyDraftRecord.created_at.desc()).limit(limit)).all()
        return [self._draft_from_record(record) for record in records]

    def latest_draft(self, user_address: str | None = None) -> StrategyDraftResponse | None:
        with create_session() as session:
            query = select(StrategyDraftRecord).order_by(StrategyDraftRecord.created_at.desc())
            if user_address:
                query = query.where(StrategyDraftRecord.user_address == user_address)
            record = session.scalars(query).first()
        return self._draft_from_record(record) if record else None

    def list_versions(self, user_address: str | None = None) -> list[StrategyVersionRecordResponse]:
        with create_session() as session:
            query = select(StrategyVersionRecord).order_by(StrategyVersionRecord.activated_at.desc())
            if user_address:
                query = query.where(StrategyVersionRecord.user_address == user_address)
            records = session.scalars(query).all()
        return [self._version_from_record(record) for record in records]

    def get_active_version(self) -> StrategyVersionRecordResponse | None:
        with create_session() as session:
            record = session.scalars(
                select(StrategyVersionRecord)
                .where(StrategyVersionRecord.status == "active")
                .order_by(StrategyVersionRecord.activated_at.desc())
            ).first()
        return self._version_from_record(record) if record else None

    def get_active_version_record(self) -> StrategyVersionRecord | None:
        with create_session() as session:
            return session.scalars(
                select(StrategyVersionRecord)
                .where(StrategyVersionRecord.status == "active")
                .order_by(StrategyVersionRecord.activated_at.desc())
            ).first()

    def save_version(
        self,
        *,
        version: str,
        user_address: str | None,
        active_policy_json: StrategyPolicyConfig,
        raw_prompt_snapshot: str,
        simulation_result_json: dict[str, Any],
        activated_by: str | None,
        status: str,
    ) -> StrategyVersionRecordResponse:
        with create_session() as session:
            if status == "active":
                for active in session.scalars(select(StrategyVersionRecord).where(StrategyVersionRecord.status == "active")).all():
                    active.status = "archived"
            record = session.scalars(select(StrategyVersionRecord).where(StrategyVersionRecord.version == version)).first()
            if record is None:
                record = StrategyVersionRecord(
                    version=version,
                    user_address=user_address,
                    active_policy_json=active_policy_json.model_dump(mode="json"),
                    raw_prompt_snapshot=raw_prompt_snapshot,
                    simulation_result_json=simulation_result_json,
                    activated_by=activated_by,
                    activated_at=utc_now(),
                    status=status,
                )
                session.add(record)
            else:
                record.user_address = user_address
                record.active_policy_json = active_policy_json.model_dump(mode="json")
                record.raw_prompt_snapshot = raw_prompt_snapshot
                record.simulation_result_json = simulation_result_json
                record.activated_by = activated_by
                record.activated_at = utc_now()
                record.status = status
            session.commit()
            session.refresh(record)
        return self._version_from_record(record)

    def revert_version(self, version: str, actor: str | None = None) -> StrategyVersionRecordResponse | None:
        with create_session() as session:
            record = session.scalars(select(StrategyVersionRecord).where(StrategyVersionRecord.version == version)).first()
            if record is None:
                return None
            for active in session.scalars(select(StrategyVersionRecord).where(StrategyVersionRecord.status == "active")).all():
                active.status = "archived"
            record.status = "active"
            record.activated_by = actor or "operator"
            record.activated_at = utc_now()
            session.commit()
            session.refresh(record)
        return self._version_from_record(record)

    def save_scheduler(
        self,
        *,
        strategy_version_id: int,
        market_check_interval_seconds: int,
        quote_refresh_interval_seconds: int,
        risk_recompute_interval_seconds: int,
        execution_window_seconds: int,
    ) -> StrategySchedulerSettingsResponse:
        with create_session() as session:
            record = session.scalars(
                select(StrategySchedulerRecord).where(StrategySchedulerRecord.strategy_version_id == strategy_version_id)
            ).first()
            if record is None:
                record = StrategySchedulerRecord(
                    strategy_version_id=strategy_version_id,
                    market_check_interval_seconds=market_check_interval_seconds,
                    quote_refresh_interval_seconds=quote_refresh_interval_seconds,
                    risk_recompute_interval_seconds=risk_recompute_interval_seconds,
                    execution_window_seconds=execution_window_seconds,
                    updated_at=utc_now(),
                )
                session.add(record)
            else:
                record.market_check_interval_seconds = market_check_interval_seconds
                record.quote_refresh_interval_seconds = quote_refresh_interval_seconds
                record.risk_recompute_interval_seconds = risk_recompute_interval_seconds
                record.execution_window_seconds = execution_window_seconds
                record.updated_at = utc_now()
            session.commit()
            session.refresh(record)
        return self._scheduler_from_record(record)

    def get_scheduler(self, strategy_version_id: int | None = None) -> StrategySchedulerSettingsResponse | None:
        with create_session() as session:
            query = select(StrategySchedulerRecord)
            if strategy_version_id is not None:
                query = query.where(StrategySchedulerRecord.strategy_version_id == strategy_version_id)
            else:
                query = query.join(StrategyVersionRecord, StrategyVersionRecord.id == StrategySchedulerRecord.strategy_version_id).where(
                    StrategyVersionRecord.status == "active"
                )
            record = session.scalars(query.order_by(StrategySchedulerRecord.updated_at.desc())).first()
        return self._scheduler_from_record(record) if record else None

    def save_audit_event(
        self,
        *,
        strategy_version_id: int | None,
        event_type: str,
        actor: str,
        details_json: dict[str, Any],
    ) -> StrategyAuditEventResponse:
        with create_session() as session:
            record = StrategyAuditEventRecord(
                strategy_version_id=strategy_version_id,
                event_type=event_type,
                actor=actor,
                details_json=details_json,
                created_at=utc_now(),
            )
            session.add(record)
            session.commit()
            session.refresh(record)
        return self._audit_from_record(record)

    def list_audit_events(self, strategy_version_id: int | None = None) -> list[StrategyAuditEventResponse]:
        with create_session() as session:
            query = select(StrategyAuditEventRecord).order_by(StrategyAuditEventRecord.created_at.desc())
            if strategy_version_id is not None:
                query = query.where(StrategyAuditEventRecord.strategy_version_id == strategy_version_id)
            records = session.scalars(query).all()
        return [self._audit_from_record(record) for record in records]

    def update_draft_validation(
        self,
        draft_id: int,
        *,
        extracted_policy_json: StrategyPolicyConfig | None,
        validation_status: str,
        validation_errors_json: list[dict[str, Any]],
        safety_score: int,
    ) -> StrategyDraftResponse | None:
        with create_session() as session:
            record = session.get(StrategyDraftRecord, draft_id)
            if record is None:
                return None
            record.extracted_policy_json = extracted_policy_json.model_dump(mode="json") if extracted_policy_json else None
            record.validation_status = validation_status
            record.validation_errors_json = validation_errors_json
            record.safety_score = safety_score
            session.commit()
            session.refresh(record)
        return self._draft_from_record(record)

    def latest_validation(self, user_address: str | None = None) -> StrategyValidationResponse | None:
        draft = self.latest_draft(user_address=user_address)
        if draft is None:
            return None
        return StrategyValidationResponse(
            status="ok" if draft.validation_status == "validated" else "error",
            status_code="VALIDATED" if draft.validation_status == "validated" else "REJECTED",
            status_label="VALIDATED" if draft.validation_status == "validated" else "REJECTED",
            status_reason="Latest strategy draft validation snapshot.",
            draft_id=draft.draft_id,
            user_address=draft.user_address,
            raw_prompt=draft.raw_prompt,
            safety_score=draft.safety_score,
            validation_errors=draft.validation_errors,
            extracted_policy_json=draft.extracted_policy_json,
            requires_simulation=draft.requires_simulation,
            safe_suggestion="Describe only portfolio objectives, allowed assets, hard limits, and monitoring cadence.",
        )

    @staticmethod
    def _template_prompt_text(name: str, policy: StrategyPolicyConfig) -> str:
        return (
            f"{name}: focus on {policy.objective.replace('_', ' ')} with {', '.join(policy.allowed_assets)}; "
            f"market checks every {policy.market_check_interval_seconds}s."
        )

    @staticmethod
    def _normalize_strategy_text(text: str | None) -> str:
        if not text:
            return ""
        normalized = text
        normalized = normalized.replace("USDY, mETH, USDC", "USDY and mETH")
        normalized = normalized.replace("USDY, USDC", "USDY")
        normalized = normalized.replace("USDY · mETH · USDC", "USDY · mETH")
        normalized = normalized.replace("USDY,mETH,USDC", "USDY and mETH")
        normalized = re.sub(r"\bUSDC/ETH\b", "USDY/mETH", normalized)
        normalized = re.sub(r"(?<=,)\s*USDC\b", "", normalized)
        normalized = re.sub(r"\bUSDC\b,?\s*", "", normalized)
        normalized = re.sub(r"\s+,", ",", normalized)
        normalized = re.sub(r",\s*,", ", ", normalized)
        normalized = re.sub(r"\s{2,}", " ", normalized)
        normalized = re.sub(r"\band\s+and\b", "and", normalized, flags=re.IGNORECASE)
        return normalized.strip(" ,;")

    @classmethod
    def _normalize_policy_config(cls, policy: StrategyPolicyConfig) -> StrategyPolicyConfig:
        payload = policy.model_dump(mode="python")
        normalized = cls._normalize_policy_payload(payload)
        return StrategyPolicyConfig.model_validate(normalized)

    @classmethod
    def _normalize_policy_payload(cls, payload: dict[str, Any] | None) -> dict[str, Any] | None:
        if payload is None:
            return None
        normalized = dict(payload)
        allowed_assets = [asset for asset in normalized.get("allowed_assets", []) if asset != "USDC"]
        normalized["allowed_assets"] = allowed_assets or ["USDY", "mETH"]
        notes = normalized.get("notes")
        if isinstance(notes, list):
            normalized["notes"] = [cls._normalize_strategy_text(str(note)) for note in notes]
        return StrategyPolicyConfig.model_validate(normalized).model_dump(mode="json")

    @staticmethod
    def _template_from_record(record: StrategyTemplateRecord | None) -> StrategyTemplateSummary | None:
        if record is None:
            return None
        return StrategyTemplateSummary(
            id=record.id,
            name=record.name,
            description=record.description,
            category=record.category,
            prompt_text=record.prompt_text,
            policy_json=StrategyPolicyConfig.model_validate(record.policy_json),
            is_system_template=bool(record.is_system_template),
            created_at=record.created_at,
        )

    @staticmethod
    def _draft_from_record(record: StrategyDraftRecord | None) -> StrategyDraftResponse | None:
        if record is None:
            return None
        template = None
        if record.template_id is not None:
            with create_session() as session:
                template_record = session.get(StrategyTemplateRecord, record.template_id)
            template = StrategyPolicyRepository._template_from_record(template_record)
        return StrategyDraftResponse(
            draft_id=record.id,
            user_address=record.user_address,
            raw_prompt=record.raw_prompt,
            extracted_policy_json=StrategyPolicyConfig.model_validate(record.extracted_policy_json) if record.extracted_policy_json else None,
            validation_status=record.validation_status,
            validation_errors=[StrategyValidationError.model_validate(error) for error in (record.validation_errors_json or [])],
            safety_score=int(record.safety_score),
            created_at=record.created_at,
            requires_simulation=record.validation_status == "validated",
            template=template,
        )

    @staticmethod
    def _version_from_record(record: StrategyVersionRecord | None) -> StrategyVersionRecordResponse | None:
        if record is None:
            return None
        return StrategyVersionRecordResponse(
            id=record.id,
            version=record.version,
            user_address=record.user_address,
            active_policy_json=StrategyPolicyConfig.model_validate(record.active_policy_json),
            raw_prompt_snapshot=record.raw_prompt_snapshot,
            simulation_result_json=record.simulation_result_json or {},
            activated_by=record.activated_by,
            activated_at=record.activated_at,
            status=record.status,
        )

    @staticmethod
    def _scheduler_from_record(record: StrategySchedulerRecord | None) -> StrategySchedulerSettingsResponse | None:
        if record is None:
            return None
        return StrategySchedulerSettingsResponse(
            id=record.id,
            strategy_version_id=record.strategy_version_id,
            market_check_interval_seconds=record.market_check_interval_seconds,
            quote_refresh_interval_seconds=record.quote_refresh_interval_seconds,
            risk_recompute_interval_seconds=record.risk_recompute_interval_seconds,
            execution_window_seconds=record.execution_window_seconds,
            updated_at=record.updated_at,
        )

    @staticmethod
    def _audit_from_record(record: StrategyAuditEventRecord) -> StrategyAuditEventResponse:
        return StrategyAuditEventResponse(
            id=record.id,
            strategy_version_id=record.strategy_version_id,
            event_type=record.event_type,
            actor=record.actor,
            details_json=record.details_json or {},
            created_at=record.created_at,
        )
