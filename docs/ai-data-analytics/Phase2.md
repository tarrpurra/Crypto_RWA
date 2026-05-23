# AI + Data Analytics Phase 2 Plan

## Purpose

Phase 2 turns Phase 1 market inputs into portfolio analytics surfaces that can be consumed by the frontend and later risk, allocation, and AI decision layers.

This phase is not about emitting executable trades. It is about producing deterministic portfolio state, exposure metrics, and data-quality annotations while preserving safe behavior when balances, prices, quotes, or verification are missing.

## Phase Goal

Build a portfolio analytics base for `services/agent` with:

- typed portfolio snapshot schemas
- deterministic valuation from balances and normalized prices
- explicit data-quality status on every response
- allocation weight and drift-ready fields
- stable `/portfolio` API surfaces
- no fabricated balances, prices, or route liquidity

## Dependency On Phase 1

Phase 2 may start from the Phase 1A Sepolia scaffold, but it must not assume strict Phase 1 completion.

Current boundary:

- Phase 1A: Sepolia scaffold complete and degraded behavior validated
- Phase 1B: mainnet or mainnet-fork market validation pending

Phase 2 must treat `DATA_MISSING`, `DATA_PARTIAL`, `LIQUIDITY_UNKNOWN`, `mainnet_only`, and verification-gated records as decision-blocking or confidence-reducing inputs.

## In Scope

- `services/agent/app/schemas/portfolio.py`
- `services/agent/app/api/portfolio.py`
- `services/agent/modules/market_data/balances.py`
- basic portfolio valuation and exposure calculations
- current portfolio endpoint
- data sufficiency and degraded-mode annotations
- unit and integration tests for deterministic portfolio behavior

## Out Of Scope

- executable rebalance proposals
- AI-generated recommendations
- private-key or wallet signing flows
- pretending Sepolia has mainnet RWA liquidity
- using WETH as a substitute for mETH or USDY market validation
- live mainnet trade routing before Phase 1B is complete

## Implementation Principles

- never fabricate portfolio balances
- use configured vault or wallet addresses only as metadata until balance reads are implemented and verified
- compute valuations only from supplied balances and fresh/verified price snapshots
- if a position cannot be valued, keep the position and mark the valuation missing
- if total portfolio value cannot be computed, return degraded status instead of a zero-value portfolio
- keep route liquidity and slippage impact optional until live quote decoding is verified

## API Surface

Initial endpoint:

- `GET /portfolio/current`

Initial behavior:

- returns a typed portfolio snapshot
- returns `DATA_MISSING` when no portfolio balance source is configured
- returns `DATA_PARTIAL` when balances exist but one or more positions cannot be valued
- returns `DATA_FRESH` only when balances and required prices are usable

## Snapshot Fields

Each response should include:

- `snapshot_id`
- `generated_at`
- `portfolio_address`
- `chain_id`
- `base_currency`
- `total_value_usd`
- `positions`
- `data_sources_used`
- `status`
- `status_code`
- `status_reason`

Each position should include:

- `asset_key`
- `asset_symbol`
- `asset_address`
- `chain_id`
- `balance`
- `balance_source`
- `price_usd`
- `value_usd`
- `weight`
- `valuation_status`
- `status_code`
- `status_reason`

## Acceptance Criteria

Phase 2 is complete when:

- frontend can fetch a current portfolio snapshot
- missing balance configuration produces explicit degraded output
- deterministic valuation works for supplied balance and price inputs
- unpriced positions remain visible and marked unvalued
- analytics output can feed Phase 3 risk scoring without API reshaping
- unit and integration tests cover complete, partial, and missing-data cases

## First Implementation Slice

The first slice will add:

- portfolio schemas
- deterministic snapshot engine
- `/portfolio/current`
- tests for missing-balance degradation and valuation math

Live balance reads and historical persistence remain later Phase 2 work.
