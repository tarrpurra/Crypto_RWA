# AI + Data Analytics Service Changes

## Purpose

Track meaningful changes to the AI + Data Analytics service.

## Format

For each entry, record:

- date
- author
- type
- summary
- affected files or modules
- impact on smart contracts, frontend, or data quality

## Change Log

### 2026-05-25

Type:
Feature / Safety hardening

Summary:

- completed the local-safe Phase 4 and Phase 5 coding path
- removed mock portfolio fallback from allocation and decisioning surfaces; missing vault, price, or chain data now returns a missing portfolio snapshot and pauses allocation
- hardened rebalance generation so missing portfolio data, zero portfolio value, and missing position prices do not produce trade actions
- fixed proposal creation by importing `MarketDataRepository`, requiring the requested proposal action to match the current deterministic rebalance plan, requiring real configured token/router/vault addresses, rejecting missing price snapshots, removing fallback calldata hashes, and enforcing `PolicyGuard`
- made AI reasoning settings-driven and disabled by default, with deterministic fallback explanations as the safe baseline
- added Phase 4 and Phase 5 execution docs

Affected scope:

- docs/ai-data-analytics/Phase4.md
- docs/ai-data-analytics/Phase5.md
- docs/ai-data-analytics/README.md
- docs/ai-data-analytics/Changes.md
- services/agent/.env.example
- services/agent/app/api/allocation.py
- services/agent/app/api/decisions.py
- services/agent/app/core/settings.py
- services/agent/modules/market_data/balances.py
- services/agent/strategies/allocation/rebalance.py
- services/agent/strategies/decision_templates/parser.py

Impact:

- smart contracts: proposal payload creation is now policy-gated and no longer uses fallback calldata hashes or fallback addresses
- frontend: allocation and decision endpoints remain stable but now surface conservative pause/hold behavior when data is missing
- data quality: allocation and AI reasoning no longer depend on fabricated portfolio values or hardcoded market prices

Assumptions / unresolved verification items:

- successful proposal creation still requires configured vault/router/token addresses plus fresh persisted USDC and mETH price snapshots
- live quote-depth and slippage validation remain Phase 1B dependent
- production-grade AI request/response persistence can be expanded later, but deterministic fallback is complete and safe for local operation

Commands to run after this change:

- `python -m unittest services.agent.tests.unit.test_allocation services.agent.tests.unit.test_ai_fallback services.agent.tests.integration.test_portfolio_endpoints -v`
- `python -m unittest discover services.agent.tests -v`

### 2026-05-21

Type:
Feature

Summary:

- added PostgreSQL-backed market-data persistence using SQLAlchemy models, session wiring, and a repository for price and quote snapshots
- introduced a config-driven Ondo USDY oracle client plus quote route discovery, ranking, and `/market/quotes/latest` and `/market/routes` APIs
- made market API persistence best-effort while keeping ingestion jobs persistence-aware, so the service can still expose degraded read surfaces before PostgreSQL or live quote methods are fully verified

Affected scope:

- services/agent/repositories/db/models.py
- services/agent/repositories/db/session.py
- services/agent/repositories/db/market_repository.py
- services/agent/modules/oracle/ondo_client.py
- services/agent/modules/market_data/*
- services/agent/modules/quotes/*
- services/agent/app/api/market.py
- services/agent/app/core/settings.py
- services/agent/app/schemas/quotes.py
- services/agent/jobs/ingest_prices.py
- services/agent/jobs/sample_quotes.py
- services/agent/.env.example
- services/agent/requirements.txt
- services/agent/pyproject.toml
- services/agent/tests/integration/test_market.py
- services/agent/tests/unit/test_quote_ranking.py

Impact:

- smart contracts: backend now tracks the configured router surfaces and route identifiers that later proposal-generation logic can bind to contract-approved execution paths
- frontend: market APIs now expose quote and route surfaces in addition to prices, with explicit `DATA_MISSING` and `LIQUIDITY_UNKNOWN` degraded states
- data quality: USDY can use a config-driven Ondo oracle path without inventing a Pyth feed, while quote sampling remains fail-closed until exact AGNI and Merchant Moe read methods are verified

Assumptions / unresolved verification items:

- Ondo oracle method selector and final feed IDs still need verification before live USDY pricing is trusted end-to-end
- AGNI and Merchant Moe quote methods are still represented as discovery and persistence scaffolding; live calldata and amount-out reads are not implemented yet
- tests were added and updated but not executed in this turn

Commands the user still needs to run:

- install the new Python dependencies for SQLAlchemy and psycopg
- provision PostgreSQL and set `DATABASE_URL`
- verify the Ondo oracle selector and live feed IDs before relying on mainnet market outputs

### 2026-05-21

Type:
Feature

Summary:

- started Phase 1 with market-data settings, asset registry wiring, Hermes/Pyth parsing, freshness evaluation, and initial `/market` API surfaces
- added a price-ingestion service that derives mETH from ETH/USD plus ratio feeds when needed and keeps USDY explicitly unimplemented until Ondo oracle integration lands
- added Phase 1 job and test scaffolding while keeping quote discovery and PostgreSQL persistence deferred to the next implementation slice

Affected scope:

- services/agent/app/api/market.py
- services/agent/app/core/settings.py
- services/agent/app/schemas/market_data.py
- services/agent/app/schemas/oracle.py
- services/agent/app/schemas/quotes.py
- services/agent/modules/oracle/*
- services/agent/modules/market_data/*
- services/agent/modules/quotes/*
- services/agent/jobs/ingest_prices.py
- services/agent/jobs/sample_quotes.py
- services/agent/tests/unit/test_freshness.py
- services/agent/tests/integration/test_market.py
- services/agent/.env.example
- services/agent/pyproject.toml

Impact:

- smart contracts: no direct contract integration change yet, but the service now has the first market-data layer that later proposal generation can depend on
- frontend: adds initial `/market/prices/latest`, `/market/prices/{asset_symbol}`, and `/market/ingestion/status` surfaces with explicit degraded and missing-data states
- data quality: mETH pricing can use direct or derived Pyth inputs without inventing values, and USDY remains explicitly unavailable until the locked Ondo oracle path is implemented

Assumptions / unresolved verification items:

- the Hermes endpoint shape is implemented defensively, but still needs live verification against the configured feed IDs
- PostgreSQL-backed persistence, Ondo USDY oracle integration, and DEX quote sampling are not implemented in this slice yet
- tests were added but not executed in this turn

Commands the user still needs to run:

- run the new unit and integration tests for freshness and market endpoints
- verify the configured Hermes feed IDs and observe `/market/prices/latest` against your environment

### 2026-05-21

Type:
Feature

Summary:

- initialized the Phase 0 service scaffold with modular FastAPI routers, typed schemas, centralized status-code enums, and environment-driven runtime configuration
- added logging configuration with global and per-subsystem controls plus locked freshness thresholds and PostgreSQL settings placeholders
- created repository, risk, strategy, simulation, and integration-test skeletons to support Phase 1 without reopening the app structure

Affected scope:

- services/agent/app/main.py
- services/agent/app/api/*
- services/agent/app/core/settings.py
- services/agent/app/core/logging.py
- services/agent/app/core/status_codes.py
- services/agent/app/schemas/*
- services/agent/repositories/*
- services/agent/risk/__init__.py
- services/agent/strategies/__init__.py
- services/agent/simulations/__init__.py
- services/agent/tests/integration/test_health.py
- services/agent/tests/unit/test_settings.py
- services/agent/.env.example
- services/agent/pyproject.toml

Impact:

- smart contracts: contract-read endpoints now sit behind a cleaner app boundary that can absorb proposal and execution status vocabulary later
- frontend: `/health` and `/status` now have a stable Phase 0 contract with `status_code`, runtime mode, logging, contract configuration, and freshness metadata
- data quality: locked freshness thresholds and status enums are now represented in code instead of only in planning docs

Assumptions / unresolved verification items:

- placeholder repository modules do not yet implement PostgreSQL models or sessions; Phase 1 still needs concrete storage code
- baseline tests were added but not executed in this turn

Commands the user still needs to run:

- run the agent unit and integration tests after confirming the local Python environment is ready
- start the FastAPI service and verify `/health`, `/status`, `/contracts`, and `/chain/status` against your configured environment

### 2026-05-21

Type:
Docs

Summary:

- locked the final Phase 0 decisions for pricing strategy, freshness thresholds, status codes, database layout, and logging behavior
- expanded `recommendation_model.md` into the authoritative runtime and recommendation contract for coding work
- updated `Phase0.md` so bootstrap implementation explicitly depends on the locked pricing, freshness, and status-code rules

Affected scope:

- docs/ai-data-analytics/recommendation_model.md
- docs/ai-data-analytics/Phase0.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: aligns backend proposal and execution vocabulary with a fixed shared `status_code` catalog before deeper integration
- frontend: locks machine-readable statuses and human-facing status metadata early enough for UI contracts
- data quality: prevents Phase 1 pricing and freshness logic from drifting away from the agreed oracle-plus-market model

Assumptions / unresolved verification items:

- the decisions are now locked, but exact live integration values such as final addresses and feed identifiers still need primary-source verification during implementation
- PostgreSQL is the chosen storage direction, but the concrete migration or ORM layer still needs to be implemented in code

Commands the user still needs to run:

- none for this documentation-only update unless you want to start the Phase 0 code implementation next

### 2026-05-21

Type:
Docs

Summary:

- added `recommendation_model.md` as the canonical Phase 0 decision contract for runtime mode, status shape, error format, logging policy, and recommendation output fields
- recorded the user's locked Phase 0 decisions and separated them from the remaining pricing and freshness research items
- updated the AI docs index to include the recommendation model document

Affected scope:

- docs/ai-data-analytics/recommendation_model.md
- docs/ai-data-analytics/README.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: clarifies the runtime and status vocabulary the backend should expose before proposal-generation flows expand
- frontend: gives a stable baseline for status, error, and recommendation payload expectations
- data quality: keeps pricing-source selection and freshness tuning explicitly open for research instead of hardcoding weak assumptions

Assumptions / unresolved verification items:

- pricing-source selection still requires primary-source-backed research before being treated as final
- exact freshness thresholds and the final error-code catalog still need to be locked during implementation

Commands the user still needs to run:

- none for this documentation-only update unless you want to start implementing the Phase 0 code changes next

### 2026-05-21

Type:
Docs

Summary:

- added `Phase1.md` as the detailed execution guide for market and oracle ingestion
- defined concrete Phase 1 workstreams for configuration, schemas, oracle parsing, quote sampling, persistence, jobs, APIs, and testing
- updated the AI docs index to include the new Phase 1 document

Affected scope:

- docs/ai-data-analytics/Phase1.md
- docs/ai-data-analytics/README.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: clarifies which off-chain quote and oracle surfaces must exist before proposal or execution payload work can be trusted
- frontend: defines the minimum market-data and ingestion-status read surfaces later screens can depend on
- data quality: makes freshness, verification, persistence, and failure-state requirements explicit before portfolio and risk logic begin

Assumptions / unresolved verification items:

- final Pyth feed IDs and several Sepolia asset addresses remain verification-sensitive and are intentionally left config-driven or `TODO_VERIFY`
- persistence may begin behind a repository abstraction even if the first concrete adapter is file-backed before PostgreSQL is fully wired

Commands the user still needs to run:

- none for this documentation-only update unless you want to break Phase 1 into implementation tickets

### 2026-05-21

Type:
Docs

Summary:

- replaced the misnamed AI implementation plan file with `ImplementationPlan.md`
- expanded the AI implementation plan into a fuller phase-by-phase delivery document
- added a dedicated `Phase0.md` execution plan covering bootstrap scope, workstreams, acceptance, and sequencing
- updated the AI docs index to include the new Phase 0 document

Affected scope:

- docs/ai-data-analytics/ImplementationPlan.md
- docs/ai-data-analytics/Phase0.md
- docs/ai-data-analytics/README.md

Impact:

- smart contracts: clarifies the contract-facing dependencies and payload vocabulary the AI service expects during bootstrap
- frontend: makes the expected API, schema, freshness, and degraded-state planning more explicit before screen integration
- data quality: defines provenance, freshness, and safe-failure expectations earlier in the build plan

Assumptions / unresolved verification items:

- the repo should standardize on `ImplementationPlan.md` as the canonical AI planning filename going forward
- service code has not yet been fully scaffolded to match the target Phase 0 structure and still needs implementation work

Commands the user still needs to run:

- none for this documentation-only update unless you want to review or link these docs elsewhere

### 2026-05-21

Type:
Feature

Summary:

- connected the Python backend to all core contract Foundry ABIs through a reusable registry
- added backend contract metadata endpoints and read-only state snapshots for configured core contracts
- expanded unit coverage for ABI loading helpers beyond the single PauseGuardian case

Affected scope:

- services/agent/modules/contracts/project_contracts.py
- services/agent/modules/contracts/reader.py
- services/agent/app/main.py
- services/agent/tests/unit/test_foundry_artifacts.py

Impact:

- smart contracts: Python now consumes the existing compiled ABIs for `PauseGuardian`, `TradeApprovalManager`, and `ExecutorVault` without duplicating interface definitions
- frontend: backend can now serve contract metadata and configured-address state through `/contracts` and `/contracts/{contract_key}`
- data quality: contract reads stay tied to Foundry artifacts and configured addresses instead of hardcoded Python-side ABIs

Assumptions / unresolved verification items:

- contract artifacts under `contracts/out` are current for the deployed contracts configured in the service environment
- `TradeApprovalManager` currently exposes no stable zero-argument state getter beyond address-level metadata, so its snapshot is intentionally minimal

Commands the user still needs to run:

- run the Python unit tests for `services/agent/tests/unit/test_foundry_artifacts.py`
- start the FastAPI service and verify `/contracts`, `/contracts/pause_guardian`, and `/chain/status` against your configured Mantle RPC and deployed addresses

### 2026-05-11

Type:
Documentation bootstrap

Summary:

- created AI + Data Analytics service documentation set
- added `setup.md`
- added `ImplementationPlan.md`
- added `Changes.md`

Affected scope:

- docs only

Impact:

- establishes the working documentation baseline for the AI + Data Analytics owner

## Future Entry Template

```text
### YYYY-MM-DD

Type:
Feature | Refactor | Data model | Risk model | Docs | Breaking change

Summary:

- item 1
- item 2

Affected scope:

- services/agent/...
- data/...

Impact:

- smart contracts:
- frontend:
- data quality:
```






