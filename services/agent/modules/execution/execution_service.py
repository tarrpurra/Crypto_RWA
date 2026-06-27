from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from services.agent.app.core.settings import Settings, get_settings
from services.agent.app.core.status_codes import ExecutionEventType, ExecutionTrigger
from services.agent.app.schemas.proposals import ProposalExecuteResponse
from services.agent.modules.execution.vault_executor import submit_executor_vault_trade, VaultExecutionSubmission
from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.models import ExecutionEventRecord, TradeExecutionRecord, TradeProposalRecord
from services.agent.repositories.db.session import create_session, init_db


logger = logging.getLogger("services.agent.execution.service")


class ExecutionBlocked(Exception):
    def __init__(self, reason: str, retryable: bool = False):
        self.reason = reason
        self.retryable = retryable
        super().__init__(reason)


class AlreadyExecuted(Exception):
    def __init__(self, tx_hash: str):
        self.tx_hash = tx_hash
        super().__init__(f"Already executed: {tx_hash}")


@dataclass
class AutoExecutionResult:
    attempted: bool
    status: str
    reason: str | None = None
    tx_hash: str | None = None
    retryable: bool | None = None
    error: str | None = None


def is_auto_execute_on_approval_enabled(settings: Settings | None = None) -> bool:
    settings = settings or get_settings()
    return (
        settings.auto_execute_on_human_approval
        and bool(settings.executor_private_key)
        and bool(settings.executor_vault_address)
        and bool(settings.trade_approval_manager_address)
        and bool(settings.pause_guardian_address)
    )


def _log_execution_event(
    proposal_id: str,
    event_type: str,
    trigger: str | None = None,
    status_code: str = "EXECUTION_EVENT",
    message: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    try:
        init_db()
        with create_session() as session:
            session.add(
                ExecutionEventRecord(
                    proposal_id=proposal_id,
                    event_type=event_type,
                    trigger=trigger,
                    status_code=status_code,
                    message=message,
                    details_json=details or {},
                )
            )
            session.commit()
    except Exception as exc:
        logger.warning("Failed to record execution event for %s: %s", proposal_id, exc)


def _proposal_execute_response_from_records(
    *,
    status_code: str,
    status_reason: str,
    proposal_id: str,
    tx_hash: str | None,
    record: TradeProposalRecord,
    chain_id: int | None = None,
) -> ProposalExecuteResponse:
    if chain_id is None:
        chain_id = get_settings().effective_chain_id
    return ProposalExecuteResponse(
        status="ok",
        status_code=status_code,
        status_label=status_code,
        status_reason=status_reason,
        proposal_id=proposal_id,
        tx_hash=tx_hash,
        router=record.router,
        selector=record.selector,
        calldata=record.calldata,
        calldata_hash=record.calldata_hash,
        token_in=record.token_in,
        token_out=record.token_out,
        recipient=record.recipient,
        max_amount_in=record.max_amount_in,
        min_amount_out=record.min_amount_out,
        native_value=record.native_value,
        deadline=record.deadline,
        nonce=record.nonce,
        chain_id=chain_id,
    )


def _proposal_status_from_execution_status(execution_status: str) -> str:
    if execution_status == "EXECUTION_CONFIRMED":
        return "PROPOSAL_EXECUTED"
    if execution_status == "EXECUTION_SUBMITTED":
        return "PROPOSAL_EXECUTING"
    return "PROPOSAL_FAILED"


def _is_retryable_error(execution_status: str, failure_reason: str | None) -> bool:
    if execution_status == "EXECUTION_CONFIRMED":
        return False
    if execution_status == "EXECUTION_REVERTED":
        return False
    non_retryable_keywords = [
        "proposal_expired",
        "risk_score_too_high",
        "system_paused",
        "market_data_stale",
        "calldata_mismatch",
        "router_not_whitelisted",
        "slippage_guard",
    ]
    if failure_reason:
        reason_lower = failure_reason.lower()
        for keyword in non_retryable_keywords:
            if keyword in reason_lower:
                return False
    return True


def validate_proposal_executable(
    proposal: TradeProposalRecord,
    settings: Settings | None = None,
) -> None:
    settings = settings or get_settings()
    if proposal.status_code not in {"PROPOSAL_APPROVED", "PROPOSAL_EXECUTION_FAILED_RETRYABLE"}:
        raise ExecutionBlocked(
            f"Proposal {proposal.proposal_id} is not approved (status={proposal.status_code})",
            retryable=False,
        )
    if not settings.executor_private_key:
        raise ExecutionBlocked("EXECUTOR_PRIVATE_KEY is not configured", retryable=False)
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if proposal.proposal_expiry > 0 and now_ts >= proposal.proposal_expiry:
        raise ExecutionBlocked(
            f"Proposal {proposal.proposal_id} has expired (expiry={proposal.proposal_expiry})",
            retryable=False,
        )


def execute_approved_proposal_if_allowed(
    proposal_id: str,
    trigger: str = ExecutionTrigger.MANUAL_EXECUTE,
    settings: Settings | None = None,
) -> AutoExecutionResult:
    settings = settings or get_settings()
    init_db()
    with create_session() as session:
        from sqlalchemy import select

        proposal = session.scalar(
            select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id)
        )
        if proposal is None:
            return AutoExecutionResult(
                attempted=False,
                status="SKIPPED",
                reason=f"Proposal not found: {proposal_id}",
            )
        existing_execution = session.scalar(
            select(TradeExecutionRecord).where(TradeExecutionRecord.proposal_id == proposal_id)
        )
        if existing_execution is not None and existing_execution.status_code == "EXECUTION_CONFIRMED":
            return AutoExecutionResult(
                attempted=False,
                status="ALREADY_EXECUTED",
                reason="Proposal already executed.",
                tx_hash=existing_execution.tx_hash,
            )
    try:
        validate_proposal_executable(proposal, settings)
    except ExecutionBlocked as e:
        reason = f"Execution blocked: {e.reason}"
        logger.warning("execute_approved_proposal_if_allowed: %s", reason)
        _log_execution_event(
            proposal_id=proposal_id,
            event_type=ExecutionEventType.EXECUTION_BLOCKED,
            trigger=trigger,
            message=reason,
        )
        return AutoExecutionResult(
            attempted=False,
            status="BLOCKED",
            reason=reason,
            retryable=e.retryable,
        )
    _log_execution_event(
        proposal_id=proposal_id,
        event_type=ExecutionEventType.EXECUTION_STARTED,
        trigger=trigger,
    )
    init_db()
    with create_session() as session:
        from sqlalchemy import select

        proposal = session.scalar(
            select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id)
        )
        if proposal is None:
            return AutoExecutionResult(
                attempted=False,
                status="SKIPPED",
                reason=f"Proposal not found: {proposal_id}",
            )
        proposal.status_code = "PROPOSAL_EXECUTING"
        proposal.execution_attempt_count = (proposal.execution_attempt_count or 0) + 1
        proposal.last_execution_trigger = trigger
        proposal.execution_error = None
        session.commit()
    try:
        submission: VaultExecutionSubmission = submit_executor_vault_trade(
            settings=settings,
            foundry_out_dir=settings.foundry_out_dir,
            proposal=proposal,
        )
    except HTTPException as exc:
        error_detail = str(exc.detail)
        retryable = _is_retryable_error("EXECUTION_FAILED", error_detail)
        _record_execution_failure(proposal_id, error_detail, trigger)
        _log_execution_event(
            proposal_id=proposal_id,
            event_type=ExecutionEventType.EXECUTION_FAILED,
            trigger=trigger,
            status_code="EXECUTION_FAILED",
            message=error_detail,
            details={"retryable": retryable, "error": error_detail},
        )
        return AutoExecutionResult(
            attempted=True,
            status="FAILED",
            error=error_detail,
            retryable=retryable,
        )
    except Exception as exc:
        error_detail = str(exc)
        retryable = True
        _record_execution_failure(proposal_id, error_detail, trigger)
        _log_execution_event(
            proposal_id=proposal_id,
            event_type=ExecutionEventType.EXECUTION_FAILED,
            trigger=trigger,
            status_code="EXECUTION_FAILED",
            message=error_detail,
            details={"retryable": retryable, "error": error_detail},
        )
        return AutoExecutionResult(
            attempted=True,
            status="FAILED",
            error=error_detail,
            retryable=retryable,
        )
    _record_execution_success(proposal_id, submission, trigger)
    if submission.receipt_status == 1:
        execution_status = "EXECUTION_CONFIRMED"
        execution_reason = "Execution transaction was mined and confirmed on-chain."
        proposal_status = "PROPOSAL_EXECUTED"
        event_type = ExecutionEventType.EXECUTION_CONFIRMED
    elif submission.receipt_status == 0:
        execution_status = "EXECUTION_REVERTED"
        execution_reason = "Execution transaction was mined but reverted on-chain."
        proposal_status = "PROPOSAL_FAILED"
        event_type = ExecutionEventType.EXECUTION_FAILED
    else:
        execution_status = "EXECUTION_SUBMITTED"
        execution_reason = "Execution transaction submitted on-chain."
        proposal_status = "PROPOSAL_EXECUTING"
        event_type = ExecutionEventType.EXECUTION_SUBMITTED
    _update_proposal_status_and_event(proposal_id, proposal_status, execution_reason, trigger, event_type)
    return AutoExecutionResult(
        attempted=True,
        status=execution_status,
        reason=execution_reason,
        tx_hash=submission.tx_hash,
        retryable=False,
    )


def _record_execution_failure(proposal_id: str, reason: str, trigger: str | None = None) -> None:
    init_db()
    with create_session() as session:
        from sqlalchemy import select

        proposal = session.scalar(
            select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id)
        )
        if proposal is None:
            return
        retryable = _is_retryable_error("EXECUTION_FAILED", reason)
        proposal.status_code = "PROPOSAL_EXECUTION_FAILED_RETRYABLE" if retryable else "PROPOSAL_FAILED"
        proposal.updated_at = utc_now()
        proposal.execution_error = reason
        proposal.retryable = retryable
        existing_execution = session.scalar(
            select(TradeExecutionRecord).where(TradeExecutionRecord.proposal_id == proposal_id)
        )
        if existing_execution is None:
            session.add(
                TradeExecutionRecord(
                    proposal_id=proposal_id,
                    tx_hash=f"failed:{proposal_id}",
                    quoted_amount_out=None,
                    actual_amount_out=None,
                    gas_used=None,
                    realized_slippage_bps=None,
                    status_code="EXECUTION_FAILED",
                    failure_reason=reason,
                    trigger=trigger,
                )
            )
        else:
            existing_execution.status_code = "EXECUTION_FAILED"
            existing_execution.failure_reason = reason
            existing_execution.trigger = trigger
        session.commit()


def _record_execution_success(proposal_id: str, submission: VaultExecutionSubmission, trigger: str | None = None) -> None:
    init_db()
    with create_session() as session:
        from sqlalchemy import select

        proposal = session.scalar(
            select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id)
        )
        if proposal is None:
            return
        if submission.receipt_status == 1:
            proposal.status_code = "PROPOSAL_EXECUTED"
            proposal.execution_error = None
            proposal.retryable = False
        elif submission.receipt_status == 0:
            proposal.status_code = "PROPOSAL_FAILED"
            proposal.execution_error = "Execution transaction was mined but reverted on-chain."
            proposal.retryable = False
        else:
            proposal.status_code = "PROPOSAL_EXECUTING"
            proposal.execution_error = None
        proposal.updated_at = utc_now()
        existing = session.scalar(
            select(TradeExecutionRecord).where(TradeExecutionRecord.proposal_id == proposal_id)
        )
        if existing is None:
            session.add(
                TradeExecutionRecord(
                    proposal_id=proposal_id,
                    tx_hash=submission.tx_hash,
                    quoted_amount_out=None,
                    actual_amount_out=None,
                    gas_used=None,
                    realized_slippage_bps=None,
                    status_code=(
                        "EXECUTION_CONFIRMED" if submission.receipt_status == 1
                        else "EXECUTION_REVERTED" if submission.receipt_status == 0
                        else "EXECUTION_SUBMITTED"
                    ),
                    failure_reason=(
                        "Execution transaction was mined but reverted on-chain."
                        if submission.receipt_status == 0
                        else None
                    ),
                    trigger=trigger,
                )
            )
        else:
            existing.tx_hash = submission.tx_hash
            existing.status_code = (
                "EXECUTION_CONFIRMED" if submission.receipt_status == 1
                else "EXECUTION_REVERTED" if submission.receipt_status == 0
                else "EXECUTION_SUBMITTED"
            )
            existing.failure_reason = (
                "Execution transaction was mined but reverted on-chain."
                if submission.receipt_status == 0
                else None
            )
            existing.trigger = trigger
        session.commit()


def _update_proposal_status_and_event(
    proposal_id: str,
    status_code: str,
    reason: str,
    trigger: str | None,
    event_type: str,
) -> None:
    init_db()
    with create_session() as session:
        from sqlalchemy import select

        proposal = session.scalar(
            select(TradeProposalRecord).where(TradeProposalRecord.proposal_id == proposal_id)
        )
        if proposal is not None:
            proposal.status_code = status_code
            proposal.updated_at = utc_now()
            session.commit()
    _log_execution_event(
        proposal_id=proposal_id,
        event_type=event_type,
        trigger=trigger,
        status_code=status_code,
        message=reason,
    )
