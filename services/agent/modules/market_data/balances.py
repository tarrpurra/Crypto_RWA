from __future__ import annotations

from decimal import Decimal, InvalidOperation
from uuid import uuid4

from services.agent.app.schemas.market_data import NormalizedPriceSnapshot
from services.agent.app.schemas.portfolio import BalanceObservation, PortfolioPosition, PortfolioSnapshotResponse
from services.agent.modules.oracle.freshness import utc_now


FRESH_PRICE_CODES = {"DATA_FRESH", "ORACLE_FRESH", "QUOTE_FRESH"}


def _decimal_or_none(value: str | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(value)
    except (InvalidOperation, ValueError):
        return None


def _format_decimal(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value.normalize(), "f")


class PortfolioSnapshotEngine:
    def build_snapshot(
        self,
        *,
        balances: list[BalanceObservation],
        prices: list[NormalizedPriceSnapshot],
        portfolio_address: str | None,
        chain_id: int,
        base_currency: str = "USD",
        missing_reason: str | None = None,
    ) -> PortfolioSnapshotResponse:
        generated_at = utc_now()
        if not balances:
            reason = missing_reason or "No portfolio balance observations are available."
            return PortfolioSnapshotResponse(
                snapshot_id=str(uuid4()),
                generated_at=generated_at,
                portfolio_address=portfolio_address,
                chain_id=chain_id,
                base_currency=base_currency,
                total_value_usd=None,
                positions=[],
                data_sources_used=[],
                status="degraded",
                status_code="DATA_MISSING",
                status_label="DATA_MISSING",
                status_reason=reason,
                metadata={"balance_count": 0},
            )

        price_by_key = {price.asset_key.lower(): price for price in prices}
        price_by_symbol = {price.asset_symbol.lower(): price for price in prices}
        positions: list[PortfolioPosition] = []
        total_value = Decimal("0")
        all_valued = True
        data_sources: set[str] = set()

        for balance in balances:
            position, value = self._position_from_balance(balance, price_by_key, price_by_symbol)
            positions.append(position)
            data_sources.update(position.data_sources_used)
            if value is None:
                all_valued = False
                continue
            total_value += value

        total_value_output = total_value if all_valued and total_value > 0 else None
        if total_value_output is not None:
            positions = [
                position.model_copy(update={"weight": _format_decimal((_decimal_or_none(position.value_usd) or Decimal("0")) / total_value_output)})
                for position in positions
            ]

        status_code = "DATA_FRESH" if all_valued and total_value_output is not None else "DATA_PARTIAL"
        status = "ok" if status_code == "DATA_FRESH" else "degraded"
        status_reason = "Portfolio snapshot valued successfully."
        if status_code == "DATA_PARTIAL":
            status_reason = "Portfolio balances are present, but one or more positions cannot be valued."

        return PortfolioSnapshotResponse(
            snapshot_id=str(uuid4()),
            generated_at=generated_at,
            portfolio_address=portfolio_address,
            chain_id=chain_id,
            base_currency=base_currency,
            total_value_usd=_format_decimal(total_value_output),
            positions=positions,
            data_sources_used=sorted(data_sources),
            status=status,
            status_code=status_code,
            status_label=status_code,
            status_reason=status_reason,
            metadata={"balance_count": len(balances), "all_positions_valued": all_valued},
        )

    def _position_from_balance(
        self,
        balance: BalanceObservation,
        price_by_key: dict[str, NormalizedPriceSnapshot],
        price_by_symbol: dict[str, NormalizedPriceSnapshot],
    ) -> tuple[PortfolioPosition, Decimal | None]:
        amount = _decimal_or_none(balance.balance)
        price = price_by_key.get(balance.asset_key.lower()) or price_by_symbol.get(balance.asset_symbol.lower())
        price_value = _decimal_or_none(price.price_usd) if price else None
        price_is_usable = bool(price and price.status_code in FRESH_PRICE_CODES and price_value is not None)

        value = amount * price_value if amount is not None and price_value is not None and price_is_usable else None
        status_code = "DATA_FRESH" if value is not None and balance.status_code == "DATA_FRESH" else "DATA_MISSING"
        status_reason = "Position valued from balance and price snapshots."
        if amount is None:
            status_reason = "Balance amount is not parseable."
        elif not price:
            status_reason = "No price snapshot is available for this position."
        elif not price_is_usable:
            status_reason = "Price snapshot is missing, stale, or verification-gated."
        elif balance.status_code != "DATA_FRESH":
            status_reason = balance.status_reason

        data_sources = [balance.balance_source]
        if price:
            data_sources.extend(price.data_sources_used)

        return (
            PortfolioPosition(
                asset_key=balance.asset_key,
                asset_symbol=balance.asset_symbol,
                asset_address=balance.asset_address,
                chain_id=balance.chain_id,
                balance=balance.balance,
                balance_source=balance.balance_source,
                price_usd=price.price_usd if price else None,
                value_usd=_format_decimal(value),
                weight=None,
                valuation_status="valued" if value is not None else "unvalued",
                status_code=status_code,
                status_reason=status_reason,
                data_sources_used=sorted(set(data_sources)),
                metadata=balance.metadata,
            ),
            value,
        )
