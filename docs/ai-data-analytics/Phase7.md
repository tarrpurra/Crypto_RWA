# AI + Data Analytics Phase 7 Plan

## Purpose

Phase 7 adds local-safe operational hardening for demo and guarded deployment readiness.

The implementation makes degraded state, alerts, and readiness decisions visible. It does not hide missing live validation or convert seeded/local data into production readiness.

## Phase Goal

Build an operational layer with:

- source-level health summaries
- alert threshold evaluation
- log-only alert publishing
- explicit recommended operating modes
- readiness output for guarded rollout decisions
- bounded retry utility for transient operations

## Implemented Surfaces

- `GET /ops/health`
- `GET /ops/alerts`
- `GET /ops/readiness`

## Implemented Behavior

- Source health is summarized for:
  - RPC configuration
  - database engine
  - market prices
  - quotes
  - portfolio snapshots
  - risk assessments
  - AI reasoning mode
- Operational alerts are generated for missing, stale, liquidity-unknown, and hard-veto states.
- Recommended mode is derived deterministically:
  - `pause` for blocking source or risk states
  - `rebalance_only` for restricted warning states
  - `monitor_only` when no operational alerts are active
- Alerts are published through a log-only notifier by default.
- Readiness output exposes blockers, warnings, and `ready_for_live`.
- Retry support is bounded and does not hide persistent failures.

## Safety Boundaries

- No external alert integration is enabled by default.
- No live execution behavior is added.
- Missing data remains visible as degraded or blocked readiness.
- Phase 1B live market validation remains required before claiming live-ready operation.

## Status

`Phase 7 local-safe coding complete; external alert sinks, production runbooks, and live readiness validation can be expanded after Phase 1B.`
