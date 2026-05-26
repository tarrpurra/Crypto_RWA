# AI + Data Analytics Phase 6 Plan

## Purpose

Phase 6 adds deterministic simulations and benchmark outputs for strategy validation and demo surfaces.

The implementation is local-safe. It replays explicit seeded scenarios and does not claim live market validation.

## Phase Goal

Build a replayable simulation layer with:

- seeded stress scenarios
- deterministic backtest replay
- passive and strategy benchmark summaries
- drawdown, return, turnover, rebalance, veto, hit-rate, and risk-band metrics
- stable `/backtests` API surfaces

## Implemented Surfaces

- `GET /backtests/scenarios`
- `POST /backtests/run`
- `GET /backtests/demo-summary`

## Implemented Behavior

- Three reproducible seeded scenarios are available:
  - `depeg`
  - `liquidity_shock`
  - `stale_oracle`
- Backtests replay seeded portfolio and risk snapshots through the existing allocation engine.
- Benchmarks compare:
  - hold USDY
  - static basket
  - AIxRWA Guardian strategy
- Scenario output includes step-level risk band, risk score, recommended action, rebalance actions, and notes.
- Benchmark output includes total return, max drawdown, turnover, rebalance count, veto count, hit rate, and risk-band frequency.
- Missing or unknown scenarios fail safely with an HTTP 404 through the API.

## Safety Boundaries

- No live price, quote, oracle, wallet, or vault data is fabricated.
- Scenario data is explicitly seeded and marked as local simulation input.
- Simulations do not create proposals or execute trades.
- Live readiness remains gated by Phase 1B market validation.

## Status

`Phase 6 local-safe coding complete; live replay from persisted market snapshots and production scenario storage can be expanded later.`
