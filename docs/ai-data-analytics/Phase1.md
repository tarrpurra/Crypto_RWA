# AI + Data Analytics Phase 1 Plan

## Purpose

Phase 1 establishes the live-data ingestion layer for the AI + Data Analytics service.

This phase is not about deciding trades. It is about making sure later portfolio, risk, allocation, and AI modules consume price and quote data that is timestamped, replayable, and explicit about freshness or failure.

## Phase Goal

Build a repeatable ingestion foundation for `services/agent` with:

- Hermes / Pyth-backed price fetches
- deterministic price normalization
- AGNI and Merchant Moe quote sampling
- raw snapshot persistence for audit and replay
- stale-data and upstream-failure visibility

## Why Phase 1 Matters

If Phase 1 is weak, later phases will end up scoring risk and generating recommendations from inconsistent, stale, or unverifiable market inputs.

This phase should reduce that risk by defining:

- how prices enter the service
- how quotes are discovered and sampled
- how freshness is calculated
- where raw versus normalized records are stored
- how missing, stale, or unverified data is represented

## In Scope

- `services/agent/app/core/settings.py` additions for oracle, quote, storage, and freshness config
- `services/agent/app/schemas/*` additions for market-data DTOs
- `services/agent/modules/oracle/*`
- `services/agent/modules/market_data/*`
- `services/agent/modules/quotes/*`
- `services/agent/repositories/*` for snapshot persistence boundaries
- `services/agent/jobs/ingest_prices.py`
- `services/agent/jobs/sample_quotes.py`
- minimal read surfaces for latest prices, latest quotes, routes, and ingestion status
- documentation updates for the phase and change log

## Out Of Scope

- portfolio valuation and exposure logic
- weighted risk scoring and action bands
- allocation targets and rebalance plans
- AI prompt and response handling
- execution proposal generation
- automated trading

## Implementation Principles

- keep FastAPI route handlers thin
- do not fabricate prices, quotes, feed IDs, pool addresses, or liquidity data
- preserve raw upstream payloads for replay and debugging
- treat verification gaps as first-class status, not hidden implementation details
- prefer Mantle Sepolia as the default development chain, but do not pretend its asset surface matches mainnet
- discover volatile routing data at runtime instead of hardcoding pool addresses

## Current Baseline

The service already has:

- a bootable FastAPI app in `services/agent/app/main.py`
- centralized settings in `services/agent/app/core/settings.py`
- a Mantle RPC client in `services/agent/modules/chain/quicknode.py`
- Foundry ABI-backed contract readers in `services/agent/modules/contracts/`

The service does not yet have:

- an oracle client
- price normalization modules
- quote discovery and sampling modules
- snapshot persistence
- ingestion jobs
- market-data schemas

Phase 1 should extend the current service instead of creating separate scripts or a parallel backend path.

## Operating Modes

### Mode 1: Mainnet Read-Only Market Monitoring

Use Mantle mainnet for:

- live USDY monitoring
- live AGNI route discovery
- live Merchant Moe route discovery
- live quote sampling
- live Hermes / Pyth-backed price ingestion

This is the only mode that can realistically provide live USDY market visibility from the current repo knowledge.

### Mode 2: Mantle Sepolia Plumbing Validation

Use Mantle Sepolia for:

- RPC and job-loop validation
- mETH testnet integration
- settings and schema validation
- persistence verification
- mocked or partially verified market flows

Important rule:

- do not assume a verified Sepolia USDY deployment exists

## Configuration Workstream

Extend `services/agent/app/core/settings.py` and `services/agent/.env.example` with explicit Phase 1 settings.

Required configuration groups:

- oracle provider settings
- quote provider settings
- route discovery settings
- persistence settings
- freshness thresholds
- asset metadata and feed mapping

Recommended additions:

- `PYTH_HERMES_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `PRICE_POLL_INTERVAL_SECONDS`
- `QUOTE_POLL_INTERVAL_SECONDS`
- `ROUTE_CACHE_TTL_SECONDS`
- `ORACLE_MAX_AGE_SECONDS_DEFAULT`
- `ORACLE_MAX_AGE_SECONDS_STABLE`
- `ORACLE_MAX_AGE_SECONDS_VOLATILE`
- `AGNI_FACTORY_ADDRESS`
- `AGNI_QUOTER_ADDRESS`
- `AGNI_QUOTER_V2_ADDRESS`
- `AGNI_SWAP_ROUTER_ADDRESS`
- `MERCHANT_MOE_ROUTER_ADDRESS`
- `MERCHANT_MOE_LB_ROUTER_ADDRESS`
- `MERCHANT_MOE_AGGREGATOR_ROUTER_ADDRESS`
- `MERCHANT_MOE_FACTORY_ADDRESS`
- `MERCHANT_MOE_LB_FACTORY_ADDRESS`
- `USDY_MAINNET_ADDRESS`
- `METH_MAINNET_ADDRESS`
- `METH_SEPOLIA_ADDRESS`
- `PYTH_MAINNET_CONTRACT`
- `PYTH_SEPOLIA_CONTRACT`
- `USDY_PYTH_FEED_ID=TODO_VERIFY`
- `METH_USD_PYTH_FEED_ID=TODO_VERIFY`
- `ETH_USD_PYTH_FEED_ID=TODO_VERIFY`
- `METH_ETH_RATIO_FEED_ID=TODO_VERIFY`

Configuration rules:

- defaults are acceptable only when operationally safe
- unverified values stay config-driven and clearly marked
- asset metadata should live in one registry-style config boundary, not in protocol-specific modules

## Asset Scope

Start with a narrow, explicit allowlist.

Primary assets:

- `USDY` on Mantle mainnet
- `mETH` on Mantle mainnet
- `mETH` on Mantle Sepolia

Reserve or route-helper assets:

- `WMNT`
- `USDC`
- `WETH`

Important constraints:

- do not mark Sepolia `USDY`, `WMNT`, `USDC`, or `WETH` as verified unless the repository already contains that verification
- use mocks in tests when a real testnet asset is still unresolved

## Schema Workstream

Add shared market-data DTOs under `services/agent/app/schemas/`.

Recommended files:

- `market_data.py`
- `oracle.py`
- `quotes.py`

These schemas should define:

- asset metadata
- raw oracle payload metadata
- normalized price records
- route descriptors
- quote request parameters
- quote response payloads
- snapshot persistence records
- ingestion status payloads

Shared schema rule:

- every output should include provenance and freshness metadata

## Oracle Workstream

Add `services/agent/modules/oracle/`.

Recommended files:

- `hermes_client.py`
- `pyth_parser.py`
- `freshness.py`

### `hermes_client.py`

Responsibilities:

- call Hermes endpoints using `httpx`
- fetch latest price updates by feed ID
- capture raw payloads plus fetch timestamps
- surface timeout, HTTP, and upstream error states cleanly

### `pyth_parser.py`

Responsibilities:

- parse Hermes payloads into deterministic numeric values
- extract feed ID, publish time, exponent, price, confidence interval, and optional EMA fields
- support derived-price composition where direct feeds are unavailable but approved component feeds exist

Derived-price rule:

- if direct `mETH/USD` is not verified, support an explicit derivation path such as `ETH/USD * mETH/ETH`

That derivation must be stored in metadata and must never masquerade as a direct feed.

### `freshness.py`

Responsibilities:

- compute data age in seconds
- compare records against configured thresholds
- produce explicit statuses such as `ok`, `stale`, `missing`, `unverified`, or `parse_error`

## Market Data Workstream

Add `services/agent/modules/market_data/`.

Recommended files:

- `prices.py`
- `snapshots.py`

### `prices.py`

Responsibilities:

- map configured assets to verified or explicitly marked feed IDs
- call the oracle layer
- normalize prices into a common schema
- attach freshness metadata, derivation metadata, and source metadata

### `snapshots.py`

Responsibilities:

- define repository-facing persistence helpers
- write raw and normalized snapshot records
- expose read helpers needed by later phases

## Quote Ingestion Workstream

Add `services/agent/modules/quotes/`.

Recommended files:

- `agni_quotes.py`
- `merchant_moe_quotes.py`
- `route_ranker.py`

### `agni_quotes.py`

Responsibilities:

- discover candidate pools by token pair and fee tier
- query the verified quoter or quoter v2 for deterministic read-only quotes
- return quote outputs with route metadata and block context

### `merchant_moe_quotes.py`

Responsibilities:

- discover candidate classic, LB, or aggregator routes
- keep route-family metadata explicit
- sample quotes for configured trade sizes
- return unsupported or failed route attempts as explicit results

### `route_ranker.py`

Responsibilities:

- normalize quote records across protocols
- rank candidates by best output, estimated slippage, and route viability
- retain enough metadata for later depth and execution analysis

## Route Discovery Rules

Phase 1 should not hardcode direct pool addresses as stable configuration.

Required behavior:

- discover AGNI pools at runtime by fee tier
- discover Merchant Moe routes at runtime by route family
- cache successful route candidates
- expire cached routes by TTL or repeated failure

Cache records should include:

- token pair
- protocol
- route family
- route path
- discovery block number
- last successful quote timestamp
- verification state

## Data Contracts

At minimum, Phase 1 should persist these record types.

### Raw Price Snapshot

Fields:

- `snapshot_id`
- `asset_symbol`
- `asset_address`
- `chain_id`
- `feed_id`
- `source`
- `source_url`
- `raw_payload_json`
- `fetch_timestamp`
- `publish_timestamp`
- `price_raw`
- `confidence_raw`
- `exponent`
- `status`
- `status_reason`

### Normalized Price Snapshot

Fields:

- `snapshot_id`
- `asset_symbol`
- `asset_address`
- `chain_id`
- `price_usd`
- `confidence_interval_usd`
- `publish_timestamp`
- `observed_timestamp`
- `age_seconds`
- `freshness_status`
- `derivation_method`
- `data_sources_used`

### Raw Quote Snapshot

Fields:

- `snapshot_id`
- `protocol`
- `route_type`
- `chain_id`
- `token_in`
- `token_out`
- `amount_in_raw`
- `amount_out_raw`
- `amount_in_decimals`
- `amount_out_decimals`
- `route_path_json`
- `fee_tier_or_bin_step`
- `block_number`
- `rpc_url`
- `sample_timestamp`
- `status`
- `status_reason`
- `raw_payload_json`

### Normalized Quote Snapshot

Fields:

- `snapshot_id`
- `protocol`
- `route_id`
- `route_label`
- `token_in_symbol`
- `token_out_symbol`
- `amount_in`
- `amount_out`
- `quoted_price`
- `estimated_slippage_bps`
- `route_depth_usd`
- `candidate_rank`
- `sample_timestamp`
- `freshness_status`
- `data_sources_used`

## Persistence Workstream

Add or prepare `services/agent/repositories/`.

Minimum Phase 1 needs:

- `repositories/db/models.py`
- `repositories/db/session.py`
- optional `repositories/cache/redis_client.py`

Preferred target:

- PostgreSQL-backed snapshot tables for prices and quotes

Acceptable local-dev fallback:

- a repository adapter that writes line-delimited JSON or timestamped JSON files under a dedicated service data directory

Repository requirements:

- insert raw records
- insert normalized records
- read latest snapshot by asset or pair
- read latest successful snapshot only
- read recent windows for replay and debugging

Persistence rule:

- do not place storage logic directly in route handlers or job scripts

## Job Workstream

Add explicit job entrypoints under `services/agent/jobs/`.

Required jobs:

- `ingest_prices.py`
- `sample_quotes.py`

Required behavior:

- each job can run once or loop on an interval
- each job logs start time, finish time, success count, and failure count
- each job exits non-zero on unrecoverable configuration errors
- each job distinguishes upstream unavailability from parse or code failures

Simple loop-based jobs are acceptable for MVP if the core logic remains modular and testable.

## Freshness And Staleness Rules

Phase 1 must compute freshness now so later phases do not duplicate that logic.

Recommended default thresholds:

- volatile assets such as ETH-linked assets: stale after `120` seconds
- stable or RWA dollar-linked assets: stale after `300` seconds
- quote samples: stale after one quote interval plus a small buffer

Every normalized record should include:

- `age_seconds`
- `freshness_status`
- `status_reason`

## Minimal API Surface

Phase 1 does not need the full analytics API, but it should expose enough read visibility for operators and later phases.

Recommended additions:

- `GET /market/prices/latest`
- `GET /market/prices/{asset_symbol}`
- `GET /market/quotes/latest`
- `GET /market/routes`
- `GET /market/ingestion/status`

API rule:

- route handlers should remain thin wrappers over repository and service modules

## Error And Status Vocabulary

Phase 1 must fail safely and visibly.

Required statuses:

- `ok`
- `stale`
- `missing`
- `unverified`
- `upstream_error`
- `parse_error`
- `unsupported_route`

Required behavior:

- network failure does not create fake price records
- parse failure does not produce trusted normalized outputs
- missing pools and failed route discovery are stored as failures instead of silently skipped
- stale data remains queryable for audit, but clearly marked stale

## Testing Requirements

Add tests under `services/agent/tests/`.

Minimum unit coverage:

- Hermes response parsing
- freshness calculations
- derived-price computation
- asset registry validation
- route ranking logic
- failure-state mapping

Minimum integration coverage:

- quote sampling against mocked protocol responses
- persistence round-trips for raw and normalized snapshots
- job entrypoint execution with mocked upstream dependencies

Scenario coverage to prepare for later phases:

- stale oracle response
- missing feed ID
- no candidate route found
- one quote provider fails while another still returns results

## Proposed Task Breakdown

### 1. Settings And Registry Contract

- inventory current env vars and config gaps
- define provider, asset, route, and freshness settings
- centralize asset metadata and feed mapping

### 2. Schema Contract

- define shared price, quote, route, and ingestion-status DTOs
- lock field names for provenance and freshness metadata

### 3. Oracle Integration

- implement Hermes fetches
- parse Pyth payloads
- add freshness utilities
- support explicit derived-price metadata where needed

### 4. Persistence Contract

- define repository interfaces
- implement first persistence adapter
- support raw and normalized snapshot storage

### 5. Quote Discovery And Sampling

- implement AGNI route discovery and quote sampling
- implement Merchant Moe route discovery and quote sampling
- add route ranking and normalization

### 6. Jobs And Read Surfaces

- add `ingest_prices.py`
- add `sample_quotes.py`
- add minimal latest-state and ingestion-status endpoints

### 7. Test Contract

- add unit coverage for parsing and freshness
- add integration coverage for persistence and job runs
- add scenario fixtures for stale and missing-source cases

## Acceptance Criteria

Phase 1 is complete when:

- the service can fetch and normalize live or mock-approved price data without manual intervention
- every price snapshot includes publish time, observed time, age, and freshness status
- AGNI and Merchant Moe samplers return normalized quote records or explicit failure records
- route discovery is repeatable and cached
- raw price and quote snapshots are stored persistently
- latest market data can be queried through stable internal modules and minimal HTTP endpoints
- stale, missing, or unverified data is visible instead of silently ignored

## Exit Criteria To Start Phase 2

Before starting Phase 2, the team should have:

- a stable asset and feed registry
- reusable price and quote DTOs
- repository methods for latest and historical market data
- freshness semantics that later risk logic can trust
- enough route metadata to estimate slippage and depth in the next phase

## Risks To Watch

- hardcoding unverified Sepolia asset addresses
- treating derived prices as direct oracle prices
- dropping failed quote attempts instead of recording them
- mixing provider-specific logic into API route handlers
- coupling persistence implementation details to business logic

## Dependencies And Coordination

Needs input from smart contracts on:

- router allowlist expectations
- which quote route families matter for proposal generation later
- any contract-side constraints on route encoding or execution metadata

Needs input from frontend on:

- which latest-market endpoints unblock the first dashboard screens
- how stale and degraded market status should be represented in UI

## Suggested Phase 1 Sequence

1. Extend settings and asset/feed registry definitions.
2. Add schemas for prices, quotes, and ingestion status.
3. Implement the oracle layer.
4. Add persistence boundaries and the first adapter.
5. Implement AGNI quote discovery and sampling.
6. Implement Merchant Moe quote discovery and sampling.
7. Add route ranking and normalization.
8. Add job entrypoints and minimal read APIs.
9. Add unit, integration, and scenario coverage.

## Open Verification Items

The following must remain verification-sensitive:

- final Pyth feed IDs for `USDY`
- whether a direct verified `mETH/USD` feed is available
- the exact inputs for any approved `mETH/USD` derivation path
- canonical Sepolia addresses for `USDY`, `WMNT`, `USDC`, and `WETH`
- which Merchant Moe route family is MVP-critical if scope must be reduced

These should stay config-driven and clearly marked until verified from repository-backed research or primary-source updates.

## Definition Of Success

Phase 1 succeeds if later portfolio, risk, and allocation work can consume prices and quotes through stable schemas, stable freshness semantics, and replayable snapshot storage without re-architecting the ingestion layer.
