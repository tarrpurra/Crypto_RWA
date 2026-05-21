from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime


@dataclass(frozen=True)
class FreshnessEvaluation:
    status: str
    status_code: str
    status_reason: str
    age_seconds: int | None
    warning: bool
    hard_blocked: bool


def utc_now() -> datetime:
    return datetime.now(UTC)


def age_seconds(publish_time: datetime | None, observed_time: datetime | None = None) -> int | None:
    if publish_time is None:
        return None
    observed = observed_time or utc_now()
    return max(0, int((observed - publish_time).total_seconds()))


def evaluate_freshness(
    *,
    age_in_seconds: int | None,
    fresh_limit_seconds: int,
    warn_after_seconds: int,
    hard_block_after_seconds: int | None,
    fresh_code: str,
    stale_code: str,
    source_label: str,
) -> FreshnessEvaluation:
    if age_in_seconds is None:
        return FreshnessEvaluation(
            status="missing",
            status_code=stale_code,
            status_reason=f"{source_label} publish timestamp is missing.",
            age_seconds=None,
            warning=True,
            hard_blocked=hard_block_after_seconds == 0,
        )

    warning = age_in_seconds > warn_after_seconds
    hard_blocked = hard_block_after_seconds is not None and age_in_seconds > hard_block_after_seconds
    if age_in_seconds <= fresh_limit_seconds:
        return FreshnessEvaluation(
            status="ok",
            status_code=fresh_code,
            status_reason=f"{source_label} is within freshness limits.",
            age_seconds=age_in_seconds,
            warning=warning,
            hard_blocked=False,
        )

    reason = f"{source_label} is stale at {age_in_seconds} seconds old."
    if hard_blocked:
        reason = f"{source_label} exceeded the hard block threshold at {age_in_seconds} seconds old."

    return FreshnessEvaluation(
        status="stale",
        status_code=stale_code,
        status_reason=reason,
        age_seconds=age_in_seconds,
        warning=warning,
        hard_blocked=hard_blocked,
    )
