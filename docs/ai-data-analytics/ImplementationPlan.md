# AI + Data Analytics Service Implementation Plan

## Service Mission

The AI + Data Analytics service is the decision and analytics layer of AIxRWA.

Its job is to:

- ingest and normalize market data
- compute portfolio and risk analytics
- generate target allocation recommendations
- explain the reasoning behind recommendations
- simulate outcomes and benchmark strategy quality

## Owned Deliverables

- market data ingestion
- oracle normalization
- route quote sampling
- portfolio snapshot engine
- risk engine
- allocation engine
- AI reasoning layer
- simulation and backtest engine
- analytics APIs

## Design Principles

- deterministic data first
- AI must explain, not override controls
- store snapshots for replay and benchmarking
- every recommendation should be reproducible
- risk checks must run before proposals are emitted
- degradation path must exist when data is stale or models fail

## Planning Assumptions

- primary target environment is Mantle Sepolia during MVP build-out
- the service is advisory first and execution-enabling second
- on-chain data, oracle data, and quote data can fail independently and must be tracked independently
- Phase 0 and Phase 1 should produce usable mock-safe development surfaces even before live execution data is complete
- shared schemas may start inside `services/agent/app/schemas` and later be promoted into `packages/shared-types` if frontend and backend duplication becomes material

## Cross-Team Dependencies

Dependencies from smart contracts:

- verified contract addresses by environment
- Foundry artifacts and ABI outputs for core contracts
- approved execution payload fields and event vocabulary
- router allowlist and selector validation constraints

Dependencies from frontend:

- required API response shapes for dashboard, risk, allocation, approvals, and strategy lab views
- stale-data, degraded-mode, and simulation-only state handling expectations
- prioritization of which analytics screens unblock demos first

Dependencies this service provides outward:

- portfolio state snapshots
- market and quote freshness status
- risk score, bucket breakdown, and hard veto state
- target allocation recommendations and rationale payloads
- proposal-ready execution intent payloads bounded by policy
- scenario and benchmark outputs for demo surfaces

## Proposed Folder Structure

```text
/services/agent
|-- app/
|   |-- main.py
|   |-- api/
|   |   |-- portfolio.py
|   |   |-- risk.py
|   |   |-- allocation.py
|   |   |-- decisions.py
|   |   `-- backtests.py
|   |-- core/
|   |   |-- config.py
|   |   |-- logging.py
|   |   `-- settings.py
|   `-- schemas/
|       |-- portfolio.py
|       |-- risk.py
|       |-- allocation.py
|       `-- proposals.py
|-- modules/
|   |-- market_data/
|   |   |-- balances.py
|   |   |-- prices.py
|   |   `-- snapshots.py
|   |-- oracle/
|   |   |-- hermes_client.py
|   |   |-- pyth_parser.py
|   |   `-- freshness.py
|   |-- quotes/
|   |   |-- agni_quotes.py
|   |   |-- merchant_moe_quotes.py
|   |   `-- route_ranker.py
|   |-- proposals/
|   |   |-- builder.py
|   |   `-- validator.py
|   `-- alerts/
|       |-- notifier.py
|       `-- thresholds.py
|-- strategies/
|   |-- allocation/
|   |   |-- profiles.py
|   |   |-- rebalance.py
|   |   `-- clip_sizing.py
|   `-- decision_templates/
|       |-- prompt_builder.py
|       |-- parser.py
|       `-- fallback_rules.py
|-- risk/
|   |-- buckets/
|   |   |-- depeg.py
|   |   |-- liquidity.py
|   |   |-- oracle.py
|   |   |-- concentration.py
|   |   `-- ops.py
|   |-- scoring/
|   |   |-- weights.py
|   |   `-- score_engine.py
|   `-- guards/
|       |-- trade_guard.py
|       `-- policy_guard.py
|-- simulations/
|   |-- backtests/
|   |   |-- engine.py
|   |   `-- metrics.py
|   |-- stress/
|   |   |-- depeg_scenario.py
|   |   |-- stale_oracle_scenario.py
|   |   `-- liquidity_shock_scenario.py
|   `-- benchmarks/
|       |-- hold_usdy.py
|       |-- static_basket.py
|       `-- guardian_strategy.py
|-- repositories/
|   |-- db/
|   |   |-- models.py
|   |   |-- session.py
|   |   `-- migrations/
|   `-- cache/
|       `-- redis_client.py
|-- jobs/
|   |-- ingest_prices.py
|   |-- sample_quotes.py
|   |-- compute_risk.py
|   `-- publish_snapshots.py
`-- tests/
    |-- unit/
    |-- integration/
    `-- scenarios/
```

## Phase-Wise Implementation

### Phase 0: Bootstrap

Goal:
Create the service skeleton, configuration boundary, and shared contracts for every later module.

Primary outcomes:

- a bootable FastAPI service with predictable startup behavior
- environment-driven settings for chain, contracts, data sources, and runtime mode
- reusable schemas for portfolio, market, risk, allocation, and decision outputs
- a documented error and degrade-state vocabulary that later phases must reuse
- test scaffolding for unit, integration, and scenario coverage

Detailed execution guide:

- see `docs/ai-data-analytics/Phase0.md`

Tasks:

- scaffold `services/agent` layout around `app`, `modules`, `risk`, `strategies`, `simulations`, `repositories`, `jobs`, and `tests`
- normalize application startup, router registration, and health/status endpoints
- define settings for RPC, contract addresses, oracle endpoints, quote providers, storage, cache, AI provider toggles, and runtime safety mode
- add structured logging, request identifiers, and explicit error response models
- define DTOs for prices, quotes, portfolio snapshots, risk outputs, allocation outputs, proposal payloads, and degrade-state metadata
- add baseline test layout and example tests for settings and schema validation
- document service ownership boundaries, naming rules, and acceptance criteria for later contributors

Deliverables:

- bootable FastAPI service
- settings loader
- typed schemas
- error vocabulary and health/status contract
- Phase 0 implementation checklist

Acceptance:

- service starts locally
- schemas are reusable by all modules
- no business logic is coupled to the API layer
- settings fail safely when required configuration is missing
- downstream phases can add modules without reworking startup or schema conventions

### Phase 1: Market and Oracle Ingestion

Goal:
Build reliable, timestamped ingestion of price, oracle, and route quote inputs.

Primary outcomes:

- normalized price records with source and freshness metadata
- repeatable quote sampling across approved venues
- raw snapshot persistence suitable for replay and debugging
- stale-data detection feeding directly into risk and decision gating

Tasks:

- integrate Hermes / Pyth price fetches
- implement asset price normalization
- sample AGNI and Merchant Moe quotes
- store raw snapshots
- define freshness thresholds per source type
- record ingestion failures without masking missing live data
- add read models for latest price and latest quote per asset pair / route

Deliverables:

- price ingestion job
- quote sampling job
- persistent raw data storage
- source freshness utility
- ingestion status endpoint or module surface consumed by health checks

Acceptance:

- prices are timestamped and queryable
- quotes are sampled on a schedule
- stale data can be detected
- source errors are visible without crashing the entire service
- data provenance is attached to normalized outputs

### Phase 2: Portfolio and Analytics Base

Goal:
Turn raw data into portfolio state and market analytics.

Primary outcomes:

- deterministic portfolio snapshots from balances, prices, and metadata
- exposure and allocation drift metrics that reconcile to balances
- analytics endpoints the frontend can consume before AI reasoning exists
- stored historical snapshots ready for replay and benchmark comparisons

Tasks:

- compute portfolio snapshots
- calculate exposures and target deltas
- estimate route depth and slippage impact
- expose current portfolio analytics APIs
- define portfolio valuation conventions for cash, stables, and yield-bearing assets
- add snapshot persistence strategy for both current-state reads and historical replay
- provide data-quality annotations on every top-level analytics response

Deliverables:

- portfolio snapshot engine
- current state APIs
- basic allocation metrics
- historical snapshot repository contract
- portfolio schema version baseline

Acceptance:

- frontend can fetch current portfolio and market overview
- snapshots are stored historically
- exposure metrics reconcile with balances
- analytics responses clearly distinguish live, stale, and degraded values

### Phase 3: Risk Engine

Goal:
Implement explainable risk scoring before any AI decision is trusted.

Primary outcomes:

- explainable risk buckets with individual rationale
- weighted scoring plus explicit hard veto rules
- operator-readable notes explaining why an action is allowed, restricted, or blocked
- stable risk payloads for frontend, approvals, and decisioning consumers

Tasks:

- build bucket calculators
- implement weighted risk score
- define action bands
- generate risk notes and precheck results
- define confidence and data sufficiency rules for each bucket
- add hard veto handling for stale oracle, severe depeg, policy breach, or missing balances
- test deterministic scoring behavior against fixed scenarios

Deliverables:

- risk score engine
- bucket breakdown output
- risk API
- hard veto evaluator
- scenario fixtures for critical stress conditions

Acceptance:

- high-risk states are visible and reproducible
- risk output includes score, band, notes, and confidence
- execution-blocking conditions are explicit
- the same inputs always produce the same score and veto state

### Phase 4: Allocation Engine

Goal:
Generate target weights and rebalance plans.

Primary outcomes:

- profile-driven target weights
- policy-bounded rebalance recommendations
- trade clipping and pacing rules that avoid oversized transitions
- rationale payloads that remain understandable without AI

Tasks:

- implement allocation profiles
- compute target weights based on market and policy state
- implement clip sizing
- generate rebalance recommendations
- encode concentration caps, minimum cash buffers, and protected-asset floors
- translate portfolio drift into prioritized rebalance actions
- distinguish between informational recommendations and proposal-ready recommendations

Deliverables:

- allocation engine
- clip scheduler
- rationale payload for UI and operator review
- policy guard integration
- rebalance recommendation schema

Acceptance:

- target weights are generated from current portfolio state
- proposed changes respect caps and risk bands
- outputs are stable and testable
- proposals are not emitted when hard veto rules are active

### Phase 5: AI Reasoning Layer

Goal:
Add explainable AI on top of deterministic allocation logic.

Primary outcomes:

- narrative explanations and operator summaries generated from structured context
- strict parsing and bounded response handling
- deterministic fallback summaries when model calls fail or return invalid structure
- full traceability between model input context and emitted explanation output

Tasks:

- build prompt templates
- pass structured context into the model
- parse model responses into strict schema
- add deterministic fallback behavior
- classify which fields are AI-authored versus deterministic
- persist model request/response metadata without logging secrets
- expose AI-disabled mode explicitly in API outputs

Deliverables:

- AI recommendation wrapper
- explanation text generation
- model failure fallback
- model input context builder
- schema validator for AI outputs

Acceptance:

- malformed AI output cannot break the pipeline
- recommendations remain bounded by risk and policy rules
- every AI result is logged with its input context
- AI can be disabled without removing deterministic recommendations

### Phase 6: Simulations and Benchmarks

Goal:
Prove the strategy behavior in normal and stressed conditions.

Primary outcomes:

- replayable scenario engine using stored or seeded inputs
- benchmark comparisons against passive and simple deterministic strategies
- stress outputs suitable for product demos and operator review
- scenario datasets reusable in tests and presentations

Tasks:

- build backtest engine
- implement benchmark strategies
- add stress scenarios
- compute performance metrics
- define simulation input schema and seed data format
- support replay from stored snapshots where possible
- produce summary metrics for drawdown, turnover, hit rate, and veto frequency

Deliverables:

- replayable simulations
- benchmark tables
- scenario output for demo screens
- scenario seed files
- metrics schema for frontend charts

Acceptance:

- at least three scenarios are reproducible
- benchmark outputs are exportable
- frontend can consume backtest summaries
- scenario results can be regenerated from documented inputs

### Phase 7: Production Hardening

Goal:
Make the service reliable enough for demo and guarded deployment.

Primary outcomes:

- visible health, alerting, and degrade-state handling
- retry logic that does not hide systemic failures
- stable API contracts and operational runbooks
- confidence that the service can remain useful in monitor-only mode

Tasks:

- add alerting thresholds
- add retry and degrade logic
- add structured logs
- document API contracts and failure modes
- add source-by-source health summaries and operator-facing status flags
- define monitor-only, rebalance-only, and pause recommendation modes
- document operational assumptions, unresolved verifications, and rollout checklist

Deliverables:

- alerting hooks
- degrade-to-simulation mode
- stable API responses
- operational readiness checklist
- failure mode catalog

Acceptance:

- stale or missing data triggers visible alerts
- service can continue in restricted mode
- frontend and smart contract teams have stable payload formats
- rollout decisions can be made from documented health and risk indicators

## Expected Inputs and Outputs

Inputs:

- wallet or vault balances
- market prices
- route quotes
- policy limits
- contract addresses

Outputs:

- current portfolio state
- risk score and bucket breakdown
- target allocations
- recommended actions
- execution proposal payloads for the smart contract lane

## Handoff Requirements

This service must provide the other teams with:

- stable API contracts
- schema definitions for risk and allocation
- proposal payload format
- event and status vocabulary for UI
- benchmark output format for demo screens

## Delivery Milestones

Milestone 1:
Phase 0 and Phase 1 complete, service boots, health works, and price / quote ingestion is demonstrable.

Milestone 2:
Phase 2 and Phase 3 complete, portfolio and risk APIs are consumable by the frontend with deterministic outputs.

Milestone 3:
Phase 4 and Phase 5 complete, allocation and explanation outputs are reviewable and safely bounded.

Milestone 4:
Phase 6 and Phase 7 complete, scenarios are demo-ready and operational behavior is documented.

## Definition of Done

The AI + Data Analytics service is complete for MVP when:

- live prices and quotes are ingested
- portfolio and risk state are queryable
- target allocations and recommendations are generated
- simulations and benchmark outputs exist
- fallback behavior works when AI or data degrades
- APIs are stable enough for frontend integration
