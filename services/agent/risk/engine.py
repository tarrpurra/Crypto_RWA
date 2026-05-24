from __future__ import annotations

from services.agent.app.core.status_codes import DataStatusCode, RiskStatusCode, RuntimeMode
from services.agent.app.schemas.portfolio import PortfolioSnapshotResponse
from services.agent.app.schemas.risk import RiskAssessmentResponse, RiskBucket
from services.agent.modules.oracle.freshness import utc_now


DEFAULT_BUCKET_WEIGHTS = {
    "portfolio_valuation": 0.30,
    "quote_availability": 0.20,
    "concentration_drift": 0.20,
    "ops_readiness": 0.10,
    "data_quality": 0.20,
}


class RiskEngine:
    def evaluate(
        self,
        *,
        portfolio: PortfolioSnapshotResponse,
        runtime_mode: RuntimeMode,
        target_chain: str,
        quote_validation_status: str = DataStatusCode.DATA_MISSING.value,
    ) -> RiskAssessmentResponse:
        buckets = [
            self._portfolio_valuation_bucket(portfolio),
            self._quote_availability_bucket(quote_validation_status),
            self._concentration_drift_bucket(portfolio),
            self._ops_readiness_bucket(runtime_mode),
            self._data_quality_bucket(portfolio),
        ]
        buckets = self._with_bucket_weights(buckets)
        hard_veto = any(bucket.hard_veto for bucket in buckets)
        risk_score = self._weighted_score(buckets)
        status_code = self._status_code(risk_score=risk_score, hard_veto=hard_veto, buckets=buckets)
        recommended_action = self._recommended_action(status_code)
        confidence = self._confidence(portfolio=portfolio, hard_veto=hard_veto, quote_validation_status=quote_validation_status)
        data_sources = sorted({source for bucket in buckets for source in bucket.data_sources_used})

        return RiskAssessmentResponse(
            asset="portfolio",
            recommended_action=recommended_action,
            risk_score=risk_score,
            risk_band=status_code,
            confidence=confidence,
            reasoning_summary=self._reasoning_summary(status_code=status_code, hard_veto=hard_veto),
            data_sources_used=data_sources,
            hard_veto_status="active" if hard_veto else "inactive",
            required_human_approval_status="required",
            status="degraded" if status_code != RiskStatusCode.RISK_NORMAL.value else "ok",
            status_code=status_code,
            status_label=status_code,
            status_reason=self._status_reason(status_code),
            generated_at=utc_now(),
            runtime_mode=runtime_mode.value,
            target_chain=target_chain,
            freshness_status=portfolio.status_code,
            buckets=buckets,
            notes=[
                "Risk scoring is deterministic and advisory.",
                "Execution-facing recommendations remain blocked until Phase 1B quote/oracle validation is complete.",
            ],
            metadata={
                "portfolio_snapshot_id": portfolio.snapshot_id,
                "quote_validation_status": quote_validation_status,
                "scoring_method": "weighted_bucket_score_with_restrictive_status_escalation",
                "bucket_weights": DEFAULT_BUCKET_WEIGHTS,
            },
        )

    @staticmethod
    def _with_bucket_weights(buckets: list[RiskBucket]) -> list[RiskBucket]:
        return [
            bucket.model_copy(update={"weight": DEFAULT_BUCKET_WEIGHTS.get(bucket.bucket, 0.0)})
            for bucket in buckets
        ]

    @staticmethod
    def _weighted_score(buckets: list[RiskBucket]) -> float:
        weighted_score = sum(bucket.score * bucket.weight for bucket in buckets)
        return round(weighted_score, 2)

    @staticmethod
    def _portfolio_valuation_bucket(portfolio: PortfolioSnapshotResponse) -> RiskBucket:
        if not portfolio.positions:
            return RiskBucket(
                bucket="portfolio_valuation",
                score=100,
                status="blocked",
                status_code=RiskStatusCode.RISK_VETO.value,
                reason="No portfolio positions are available for risk scoring.",
                hard_veto=True,
                data_sources_used=portfolio.data_sources_used,
            )
        unvalued = [position.asset_key for position in portfolio.positions if position.valuation_status != "valued"]
        if unvalued:
            return RiskBucket(
                bucket="portfolio_valuation",
                score=95,
                status="blocked",
                status_code=RiskStatusCode.RISK_VETO.value,
                reason=f"Unvalued positions block risk approval: {', '.join(unvalued)}.",
                hard_veto=True,
                data_sources_used=portfolio.data_sources_used,
                metadata={"unvalued_assets": unvalued},
            )
        return RiskBucket(
            bucket="portfolio_valuation",
            score=10,
            status="ok",
            status_code=RiskStatusCode.RISK_NORMAL.value,
            reason="All portfolio positions are valued.",
            data_sources_used=portfolio.data_sources_used,
        )

    @staticmethod
    def _quote_availability_bucket(quote_validation_status: str) -> RiskBucket:
        if quote_validation_status not in {DataStatusCode.QUOTE_FRESH.value, DataStatusCode.DATA_FRESH.value}:
            return RiskBucket(
                bucket="quote_availability",
                score=70,
                status="restricted",
                status_code=RiskStatusCode.RISK_REBALANCE_ONLY.value,
                reason="Live quote validation is missing or verification-gated.",
                data_sources_used=[],
                metadata={"quote_validation_status": quote_validation_status},
            )
        return RiskBucket(
            bucket="quote_availability",
            score=15,
            status="ok",
            status_code=RiskStatusCode.RISK_NORMAL.value,
            reason="Quote validation is available.",
            data_sources_used=["quotes"],
        )

    @staticmethod
    def _concentration_drift_bucket(portfolio: PortfolioSnapshotResponse) -> RiskBucket:
        drifted = [position.asset_key for position in portfolio.positions if position.drift_status == "drifted"]
        unvalued = [position.asset_key for position in portfolio.positions if position.drift_status == "unvalued"]
        if unvalued:
            return RiskBucket(
                bucket="concentration_drift",
                score=80,
                status="blocked",
                status_code=RiskStatusCode.RISK_PAUSE_REQUIRED.value,
                reason=f"Target drift cannot be evaluated for unvalued positions: {', '.join(unvalued)}.",
                hard_veto=True,
                data_sources_used=portfolio.data_sources_used,
            )
        if drifted:
            return RiskBucket(
                bucket="concentration_drift",
                score=55,
                status="watch",
                status_code=RiskStatusCode.RISK_REBALANCE_ONLY.value,
                reason=f"Positions are outside target drift tolerance: {', '.join(drifted)}.",
                data_sources_used=portfolio.data_sources_used,
                metadata={"drifted_assets": drifted},
            )
        return RiskBucket(
            bucket="concentration_drift",
            score=20 if portfolio.positions else 60,
            status="ok" if portfolio.positions else "missing",
            status_code=RiskStatusCode.RISK_NORMAL.value if portfolio.positions else RiskStatusCode.RISK_CAUTION.value,
            reason="Configured target drift is within tolerance." if portfolio.positions else "No positions are available for drift scoring.",
            data_sources_used=portfolio.data_sources_used,
        )

    @staticmethod
    def _ops_readiness_bucket(runtime_mode: RuntimeMode) -> RiskBucket:
        if runtime_mode == RuntimeMode.LIVE:
            return RiskBucket(
                bucket="ops_readiness",
                score=20,
                status="ok",
                status_code=RiskStatusCode.RISK_NORMAL.value,
                reason="Runtime is live; deterministic risk gates still apply.",
            )
        return RiskBucket(
            bucket="ops_readiness",
            score=35,
            status="restricted",
            status_code=RiskStatusCode.RISK_CAUTION.value,
            reason=f"Runtime mode is {runtime_mode.value}; execution requires human approval and later policy gates.",
        )

    @staticmethod
    def _data_quality_bucket(portfolio: PortfolioSnapshotResponse) -> RiskBucket:
        if portfolio.status_code == DataStatusCode.DATA_FRESH.value:
            return RiskBucket(
                bucket="data_quality",
                score=15,
                status="ok",
                status_code=RiskStatusCode.RISK_NORMAL.value,
                reason="Portfolio snapshot is fresh.",
                data_sources_used=portfolio.data_sources_used,
            )
        score = 100 if portfolio.status_code == DataStatusCode.DATA_MISSING.value else 85
        return RiskBucket(
            bucket="data_quality",
            score=score,
            status="blocked",
            status_code=RiskStatusCode.RISK_VETO.value,
            reason=f"Portfolio snapshot status is {portfolio.status_code}: {portfolio.status_reason}",
            hard_veto=True,
            data_sources_used=portfolio.data_sources_used,
        )

    @staticmethod
    def _status_code(*, risk_score: float, hard_veto: bool, buckets: list[RiskBucket]) -> str:
        if hard_veto:
            return RiskStatusCode.RISK_VETO.value
        bucket_status_codes = {bucket.status_code for bucket in buckets}
        if RiskStatusCode.RISK_PAUSE_REQUIRED.value in bucket_status_codes:
            return RiskStatusCode.RISK_PAUSE_REQUIRED.value
        if RiskStatusCode.RISK_REBALANCE_ONLY.value in bucket_status_codes:
            return RiskStatusCode.RISK_REBALANCE_ONLY.value
        if RiskStatusCode.RISK_CAUTION.value in bucket_status_codes:
            return RiskStatusCode.RISK_CAUTION.value
        if risk_score >= 90:
            return RiskStatusCode.RISK_PAUSE_REQUIRED.value
        if risk_score >= 70:
            return RiskStatusCode.RISK_REBALANCE_ONLY.value
        if risk_score >= 50:
            return RiskStatusCode.RISK_CAUTION.value
        return RiskStatusCode.RISK_NORMAL.value

    @staticmethod
    def _recommended_action(status_code: str) -> str:
        if status_code in {RiskStatusCode.RISK_VETO.value, RiskStatusCode.RISK_PAUSE_REQUIRED.value}:
            return "pause"
        if status_code == RiskStatusCode.RISK_REBALANCE_ONLY.value:
            return "rebalance_only"
        if status_code == RiskStatusCode.RISK_CAUTION.value:
            return "monitor_only"
        return "monitor"

    @staticmethod
    def _confidence(*, portfolio: PortfolioSnapshotResponse, hard_veto: bool, quote_validation_status: str) -> float:
        if hard_veto:
            return 0.25
        if portfolio.status_code != DataStatusCode.DATA_FRESH.value:
            return 0.4
        if quote_validation_status not in {DataStatusCode.QUOTE_FRESH.value, DataStatusCode.DATA_FRESH.value}:
            return 0.55
        return 0.85

    @staticmethod
    def _reasoning_summary(*, status_code: str, hard_veto: bool) -> str:
        if hard_veto:
            return "Risk engine found a hard veto from missing or incomplete portfolio data."
        if status_code == RiskStatusCode.RISK_REBALANCE_ONLY.value:
            return "Risk is constrained by missing live quote validation; execution-facing actions remain blocked."
        return "Risk engine completed deterministic scoring without hard vetoes."

    @staticmethod
    def _status_reason(status_code: str) -> str:
        if status_code == RiskStatusCode.RISK_VETO.value:
            return "One or more hard veto conditions are active."
        if status_code == RiskStatusCode.RISK_REBALANCE_ONLY.value:
            return "Risk allows analysis only; execution remains gated."
        if status_code == RiskStatusCode.RISK_CAUTION.value:
            return "Risk requires monitoring and human review."
        return "Risk is within normal deterministic bounds."
