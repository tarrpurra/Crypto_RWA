# AI + Data Analytics Phase 4 Plan

## Purpose

Phase 4 adds deterministic allocation recommendations on top of portfolio and risk state.

This phase is not allowed to bypass risk controls or fabricate market data. If portfolio, risk, price, or quote inputs are missing, the allocation engine must recommend `PAUSE` or `HOLD` and produce no proposal-ready trade actions.

## Phase Goal

Build a local-safe allocation engine with:

- named allocation profiles
- target weights
- drift detection
- clipped rebalance actions
- risk-aware action filtering
- stable `/allocation` API surfaces
- best-effort decision persistence

## Implemented Surfaces

- `GET /allocation/recommendation`
- `POST /allocation/profile`

## Implemented Behavior

- Missing or stale portfolio data returns `PAUSE` with no actions.
- `RISK_VETO` and `RISK_PAUSE_REQUIRED` return `PAUSE` with no actions.
- Drift within tolerance returns `HOLD`.
- Drift outside tolerance returns clipped `BUY` / `SELL` actions when risk permits.
- `RISK_REBALANCE_ONLY` blocks buying volatile `mETH`.
- Trade sizing is clipped by per-asset portfolio and absolute caps.
- Allocation decisions are persisted best-effort.

## Safety Boundaries

- No executable proposal is emitted by the allocation endpoint.
- Proposal creation must validate that the requested action is part of the current deterministic rebalance plan.
- Missing prices, missing portfolio values, or missing vault configuration must not produce synthetic balances or proposal-ready actions.

## Status

`Phase 4 local-safe coding complete; live execution readiness remains gated by Phase 1B market validation and proposal policy checks.`
