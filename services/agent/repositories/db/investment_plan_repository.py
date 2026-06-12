from __future__ import annotations

from decimal import Decimal, InvalidOperation

from sqlalchemy import select

from services.agent.app.schemas.proposals import InvestmentPlanResponse
from services.agent.repositories.db.normalization import normalize_asset_symbol, normalize_json_symbols
from services.agent.repositories.db.models import InvestmentPlanRecord, TradeProposalRecord
from services.agent.repositories.db.session import create_session, init_db


class InvestmentPlanRepository:
    def __init__(self) -> None:
        init_db()

    def save_plan_for_proposals(self, plan: InvestmentPlanResponse) -> None:
        deposit_value_usd = self._resolve_deposit_value_usd(plan)
        normalized_plan_json = normalize_json_symbols(plan.model_dump(mode="json"))
        with create_session() as session:
            for linked in plan.linked_proposals:
                session.merge(
                    InvestmentPlanRecord(
                        proposal_id=linked.proposal_id,
                        plan_id=plan.plan_id,
                        portfolio_address=str(plan.metadata.get("portfolio_address") or "") or None,
                        deposit_asset_symbol=normalize_asset_symbol(plan.deposit_asset_symbol),
                        deposit_amount=str(plan.deposit_amount),
                        deposit_value_usd=deposit_value_usd,
                        plan_json=normalized_plan_json,
                    )
                )
            session.commit()

    def get_plan_for_proposal(self, proposal_id: str) -> InvestmentPlanResponse | None:
        with create_session() as session:
            record = session.scalar(
                select(InvestmentPlanRecord).where(InvestmentPlanRecord.proposal_id == proposal_id)
            )
            if record is None:
                return None
            trade_records = session.scalars(
                select(TradeProposalRecord).where(TradeProposalRecord.plan_hash.is_not(None))
            ).all()
        return self._hydrate_statuses(record.plan_json, trade_records, proposal_id)

    @staticmethod
    def _hydrate_statuses(
        plan_json: dict,
        trade_records: list[TradeProposalRecord],
        proposal_id: str,
    ) -> InvestmentPlanResponse:
        trade_status_by_id = {record.proposal_id: record.status_code for record in trade_records}
        payload = normalize_json_symbols(dict(plan_json))
        linked = []
        for item in payload.get("linked_proposals", []):
            updated_item = dict(item)
            if updated_item.get("proposal_id") in trade_status_by_id:
                updated_item["status_code"] = trade_status_by_id[updated_item["proposal_id"]]
            linked.append(updated_item)
        payload["linked_proposals"] = linked

        if proposal_id in trade_status_by_id:
            status_code = trade_status_by_id[proposal_id]
            payload["status_code"] = status_code
            payload["status_label"] = status_code
            if status_code == "PROPOSAL_APPROVED":
                payload["approval_enabled"] = True
                payload["status_reason"] = "Proposal approved by operator and ready for execution."
            elif status_code == "PROPOSAL_REJECTED":
                payload["approval_enabled"] = False
                payload["status_reason"] = "Proposal rejected by operator."
        return InvestmentPlanResponse.model_validate(payload)

    @staticmethod
    def _resolve_deposit_value_usd(plan: InvestmentPlanResponse) -> str | None:
        total = Decimal("0")
        for item in plan.selected_target_allocations or []:
            try:
                total += Decimal(str(item.value_usd or 0))
            except (InvalidOperation, TypeError, ValueError):
                continue
        if total > 0:
            return format(total.normalize(), "f")
        return None
