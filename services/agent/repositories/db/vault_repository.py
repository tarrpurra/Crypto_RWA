from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select

from services.agent.repositories.db.models import VaultFlowRecord
from services.agent.repositories.db.session import create_session, init_db


@dataclass(frozen=True)
class VaultFlowSummary:
    total_deposits_usd: Decimal
    total_withdrawals_usd: Decimal
    net_invested_usd: Decimal
    flow_count: int
    last_flow_at: datetime | None


class VaultFlowRepository:
    def __init__(self) -> None:
        init_db()

    def save_flow(
        self,
        *,
        flow_id: str,
        vault_address: str,
        user_address: str,
        flow_type: str,
        asset_symbol: str,
        asset_address: str | None,
        asset_amount: str | None,
        usd_value: str,
        tx_hash: str | None,
        occurred_at: datetime,
        metadata: dict,
    ) -> VaultFlowRecord:
        with create_session() as session:
            if tx_hash:
                existing = session.scalar(
                    select(VaultFlowRecord).where(
                        VaultFlowRecord.tx_hash == tx_hash,
                        VaultFlowRecord.user_address == user_address,
                        VaultFlowRecord.asset_symbol == asset_symbol,
                        VaultFlowRecord.flow_type == flow_type,
                    )
                )
                if existing is not None:
                    return existing

            record = VaultFlowRecord(
                flow_id=flow_id,
                vault_address=vault_address,
                user_address=user_address,
                flow_type=flow_type,
                asset_symbol=asset_symbol,
                asset_address=asset_address,
                asset_amount=asset_amount,
                usd_value=usd_value,
                tx_hash=tx_hash,
                occurred_at=occurred_at,
                metadata_json=metadata,
            )
            session.merge(record)
            session.commit()
            return record

    def summarize(self, *, vault_address: str, user_address: str) -> VaultFlowSummary:
        statement = select(VaultFlowRecord).where(
            VaultFlowRecord.vault_address == vault_address,
            VaultFlowRecord.user_address == user_address,
        )
        with create_session() as session:
            records = session.scalars(statement).all()

        deposits = Decimal("0")
        withdrawals = Decimal("0")
        net = Decimal("0")
        last_flow_at: datetime | None = None

        for record in records:
            amount = Decimal(str(record.usd_value))
            flow_type = (record.flow_type or "").lower()
            if flow_type == "withdrawal":
                withdrawals += abs(amount)
                net -= abs(amount)
            elif flow_type == "adjustment":
                net += amount
            else:
                deposits += abs(amount)
                net += abs(amount)

            if last_flow_at is None or record.occurred_at > last_flow_at:
                last_flow_at = record.occurred_at

        return VaultFlowSummary(
            total_deposits_usd=deposits,
            total_withdrawals_usd=withdrawals,
            net_invested_usd=net,
            flow_count=len(records),
            last_flow_at=last_flow_at,
        )
