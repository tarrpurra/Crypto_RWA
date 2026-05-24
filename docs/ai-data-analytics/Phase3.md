# AI + Data Analytics Phase 3 Plan

## Purpose

Phase 3 adds deterministic, explainable risk scoring before any AI-authored recommendation or execution-facing proposal can be trusted.

This phase is not about optimizing yield. It is about making missing data, stale inputs, portfolio valuation gaps, route liquidity gaps, and operational readiness issues visible as explicit risk states.

## Phase Goal

Build a risk engine for `services/agent` with:

- stable risk score and band schema
- bucket-level explanations
- hard veto handling
- confidence and data sufficiency indicators
- conservative recommended actions
- stable `/risk` API surfaces
- no AI override of deterministic controls

## Phase 3 Status

`Phase 3 local-safe deterministic risk engine complete; live quote-depth and mainnet oracle trust scoring remain gated by Phase 1B validation.`

## Dependency On Earlier Phases

Phase 3 may start from:

- Phase 1A: Sepolia scaffold complete
- Phase 2: local-safe portfolio analytics complete

Phase 3 must not assume Phase 1B mainnet/fork market validation. Until live quote and oracle paths are verified, risk outputs must remain conservative and block execution-facing recommendations.

## In Scope

- `services/agent/app/schemas/risk.py`
- `services/agent/app/api/risk.py`
- `services/agent/risk/engine.py`
- deterministic bucket scoring for:
  - portfolio valuation completeness
  - market/quote availability
  - concentration and target drift
  - operational readiness
  - data quality and freshness
- `GET /risk/current`
- scenario fixtures and tests

## Out Of Scope

- AI-generated explanations
- executable trade approvals
- signed proposals
- claiming quote liquidity before Phase 1B validation
- hiding missing inputs behind optimistic defaults

## Risk Rules

Risk must fail conservatively:

- missing portfolio snapshot -> hard veto and `pause`
- unvalued positions -> hard veto and `pause`
- missing route/quote validation -> no execution; at most `rebalance_only`
- high drift without executable quote validation -> `rebalance_only`
- monitor-only runtime -> human approval required before any execution-facing action

## API Surface

Initial endpoint:

- `GET /risk/current`
- `GET /risk/assessments`
- `GET /risk/assessments/latest`

Response must include:

- `asset`
- `recommended_action`
- `risk_score`
- `risk_band`
- `confidence`
- `reasoning_summary`
- `data_sources_used`
- `hard_veto_status`
- `required_human_approval_status`
- `buckets`
- `status`
- `status_code`
- `status_reason`

## Acceptance Criteria

Phase 3 local-safe implementation is complete when:

- frontend can fetch current risk state
- missing portfolio data produces a hard veto
- partial portfolio valuation produces a hard veto
- missing live quote validation prevents execution recommendations
- risk buckets are deterministic and explainable
- risk output can feed Phase 4 allocation without reshaping
- unit and integration tests cover normal, missing, partial, and drifted states

Implemented local-safe behavior:

- risk score is computed from weighted deterministic buckets
- restrictive bucket statuses escalate the overall status even when the weighted score is numerically lower
- hard vetoes override all other scoring and force `recommended_action = pause`
- missing quote validation forces `RISK_REBALANCE_ONLY` / `rebalance_only`
- current risk assessments are persisted on a best-effort basis
- latest and recent persisted risk assessments are exposed for frontend and replay use

## Deferred Until Phase 1B / Later Phases

- quote-depth based liquidity scoring from live AGNI and Merchant Moe quotes
- mainnet/fork oracle trust scoring from verified Ondo and Pyth reads
- AI-authored explanations
- proposal-ready risk approvals
