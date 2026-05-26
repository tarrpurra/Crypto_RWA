from __future__ import annotations

from dataclasses import dataclass

from services.agent.app.core.settings import Settings, get_settings
from services.agent.app.core.status_codes import AlertSeverity, DataStatusCode, RiskStatusCode, SystemStatusCode
from services.agent.app.schemas.ops import OpsAlert, OpsHealthResponse, SourceHealth
from services.agent.modules.oracle.freshness import age_seconds, utc_now
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.repositories.db.portfolio_repository import PortfolioSnapshotRepository
from services.agent.repositories.db.risk_repository import RiskAssessmentRepository
from services.agent.repositories.db.session import get_engine


BLOCKING_CODES = {
    DataStatusCode.DATA_MISSING.value,
    DataStatusCode.DATA_STALE.value,
    DataStatusCode.ORACLE_STALE.value,
    DataStatusCode.QUOTE_STALE.value,
    DataStatusCode.LIQUIDITY_UNKNOWN.value,
    RiskStatusCode.RISK_VETO.value,
    RiskStatusCode.RISK_PAUSE_REQUIRED.value,
}

WARNING_CODES = {
    DataStatusCode.DATA_PARTIAL.value,
    RiskStatusCode.RISK_CAUTION.value,
    RiskStatusCode.RISK_REBALANCE_ONLY.value,
    RiskStatusCode.RISK_REDUCE_ONLY.value,
}


@dataclass(frozen=True)
class OpsHealthEvaluator:
    settings: Settings

    def evaluate(self) -> OpsHealthResponse:
        sources = [
            self._rpc_source(),
            self._database_source(),
            self._market_price_source(),
            self._quote_source(),
            self._portfolio_source(),
            self._risk_source(),
            self._ai_source(),
        ]
        alerts = self._alerts_from_sources(sources)
        recommended_mode = self._recommended_mode(alerts)
        status, status_code, status_reason = self._overall_status(alerts)
        return OpsHealthResponse(
            status=status,
            status_code=status_code,
            status_label=status_code,
            status_reason=status_reason,
            generated_at=utc_now(),
            runtime_mode=self.settings.runtime_mode.value,
            target_chain=self.settings.target_chain.value,
            recommended_mode=recommended_mode,
            sources=sources,
            alerts=alerts,
            metadata={
                "simulation_fallback_enabled": self.settings.simulation_fallback_enabled,
                "phase_1b_validation_required": True,
            },
        )

    def _source(
        self,
        *,
        source: str,
        status: str,
        status_code: str,
        status_reason: str,
        metadata: dict | None = None,
    ) -> SourceHealth:
        now = utc_now()
        return SourceHealth(
            source=source,
            status=status,
            status_code=status_code,
            status_label=status_code,
            status_reason=status_reason,
            observed_at=now,
            metadata=metadata or {},
        )

    def _rpc_source(self) -> SourceHealth:
        if not self.settings.effective_http_rpc_url:
            return self._source(
                source="rpc",
                status="degraded",
                status_code=DataStatusCode.DATA_MISSING.value,
                status_reason="No HTTP RPC URL is configured.",
            )
        return self._source(
            source="rpc",
            status="ok",
            status_code=SystemStatusCode.SIMULATION_ONLY.value,
            status_reason="RPC URL is configured; live connectivity is verified by /chain/status.",
            metadata={"chain_id": self.settings.effective_chain_id},
        )

    def _database_source(self) -> SourceHealth:
        try:
            get_engine()
            return self._source(
                source="database",
                status="ok",
                status_code=SystemStatusCode.SIMULATION_ONLY.value,
                status_reason="Database engine is available; local fallback may be in-memory if PostgreSQL is unavailable.",
                metadata={"database_url_configured": bool(self.settings.database_url)},
            )
        except Exception as exc:
            return self._source(
                source="database",
                status="degraded",
                status_code=DataStatusCode.DATA_MISSING.value,
                status_reason=f"Database engine is unavailable: {exc}",
            )

    def _market_price_source(self) -> SourceHealth:
        try:
            prices = MarketDataRepository().latest_normalized_prices()
        except Exception as exc:
            return self._source(source="market_prices", status="degraded", status_code=DataStatusCode.DATA_MISSING.value, status_reason=str(exc))
        if not prices:
            return self._source(source="market_prices", status="degraded", status_code=DataStatusCode.DATA_MISSING.value, status_reason="No normalized price snapshots are available.")
        stale_count = sum(1 for price in prices if price.status_code in (DataStatusCode.DATA_STALE.value, DataStatusCode.ORACLE_STALE.value))
        status_code = DataStatusCode.DATA_STALE.value if stale_count else DataStatusCode.DATA_FRESH.value
        return self._source(
            source="market_prices",
            status="degraded" if stale_count else "ok",
            status_code=status_code,
            status_reason=f"{len(prices)} latest normalized price snapshots found; stale count: {stale_count}.",
            metadata={"snapshot_count": len(prices), "stale_count": stale_count},
        )

    def _quote_source(self) -> SourceHealth:
        try:
            quotes = MarketDataRepository().latest_normalized_quotes()
        except Exception as exc:
            return self._source(source="quotes", status="degraded", status_code=DataStatusCode.LIQUIDITY_UNKNOWN.value, status_reason=str(exc))
        if not quotes:
            return self._source(source="quotes", status="degraded", status_code=DataStatusCode.LIQUIDITY_UNKNOWN.value, status_reason="No normalized quote snapshots are available.")
        stale_count = sum(1 for quote in quotes if quote.status_code in (DataStatusCode.DATA_STALE.value, DataStatusCode.QUOTE_STALE.value))
        status_code = DataStatusCode.QUOTE_STALE.value if stale_count else DataStatusCode.QUOTE_FRESH.value
        return self._source(
            source="quotes",
            status="degraded" if stale_count else "ok",
            status_code=status_code,
            status_reason=f"{len(quotes)} latest normalized quote snapshots found; stale count: {stale_count}.",
            metadata={"snapshot_count": len(quotes), "stale_count": stale_count},
        )

    def _portfolio_source(self) -> SourceHealth:
        try:
            snapshot = PortfolioSnapshotRepository().latest_snapshot()
        except Exception as exc:
            return self._source(source="portfolio", status="degraded", status_code=DataStatusCode.DATA_MISSING.value, status_reason=str(exc))
        if snapshot is None:
            return self._source(source="portfolio", status="degraded", status_code=DataStatusCode.DATA_MISSING.value, status_reason="No persisted portfolio snapshot is available.")
        snapshot_age = age_seconds(snapshot.generated_at)
        hard_block = snapshot_age is not None and snapshot_age > self.settings.portfolio_balance_hard_block_seconds
        status_code = DataStatusCode.DATA_STALE.value if hard_block else snapshot.status_code
        return self._source(
            source="portfolio",
            status="degraded" if status_code != DataStatusCode.DATA_FRESH.value else "ok",
            status_code=status_code,
            status_reason=snapshot.status_reason if not hard_block else f"Portfolio snapshot is stale at {snapshot_age} seconds old.",
            metadata={"snapshot_id": snapshot.snapshot_id, "age_seconds": snapshot_age},
        )

    def _risk_source(self) -> SourceHealth:
        try:
            assessment = RiskAssessmentRepository().latest_assessment()
        except Exception as exc:
            return self._source(source="risk", status="degraded", status_code=RiskStatusCode.RISK_VETO.value, status_reason=str(exc))
        if assessment is None:
            return self._source(source="risk", status="degraded", status_code=DataStatusCode.DATA_MISSING.value, status_reason="No persisted risk assessment is available.")
        assessment_age = age_seconds(assessment.generated_at)
        hard_block = assessment_age is not None and assessment_age > self.settings.risk_snapshot_hard_block_seconds
        status_code = RiskStatusCode.RISK_VETO.value if hard_block else assessment.status_code
        return self._source(
            source="risk",
            status="degraded" if status_code != RiskStatusCode.RISK_NORMAL.value else "ok",
            status_code=status_code,
            status_reason=assessment.status_reason if not hard_block else f"Risk assessment is stale at {assessment_age} seconds old.",
            metadata={"age_seconds": assessment_age, "risk_score": assessment.risk_score},
        )

    def _ai_source(self) -> SourceHealth:
        if not self.settings.ai_reasoning_enabled:
            return self._source(
                source="ai_reasoning",
                status="ok",
                status_code=SystemStatusCode.SIMULATION_ONLY.value,
                status_reason="AI reasoning is disabled; deterministic fallback explanations are active.",
                metadata={"provider": self.settings.ai_reasoning_provider, "model": self.settings.ai_reasoning_model},
            )
        return self._source(
            source="ai_reasoning",
            status="ok",
            status_code=SystemStatusCode.SIMULATION_ONLY.value,
            status_reason="AI reasoning is enabled; model availability is handled by deterministic fallback.",
            metadata={"provider": self.settings.ai_reasoning_provider, "model": self.settings.ai_reasoning_model},
        )

    def _alerts_from_sources(self, sources: list[SourceHealth]) -> list:
        now = utc_now()
        alerts = []
        for source in sources:
            if source.status_code in BLOCKING_CODES:
                severity = AlertSeverity.CRITICAL.value if source.status_code in (RiskStatusCode.RISK_VETO.value, RiskStatusCode.RISK_PAUSE_REQUIRED.value) else AlertSeverity.HIGH.value
                alerts.append(
                    OpsAlert(
                        alert_id=f"{source.source}:{source.status_code}",
                        severity=severity,
                        status_code=source.status_code,
                        title=f"{source.source} requires attention",
                        message=source.status_reason,
                        source=source.source,
                        recommended_mode="pause",
                        created_at=now,
                        metadata=source.metadata,
                    )
                )
            elif source.status_code in WARNING_CODES:
                alerts.append(
                    OpsAlert(
                        alert_id=f"{source.source}:{source.status_code}",
                        severity=AlertSeverity.WARNING.value,
                        status_code=source.status_code,
                        title=f"{source.source} is restricted",
                        message=source.status_reason,
                        source=source.source,
                        recommended_mode="rebalance_only",
                        created_at=now,
                        metadata=source.metadata,
                    )
                )
        return alerts

    @staticmethod
    def _recommended_mode(alerts: list) -> str:
        if any(alert.recommended_mode == "pause" for alert in alerts):
            return "pause"
        if any(alert.recommended_mode == "rebalance_only" for alert in alerts):
            return "rebalance_only"
        return "monitor_only"

    @staticmethod
    def _overall_status(alerts: list) -> tuple[str, str, str]:
        if any(alert.severity in (AlertSeverity.CRITICAL.value, AlertSeverity.HIGH.value) for alert in alerts):
            return "degraded", SystemStatusCode.DEGRADED.value, "One or more operational sources require restricted mode."
        if alerts:
            return "ok", SystemStatusCode.SIMULATION_ONLY.value, "Operational warnings are active; monitor or rebalance-only behavior is recommended."
        return "ok", SystemStatusCode.SIMULATION_ONLY.value, "Operational sources are usable for local-safe operation."


def evaluate_ops_health(settings: Settings | None = None) -> OpsHealthResponse:
    return OpsHealthEvaluator(settings or get_settings()).evaluate()
