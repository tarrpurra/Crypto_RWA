from __future__ import annotations

import logging

from services.agent.app.core.settings import get_settings
from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.schemas.portfolio import PortfolioPosition, PortfolioSnapshot, PortfolioSnapshotResponse
from services.agent.app.schemas.risk import RiskAssessmentResponse, RiskBucket, RiskSnapshot
from services.agent.modules.oracle.freshness import utc_now
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.risk.engine import RiskEngine

logger = logging.getLogger("services.agent.risk.score_engine")


class RiskScoreEngine:
    """Deprecated compatibility adapter for the legacy /risk/snapshot shape."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.repo = MarketDataRepository()

    def compute_risk_snapshot(self, portfolio: PortfolioSnapshot) -> RiskSnapshot:
        logger.warning("RiskScoreEngine is deprecated; use RiskEngine.evaluate() directly.")
        try:
            prices = self.repo.latest_normalized_prices()
            quotes = self.repo.latest_normalized_quotes()
        except Exception as exc:
            logger.warning("Legacy risk market context lookup failed: %s", exc)
            prices = None
            quotes = None
        quote_validation_status = (
            DataStatusCode.QUOTE_FRESH.value
            if quotes is not None and any(quote.amount_out is not None for quote in quotes)
            else DataStatusCode.DATA_MISSING.value
        )
        assessment = RiskEngine().evaluate(
            portfolio=self._portfolio_response_from_legacy_snapshot(portfolio),
            runtime_mode=self.settings.runtime_mode,
            target_chain=self.settings.target_chain.value,
            quote_validation_status=quote_validation_status,
            prices=prices,
            quotes=quotes,
        )
        return self._risk_snapshot_from_assessment(assessment)

    def _portfolio_response_from_legacy_snapshot(self, portfolio: PortfolioSnapshot) -> PortfolioSnapshotResponse:
        positions = [
            PortfolioPosition(
                asset_key=balance.asset_symbol.upper(),
                asset_symbol=balance.asset_symbol,
                asset_address=None,
                chain_id=self.settings.effective_chain_id,
                balance=str(balance.balance),
                balance_source="legacy_portfolio_snapshot",
                price_usd=str(balance.price_usd) if balance.price_usd else None,
                value_usd=str(balance.value_usd),
                weight=str(balance.weight),
                target_weight=None,
                weight_drift=None,
                drift_status="not_configured",
                valuation_status="valued" if balance.value_usd >= 0 else "unvalued",
                status_code=portfolio.status_code,
                status_reason=portfolio.status_reason or "Legacy portfolio snapshot.",
                data_sources_used=["legacy_portfolio_snapshot"],
            )
            for balance in portfolio.balances
        ]
        return PortfolioSnapshotResponse(
            snapshot_id=portfolio.snapshot_id,
            generated_at=portfolio.created_at,
            portfolio_address=portfolio.wallet_or_vault,
            chain_id=self.settings.effective_chain_id,
            base_currency=self.settings.portfolio_base_currency,
            total_value_usd=str(portfolio.total_value_usd) if portfolio.total_value_usd is not None else None,
            positions=positions,
            data_sources_used=["legacy_portfolio_snapshot"],
            status="ok" if portfolio.status_code == DataStatusCode.DATA_FRESH.value else "degraded",
            status_code=portfolio.status_code,
            status_label=portfolio.status_code,
            status_reason=portfolio.status_reason or "Legacy portfolio snapshot.",
        )

    @staticmethod
    def _risk_snapshot_from_assessment(assessment: RiskAssessmentResponse) -> RiskSnapshot:
        bucket_scores = {
            RiskScoreEngine._legacy_bucket_name(bucket.bucket): bucket.score
            for bucket in assessment.buckets
        }
        prechecks = {
            "oracle_fresh": RiskScoreEngine._bucket_passed(assessment.buckets, "oracle_freshness"),
            "liquidity_sufficient": RiskScoreEngine._bucket_passed(assessment.buckets, "liquidity_slippage"),
            "peg_stable": RiskScoreEngine._bucket_passed(assessment.buckets, "usdy_depeg"),
            "concentration_within_bounds": RiskScoreEngine._bucket_passed(assessment.buckets, "concentration_drift"),
        }
        notes = list(assessment.notes)
        notes.extend(bucket.reason for bucket in assessment.buckets if bucket.status != "ok")
        if assessment.hard_veto_status == "active":
            notes.append("HARD VETO ACTIVE: Proposal execution is blocked.")
        return RiskSnapshot(
            snapshot_id=f"risk_{int(utc_now().timestamp())}",
            total_score=assessment.risk_score,
            risk_band=assessment.risk_band,
            status_code=assessment.status_code,
            status_reason=assessment.status_reason,
            bucket_scores=bucket_scores,
            prechecks=prechecks,
            notes=notes or ["All risk systems normal."],
            created_at=assessment.generated_at,
        )

    @staticmethod
    def _legacy_bucket_name(bucket_name: str) -> str:
        return {
            "oracle_freshness": "oracle",
            "usdy_depeg": "depeg",
            "liquidity_slippage": "liquidity",
            "concentration_drift": "concentration",
        }.get(bucket_name, bucket_name)

    @staticmethod
    def _bucket_passed(buckets: list[RiskBucket], bucket_name: str) -> bool:
        bucket = next((item for item in buckets if item.bucket == bucket_name), None)
        if bucket is None:
            return True
        return not bucket.hard_veto and bucket.status not in {"blocked", "missing"}
