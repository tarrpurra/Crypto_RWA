from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Sequence

from services.agent.app.core.status_codes import DataStatusCode, RiskStatusCode, RuntimeMode
from services.agent.app.schemas.market_data import NormalizedPriceSnapshot
from services.agent.app.schemas.portfolio import PortfolioSnapshotResponse
from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot
from services.agent.app.schemas.risk import RiskAssessmentResponse, RiskBucket
from services.agent.app.schemas.risk import RiskScoreBandRange, RiskScoreScale
from services.agent.modules.oracle.freshness import utc_now


BASE_BUCKET_WEIGHTS = {
    "portfolio_valuation": 0.30,
    "quote_availability": 0.20,
    "concentration_drift": 0.20,
    "ops_readiness": 0.10,
    "data_quality": 0.20,
}

MARKET_BUCKET_WEIGHTS = {
    "portfolio_valuation": 0.20,
    "quote_availability": 0.15,
    "concentration_drift": 0.15,
    "ops_readiness": 0.10,
    "data_quality": 0.15,
    "oracle_freshness": 0.15,
    "usdy_depeg": 0.05,
    "liquidity_slippage": 0.05,
}

MARKET_BUCKETS = {"oracle_freshness", "usdy_depeg", "liquidity_slippage"}
USD_STABLE_SYMBOLS = {"USDC", "USDC.E", "USDT", "DAI", "MUSD"}


def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _decimal_or_none(value: str | int | float | Decimal | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


class RiskEngine:
    def evaluate(
        self,
        *,
        portfolio: PortfolioSnapshotResponse,
        runtime_mode: RuntimeMode,
        target_chain: str,
        quote_validation_status: str = DataStatusCode.DATA_MISSING.value,
        prices: Sequence[NormalizedPriceSnapshot] | None = None,
        quotes: Sequence[NormalizedQuoteSnapshot] | None = None,
    ) -> RiskAssessmentResponse:
        buckets = [
            self._portfolio_valuation_bucket(portfolio),
            self._quote_availability_bucket(quote_validation_status),
            self._concentration_drift_bucket(portfolio),
            self._ops_readiness_bucket(runtime_mode),
            self._data_quality_bucket(portfolio),
        ]
        if prices is not None:
            buckets.append(self._oracle_freshness_bucket(prices))
        if prices is not None and quotes is not None:
            buckets.append(self._usdy_depeg_bucket(prices, quotes))
        if quotes is not None:
            buckets.append(self._liquidity_slippage_bucket(quotes))

        bucket_weights = self._bucket_weight_map(buckets)
        buckets = self._with_bucket_weights(buckets, bucket_weights)
        hard_veto = any(bucket.hard_veto for bucket in buckets)
        raw_risk_score = 100.0 if hard_veto else self._weighted_score(buckets)
        risk_score = self._normalize_risk_score(raw_risk_score)
        status_code = self._status_code(risk_score=risk_score, hard_veto=hard_veto, buckets=buckets)
        recommended_action = self._recommended_action(status_code)
        confidence = self._normalize_confidence(
            self._confidence(portfolio=portfolio, hard_veto=hard_veto, quote_validation_status=quote_validation_status)
        )
        data_sources = sorted({source for bucket in buckets for source in bucket.data_sources_used})

        return RiskAssessmentResponse(
            asset="portfolio",
            recommended_action=recommended_action,
            risk_score=risk_score,
            risk_score_normalized=risk_score,
            risk_band=status_code,
            risk_score_scale=self._risk_score_scale(),
            confidence=confidence,
            confidence_normalized=confidence,
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
                "Execution-facing recommendations remain blocked when canonical hard guards are active.",
            ],
            metadata={
                "portfolio_snapshot_id": portfolio.snapshot_id,
                "quote_validation_status": quote_validation_status,
                "latest_price_snapshot_ids": [snapshot.snapshot_id for snapshot in prices] if prices is not None else [],
                "latest_quote_snapshot_ids": [snapshot.snapshot_id for snapshot in quotes] if quotes is not None else [],
                "scoring_method": "weighted_bucket_score_with_restrictive_status_escalation",
                "bucket_weights": bucket_weights,
            },
        )

    @staticmethod
    def _normalize_risk_score(value: float) -> float:
        return round(max(0.0, min(100.0, value)), 2)

    @staticmethod
    def _normalize_confidence(value: float) -> float:
        return round(max(0.0, min(1.0, value)), 2)

    @staticmethod
    def _risk_score_scale() -> RiskScoreScale:
        return RiskScoreScale(
            min_score=0.0,
            max_score=100.0,
            higher_is_worse=True,
            bands=[
                RiskScoreBandRange(
                    band=RiskStatusCode.RISK_NORMAL.value,
                    min_inclusive=0.0,
                    max_exclusive=25.0,
                    label="Normal",
                ),
                RiskScoreBandRange(
                    band=RiskStatusCode.RISK_CAUTION.value,
                    min_inclusive=25.0,
                    max_exclusive=50.0,
                    label="Caution",
                ),
                RiskScoreBandRange(
                    band=RiskStatusCode.RISK_REBALANCE_ONLY.value,
                    min_inclusive=50.0,
                    max_exclusive=70.0,
                    label="Rebalance Only",
                ),
                RiskScoreBandRange(
                    band=RiskStatusCode.RISK_REDUCE_ONLY.value,
                    min_inclusive=70.0,
                    max_exclusive=90.0,
                    label="Reduce Only",
                ),
                RiskScoreBandRange(
                    band=RiskStatusCode.RISK_PAUSE_REQUIRED.value,
                    min_inclusive=90.0,
                    max_exclusive=100.0,
                    label="Pause Required",
                ),
                RiskScoreBandRange(
                    band=RiskStatusCode.RISK_VETO.value,
                    min_inclusive=100.0,
                    max_exclusive=None,
                    label="Veto",
                ),
            ],
        )

    @staticmethod
    def _bucket_weight_map(buckets: list[RiskBucket]) -> dict[str, float]:
        bucket_names = {bucket.bucket for bucket in buckets}
        return MARKET_BUCKET_WEIGHTS if bucket_names & MARKET_BUCKETS else BASE_BUCKET_WEIGHTS

    @staticmethod
    def _with_bucket_weights(buckets: list[RiskBucket], bucket_weights: dict[str, float]) -> list[RiskBucket]:
        return [
            bucket.model_copy(update={"weight": bucket_weights.get(bucket.bucket, 0.0)})
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
        capped = [
            position.asset_key
            for position in portfolio.positions
            if position.target_weight is None and RiskEngine._exceeds_asset_concentration_limit(position.asset_symbol, position.weight)
        ]
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
        if drifted or capped:
            affected = sorted(set(drifted + capped))
            return RiskBucket(
                bucket="concentration_drift",
                score=55,
                status="watch",
                status_code=RiskStatusCode.RISK_REBALANCE_ONLY.value,
                reason=f"Positions are outside target drift or concentration tolerance: {', '.join(affected)}.",
                data_sources_used=portfolio.data_sources_used,
                metadata={"drifted_assets": drifted, "concentration_capped_assets": capped},
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
    def _exceeds_asset_concentration_limit(asset_symbol: str, weight: str | None) -> bool:
        parsed = _decimal_or_none(weight)
        if parsed is None:
            return False
        symbol = asset_symbol.upper()
        if symbol == "METH":
            return parsed > Decimal("0.40")
        if symbol == "USDY":
            return parsed > Decimal("0.60")
        return False

    @staticmethod
    def _oracle_freshness_bucket(prices: Sequence[NormalizedPriceSnapshot]) -> RiskBucket:
        if not prices:
            return RiskBucket(
                bucket="oracle_freshness",
                score=100,
                status="blocked",
                status_code=RiskStatusCode.RISK_VETO.value,
                reason="No normalized price snapshots are available for oracle freshness checks.",
                hard_veto=True,
                data_sources_used=["normalized_prices"],
            )

        from services.agent.app.core.settings import get_settings

        settings = get_settings()
        now = utc_now()
        max_score = 15.0
        status = "ok"
        status_code = RiskStatusCode.RISK_NORMAL.value
        hard_veto = False
        notes: list[str] = []
        stale_assets: list[str] = []
        max_age = 0.0

        for price in prices:
            age = (now - _as_aware_utc(price.observed_timestamp)).total_seconds()
            max_age = max(max_age, age)
            symbol = price.asset_symbol.upper()
            if symbol == "USDY":
                warn_seconds = settings.ondo_usdy_oracle_warn_seconds
                hard_seconds = settings.ondo_usdy_oracle_hard_block_seconds
                label = "USDY oracle"
            else:
                warn_seconds = settings.pyth_eth_usd_warn_seconds
                hard_seconds = settings.pyth_eth_usd_hard_block_seconds
                label = f"{symbol} oracle"

            if age > hard_seconds:
                max_score = 100.0
                status = "blocked"
                status_code = RiskStatusCode.RISK_VETO.value
                hard_veto = True
                stale_assets.append(symbol)
                notes.append(f"{label} is hard-stale: {age:.1f}s old.")
            elif age > warn_seconds and not hard_veto:
                max_score = max(max_score, 50.0)
                status = "watch"
                status_code = RiskStatusCode.RISK_CAUTION.value
                stale_assets.append(symbol)
                notes.append(f"{label} is warning-stale: {age:.1f}s old.")

        return RiskBucket(
            bucket="oracle_freshness",
            score=max_score,
            status=status,
            status_code=status_code,
            reason=" ".join(notes) if notes else "Oracle price snapshots are fresh enough for risk scoring.",
            hard_veto=hard_veto,
            data_sources_used=sorted({source for price in prices for source in price.data_sources_used} or {"normalized_prices"}),
            metadata={"max_age_seconds": max_age, "stale_assets": sorted(set(stale_assets))},
        )

    @staticmethod
    def _usdy_depeg_bucket(
        prices: Sequence[NormalizedPriceSnapshot],
        quotes: Sequence[NormalizedQuoteSnapshot],
    ) -> RiskBucket:
        usdy_price = next((price for price in prices if price.asset_symbol.upper() == "USDY"), None)
        oracle_value = _decimal_or_none(usdy_price.price_usd if usdy_price else None)
        if oracle_value is None or oracle_value <= 0:
            return RiskBucket(
                bucket="usdy_depeg",
                score=35,
                status="restricted",
                status_code=RiskStatusCode.RISK_CAUTION.value,
                reason="USDY oracle price is unavailable for depeg comparison.",
                data_sources_used=["normalized_prices"],
            )

        max_diff = Decimal("0")
        compared_routes: list[str] = []
        for quote in quotes:
            token_in = quote.token_in_symbol.upper()
            token_out = quote.token_out_symbol.upper()
            if "USDY" not in {token_in, token_out}:
                continue
            if not ({token_in, token_out} & USD_STABLE_SYMBOLS):
                continue
            dex_value = _decimal_or_none(quote.quoted_price)
            if dex_value is None or dex_value <= 0:
                continue
            diff = abs(oracle_value - dex_value) / oracle_value
            max_diff = max(max_diff, diff)
            compared_routes.append(quote.route_id)

        if not compared_routes:
            return RiskBucket(
                bucket="usdy_depeg",
                score=10,
                status="ok",
                status_code=RiskStatusCode.RISK_NORMAL.value,
                reason="No USDY stable-pair DEX quote is available; depeg check is not applied to volatile pairs.",
                data_sources_used=["normalized_prices", "normalized_quotes"],
            )

        if max_diff > Decimal("0.02"):
            return RiskBucket(
                bucket="usdy_depeg",
                score=100,
                status="blocked",
                status_code=RiskStatusCode.RISK_VETO.value,
                reason=f"Severe USDY depeg detected versus stable-pair DEX quote: {float(max_diff * 100):.2f}%.",
                hard_veto=True,
                data_sources_used=["normalized_prices", "normalized_quotes"],
                metadata={"max_deviation_pct": str(max_diff * 100), "compared_routes": compared_routes},
            )
        if max_diff > Decimal("0.01"):
            return RiskBucket(
                bucket="usdy_depeg",
                score=60,
                status="restricted",
                status_code=RiskStatusCode.RISK_REBALANCE_ONLY.value,
                reason=f"Moderate USDY depeg detected versus stable-pair DEX quote: {float(max_diff * 100):.2f}%.",
                data_sources_used=["normalized_prices", "normalized_quotes"],
                metadata={"max_deviation_pct": str(max_diff * 100), "compared_routes": compared_routes},
            )
        return RiskBucket(
            bucket="usdy_depeg",
            score=10,
            status="ok",
            status_code=RiskStatusCode.RISK_NORMAL.value,
            reason="USDY oracle and stable-pair DEX quote are within depeg tolerance.",
            data_sources_used=["normalized_prices", "normalized_quotes"],
            metadata={"max_deviation_pct": str(max_diff * 100), "compared_routes": compared_routes},
        )

    @staticmethod
    def _liquidity_slippage_bucket(quotes: Sequence[NormalizedQuoteSnapshot]) -> RiskBucket:
        if not quotes:
            return RiskBucket(
                bucket="liquidity_slippage",
                score=50,
                status="restricted",
                status_code=RiskStatusCode.RISK_REBALANCE_ONLY.value,
                reason="No normalized quotes are available for liquidity and slippage checks.",
                data_sources_used=["normalized_quotes"],
            )

        max_slippage_bps = Decimal("0")
        for quote in quotes:
            slippage = _decimal_or_none(quote.estimated_slippage_bps)
            if slippage is not None:
                max_slippage_bps = max(max_slippage_bps, slippage)

        if max_slippage_bps > Decimal("200"):
            return RiskBucket(
                bucket="liquidity_slippage",
                score=100,
                status="blocked",
                status_code=RiskStatusCode.RISK_VETO.value,
                reason=f"Critical route slippage is above tolerance: {max_slippage_bps} bps.",
                hard_veto=True,
                data_sources_used=["normalized_quotes"],
                metadata={"max_slippage_bps": str(max_slippage_bps)},
            )
        if max_slippage_bps > Decimal("100"):
            return RiskBucket(
                bucket="liquidity_slippage",
                score=50,
                status="restricted",
                status_code=RiskStatusCode.RISK_REBALANCE_ONLY.value,
                reason=f"Moderate route slippage is above warning tolerance: {max_slippage_bps} bps.",
                data_sources_used=["normalized_quotes"],
                metadata={"max_slippage_bps": str(max_slippage_bps)},
            )
        return RiskBucket(
            bucket="liquidity_slippage",
            score=10,
            status="ok",
            status_code=RiskStatusCode.RISK_NORMAL.value,
            reason="Route slippage is within configured risk tolerance.",
            data_sources_used=["normalized_quotes"],
            metadata={"max_slippage_bps": str(max_slippage_bps)},
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
        if portfolio.status_code == DataStatusCode.DATA_PARTIAL.value:
            return RiskBucket(
                bucket="data_quality",
                score=60,
                status="restricted",
                status_code=RiskStatusCode.RISK_CAUTION.value,
                reason=f"Portfolio snapshot is partial: {portfolio.status_reason}",
                data_sources_used=portfolio.data_sources_used,
                metadata={"portfolio_status": portfolio.status_code},
            )
        score = 100
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
        if RiskStatusCode.RISK_REDUCE_ONLY.value in bucket_status_codes:
            return RiskStatusCode.RISK_REDUCE_ONLY.value
        if RiskStatusCode.RISK_REBALANCE_ONLY.value in bucket_status_codes:
            return RiskStatusCode.RISK_REBALANCE_ONLY.value
        if RiskStatusCode.RISK_CAUTION.value in bucket_status_codes:
            return RiskStatusCode.RISK_CAUTION.value
        if risk_score >= 90:
            return RiskStatusCode.RISK_PAUSE_REQUIRED.value
        if risk_score >= 70:
            return RiskStatusCode.RISK_REDUCE_ONLY.value
        if risk_score >= 50:
            return RiskStatusCode.RISK_REBALANCE_ONLY.value
        if risk_score >= 25:
            return RiskStatusCode.RISK_CAUTION.value
        return RiskStatusCode.RISK_NORMAL.value

    @staticmethod
    def _recommended_action(status_code: str) -> str:
        if status_code in {RiskStatusCode.RISK_VETO.value, RiskStatusCode.RISK_PAUSE_REQUIRED.value}:
            return "pause"
        if status_code == RiskStatusCode.RISK_REDUCE_ONLY.value:
            return "reduce_only"
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
            return "Risk engine found a canonical hard veto from portfolio, oracle, quote, depeg, or liquidity checks."
        if status_code == RiskStatusCode.RISK_REDUCE_ONLY.value:
            return "Risk requires reducing exposure before normal rebalancing can continue."
        if status_code == RiskStatusCode.RISK_REBALANCE_ONLY.value:
            return "Risk is constrained by missing live quote validation; execution-facing actions remain blocked."
        return "Risk engine completed deterministic scoring without hard vetoes."

    @staticmethod
    def _status_reason(status_code: str) -> str:
        if status_code == RiskStatusCode.RISK_VETO.value:
            return "One or more hard veto conditions are active."
        if status_code == RiskStatusCode.RISK_REDUCE_ONLY.value:
            return "Risk allows only exposure-reducing actions."
        if status_code == RiskStatusCode.RISK_REBALANCE_ONLY.value:
            return "Risk allows analysis only; execution remains gated."
        if status_code == RiskStatusCode.RISK_CAUTION.value:
            return "Risk requires monitoring and human review."
        return "Risk is within normal deterministic bounds."
