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
Create the service skeleton, settings, and shared schemas.

Tasks:

- initialize Python service structure
- define environment settings
- add logging and error handling
- define DTOs for prices, quotes, risk outputs, and allocation outputs

Deliverables:

- bootable FastAPI service
- settings loader
- typed schemas

Acceptance:

- service starts locally
- schemas are reusable by all modules
- no business logic is coupled to the API layer

### Phase 1: Market and Oracle Ingestion

Goal:
Build reliable, repeatable ingestion of prices and route quotes.

Tasks:

- integrate Hermes / Pyth price fetches
- implement asset price normalization
- sample AGNI and Merchant Moe quotes
- store raw snapshots

Deliverables:

- price ingestion job
- quote sampling job
- persistent raw data storage

Acceptance:

- prices are timestamped and queryable
- quotes are sampled on a schedule
- stale data can be detected

### Phase 2: Portfolio and Analytics Base

Goal:
Turn raw data into portfolio state and market analytics.

Tasks:

- compute portfolio snapshots
- calculate exposures and target deltas
- estimate route depth and slippage impact
- expose current portfolio analytics APIs

Deliverables:

- portfolio snapshot engine
- current state APIs
- basic allocation metrics

Acceptance:

- frontend can fetch current portfolio and market overview
- snapshots are stored historically
- exposure metrics reconcile with balances

### Phase 3: Risk Engine

Goal:
Implement explainable risk scoring before any AI decision is trusted.

Tasks:

- build bucket calculators
- implement weighted risk score
- define action bands
- generate risk notes and precheck results

Deliverables:

- risk score engine
- bucket breakdown output
- risk API

Acceptance:

- high-risk states are visible and reproducible
- risk output includes score, band, notes, and confidence
- execution-blocking conditions are explicit

### Phase 4: Allocation Engine

Goal:
Generate target weights and rebalance plans.

Tasks:

- implement allocation profiles
- compute target weights based on market and policy state
- implement clip sizing
- generate rebalance recommendations

Deliverables:

- allocation engine
- clip scheduler
- rationale payload for UI and operator review

Acceptance:

- target weights are generated from current portfolio state
- proposed changes respect caps and risk bands
- outputs are stable and testable

### Phase 5: AI Reasoning Layer

Goal:
Add explainable AI on top of deterministic allocation logic.

Tasks:

- build prompt templates
- pass structured context into the model
- parse model responses into strict schema
- add deterministic fallback behavior

Deliverables:

- AI recommendation wrapper
- explanation text generation
- model failure fallback

Acceptance:

- malformed AI output cannot break the pipeline
- recommendations remain bounded by risk and policy rules
- every AI result is logged with its input context

### Phase 6: Simulations and Benchmarks

Goal:
Prove the strategy behavior in normal and stressed conditions.

Tasks:

- build backtest engine
- implement benchmark strategies
- add stress scenarios
- compute performance metrics

Deliverables:

- replayable simulations
- benchmark tables
- scenario output for demo screens

Acceptance:

- at least three scenarios are reproducible
- benchmark outputs are exportable
- frontend can consume backtest summaries

### Phase 7: Production Hardening

Goal:
Make the service reliable enough for demo and guarded deployment.

Tasks:

- add alerting thresholds
- add retry and degrade logic
- add structured logs
- document API contracts and failure modes

Deliverables:

- alerting hooks
- degrade-to-simulation mode
- stable API responses

Acceptance:

- stale or missing data triggers visible alerts
- service can continue in restricted mode
- frontend and smart contract teams have stable payload formats

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

## Definition of Done

The AI + Data Analytics service is complete for MVP when:

- live prices and quotes are ingested
- portfolio and risk state are queryable
- target allocations and recommendations are generated
- simulations and benchmark outputs exist
- fallback behavior works when AI or data degrades
- APIs are stable enough for frontend integration
