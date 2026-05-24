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

### 2026-05-24

Type:
Feature

Summary:

- completed the local-safe Phase 3 deterministic risk engine target with weighted bucket scoring and restrictive status escalation
- added best-effort PostgreSQL persistence for risk assessments
- added `GET /risk/assessments` and `GET /risk/assessments/latest`
- expanded risk tests to cover weighted scores and persisted assessment read surfaces

Affected scope:

- docs/ai-data-analytics/Phase3.md
- docs/ai-data-analytics/Changes.md
- services/agent/app/api/risk.py
- services/agent/app/schemas/__init__.py
- services/agent/app/schemas/risk.py
- services/agent/repositories/db/models.py
- services/agent/repositories/db/risk_repository.py
- services/agent/risk/engine.py
- services/agent/tests/integration/test_risk.py
- services/agent/tests/unit/test_risk_engine.py

Impact:

- smart contracts: no execution approval behavior added; risk remains advisory and conservative
- frontend: risk center can consume current, latest, and recent assessment surfaces with stable bucket metadata
- data quality: hard vetoes and restrictive statuses remain explicit, with no optimistic approval when quote/oracle validation is missing

Assumptions / unresolved verification items:

- quote-depth liquidity scoring still requires Phase 1B live AGNI and Merchant Moe quote validation
- mainnet oracle trust scoring still requires verified Ondo and Pyth live reads
- Phase 4 allocation should consume `recommended_action`, `risk_score`, `hard_veto_status`, and bucket reasons as deterministic gates

Commands to run after this change:

- `python -m unittest services.agent.tests.unit.test_risk_engine services.agent.tests.integration.test_risk -v`
- `docker compose restart backend`
- `curl http://localhost:8000/risk/current`
- `curl http://localhost:8000/risk/assessments`

### 2026-05-24

Type:
Feature

Summary:

- started Phase 3 with a deterministic risk-engine plan and first local-safe implementation slice
- added risk response schemas with required action, score, confidence, hard-veto status, human-approval status, and bucket breakdowns
- added a deterministic risk engine that hard-vetoes missing or unvalued portfolio data and blocks execution-facing recommendations while quote validation is missing
- exposed `GET /risk/current`
- added Phase 3 risk scenario fixtures and focused risk tests

Affected scope:

- docs/ai-data-analytics/Phase3.md
- docs/ai-data-analytics/README.md
- docs/ai-data-analytics/Changes.md
- services/agent/app/api/__init__.py
- services/agent/app/api/risk.py
- services/agent/app/main.py
- services/agent/app/schemas/__init__.py
- services/agent/app/schemas/risk.py
- services/agent/risk/__init__.py
- services/agent/risk/engine.py
- services/agent/tests/integration/test_risk.py
- services/agent/tests/scenarios/risk_missing_portfolio.json
- services/agent/tests/scenarios/risk_normal_fixture.json
- services/agent/tests/scenarios/risk_quote_gated.json
- services/agent/tests/unit/test_risk_engine.py

Impact:

- smart contracts: no execution approvals or proposals are emitted; risk output is advisory and explicitly blocks execution-facing recommendations when hard vetoes or missing quote validation exist
- frontend: can consume `/risk/current` for risk center and dashboard status, including bucket-level reasons and hard-veto state
- data quality: missing portfolio data, unvalued positions, and Phase 1B quote gaps become visible risk states instead of optimistic recommendations

Assumptions / unresolved verification items:

- quote-depth liquidity scoring remains deferred until Phase 1B validates live AGNI and Merchant Moe quote decoding
- mainnet/fork oracle trust scoring remains deferred until Ondo and Pyth live paths are verified
- AI-authored explanations and allocation policy integration remain later phases

Commands to run after this change:

- `python -m unittest services.agent.tests.unit.test_risk_engine services.agent.tests.integration.test_risk -v`
- `docker compose restart backend`
- `curl http://localhost:8000/risk/current`

### 2026-05-24

Type:
Feature

Summary:

- completed the local-safe Phase 2 portfolio analytics target with target-weight drift fields, best-effort portfolio snapshot persistence, and historical read APIs
- added `GET /portfolio/snapshots` and `GET /portfolio/snapshots/latest`
- added PostgreSQL `portfolio_snapshots` storage and repository mapping
- added complete, partial, and missing portfolio scenario fixtures for later risk and allocation phases

Affected scope:

- services/agent/.env.example
- services/agent/app/core/settings.py
- services/agent/app/api/portfolio.py
- services/agent/app/schemas/__init__.py
- services/agent/app/schemas/portfolio.py
- services/agent/modules/market_data/balances.py
- services/agent/repositories/db/models.py
- services/agent/repositories/db/portfolio_repository.py
- services/agent/tests/integration/test_portfolio.py
- services/agent/tests/scenarios/portfolio_complete.json
- services/agent/tests/scenarios/portfolio_missing.json
- services/agent/tests/scenarios/portfolio_partial.json
- services/agent/tests/unit/test_portfolio_snapshot.py
- docs/ai-data-analytics/Phase2.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: still read-only; no execution proposal or signing behavior added
- frontend: portfolio dashboard can consume current, recent, and latest persisted snapshot surfaces with explicit empty/degraded states
- data quality: target drift is computed only from valued positions, unvalued positions remain visible, and route-depth/slippage fields stay null until Phase 1B quote validation is complete

Assumptions / unresolved verification items:

- local-safe Phase 2 is complete, but live portfolio quality still depends on configured wallet/vault addresses and verified active-chain asset addresses
- route-depth and slippage enrichment remains blocked on Phase 1B live quote validation
- richer historical pagination can be added later if frontend requirements exceed the current latest/recent surfaces

Commands to run after this change:

- `python -m unittest services.agent.tests.unit.test_portfolio_snapshot services.agent.tests.integration.test_portfolio -v`
- `docker compose restart backend`
- `curl http://localhost:8000/portfolio/current`
- `curl http://localhost:8000/portfolio/snapshots`

### 2026-05-24

Type:
Feature

Summary:

- continued Phase 2 by adding an ERC-20 balance-read boundary for configured portfolio addresses
- wired `/portfolio/current` to attempt balance reads for verified assets on the active chain when `PORTFOLIO_WALLET_ADDRESS` or `EXECUTOR_VAULT_ADDRESS` is configured
- preserved fail-safe behavior by returning `DATA_MISSING` when no balance source exists and keeping failed token reads as visible unvalued positions
- updated Phase 2 documentation with current behavior and next implementation slices

Affected scope:

- services/agent/app/api/portfolio.py
- services/agent/app/schemas/portfolio.py
- services/agent/modules/market_data/__init__.py
- services/agent/modules/market_data/balances.py
- services/agent/tests/unit/test_portfolio_snapshot.py
- docs/ai-data-analytics/Phase2.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no execution behavior added; the endpoint can use configured vault addresses as read-only balance targets
- frontend: `/portfolio/current` can now progress from empty degraded state to partial/valued positions when a portfolio address and verified asset addresses are available
- data quality: failed balance reads remain explicit and do not create synthetic balances or values

Assumptions / unresolved verification items:

- active-chain asset coverage still depends on verified asset addresses in settings
- Mantle Sepolia is expected to remain mostly degraded because real RWA asset surfaces are not available there
- historical portfolio persistence and allocation drift metrics remain pending Phase 2 work

Commands executed:

- `python -m unittest services.agent.tests.unit.test_portfolio_snapshot services.agent.tests.integration.test_portfolio -v`

### 2026-05-23

Type:
Feature

Summary:

- started Phase 2 with a dedicated portfolio analytics plan and the first safe implementation slice
- added typed portfolio balance, position, and current snapshot schemas
- added a deterministic portfolio snapshot engine that values supplied balances from fresh price snapshots and marks missing or unpriced inputs as degraded
- exposed `GET /portfolio/current` as a stable Phase 2 API surface that returns `DATA_MISSING` instead of inventing balances when no portfolio address or balance source is configured

Affected scope:

- docs/ai-data-analytics/Phase2.md
- docs/ai-data-analytics/README.md
- docs/ai-data-analytics/Changes.md
- services/agent/.env.example
- services/agent/app/core/settings.py
- services/agent/app/api/__init__.py
- services/agent/app/api/portfolio.py
- services/agent/app/main.py
- services/agent/app/schemas/__init__.py
- services/agent/app/schemas/portfolio.py
- services/agent/modules/market_data/balances.py
- services/agent/tests/integration/test_portfolio.py
- services/agent/tests/unit/test_portfolio_snapshot.py

Impact:

- smart contracts: no execution-facing behavior added; configured executor vault can be used as portfolio metadata later, but no on-chain balance reads are claimed yet
- frontend: can begin integrating a stable `/portfolio/current` response shape, including empty/degraded state handling
- data quality: portfolio analytics now fail safely when balances or prices are unavailable, preserving Phase 1 degraded-data semantics

Assumptions / unresolved verification items:

- live wallet or vault balance reads are not implemented in this slice
- historical portfolio snapshot persistence is still pending
- allocation drift, route-depth impact, and target-delta analytics remain later Phase 2 work
- strict Phase 1B mainnet or mainnet-fork validation is still required before live market-derived portfolio decisions can be trusted

Commands executed:

- `python -m unittest services.agent.tests.unit.test_portfolio_snapshot services.agent.tests.integration.test_portfolio -v`

### 2026-05-23

Type:
Validation / Documentation

Summary:

- recorded Phase 1 as Sepolia scaffold complete while keeping strict mainnet or mainnet-fork market validation pending
- added PostgreSQL to Docker Compose for local persistence validation and confirmed safe read endpoints can execute against the running backend
- hardened `/chain/status` so unavailable or invalid RPC configuration returns structured degraded data instead of an HTTP 500
- changed blank QuickNode defaults so local Sepolia runs fall back to the public Mantle Sepolia RPC unless real QuickNode URLs are explicitly configured

Affected scope:

- docker-compose.yml
- services/agent/.env.example
- services/agent/app/api/chain.py
- services/agent/app/schemas/chain.py
- services/agent/tests/integration/test_chain.py
- docs/ai-data-analytics/Phase1.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: contract metadata endpoints remain usable without deployed Sepolia addresses, while deployed-state reads stay null until addresses are configured
- frontend: `/chain/status` and market endpoints now expose stable degraded responses that can be rendered without treating expected Sepolia gaps as crashes
- data quality: Sepolia missing-market-data behavior is explicitly documented and does not substitute WETH, mocks, or candidate addresses for mETH, USDY, AGNI, or Merchant Moe validation

Assumptions / unresolved verification items:

- strict Phase 1 remains pending until Mantle mainnet or a mainnet fork validates Ondo USDY oracle reads, Pyth ETH/USD fetches, AGNI quotes, Merchant Moe quotes, and PostgreSQL write/read round trips
- real QuickNode endpoints are optional for local Sepolia RPC status and should be configured only when available
- AGNI Sepolia addresses remain candidate-only and Merchant Moe/Ondo remain mainnet-only unless independently verified

Commands executed:

- `docker compose config`
- local-safe HTTP GET checks against `/health`, `/status`, `/chain/status`, `/contracts`, `/market/ingestion/status`, `/market/prices/latest`, `/market/oracles/usdy`, `/market/routes`, and quote endpoints
- `python -m unittest services.agent.tests.integration.test_chain -v`

### 2026-05-22

Type:
Feature

Summary:

- aligned the Phase 1 config baseline with the locked Mantle mainnet integration spec for Ondo, Merchant Moe, AGNI, and Pyth ETH/USD
- added an explicit Ondo USDY oracle adapter and status surface plus split AGNI and Merchant Moe route discovery into dedicated modules instead of leaving everything inside one quote service placeholder
- added a shared versioned Mantle config file under `packages/config/src/mantle.ts` and extended market APIs with `/market/oracles/usdy` while keeping live quote decoding verification-gated instead of fabricating outputs

Affected scope:

- packages/config/src/mantle.ts
- services/agent/app/core/settings.py
- services/agent/app/api/market.py
- services/agent/app/schemas/oracle.py
- services/agent/app/schemas/quotes.py
- services/agent/modules/oracle/ondo_usdy_oracle.py
- services/agent/modules/oracle/__init__.py
- services/agent/modules/market_data/prices.py
- services/agent/modules/quotes/agni_discovery.py
- services/agent/modules/quotes/agni_quotes.py
- services/agent/modules/quotes/merchant_moe_discovery.py
- services/agent/modules/quotes/merchant_moe_quotes.py
- services/agent/modules/quotes/service.py
- services/agent/modules/quotes/__init__.py
- services/agent/.env.example
- services/agent/tests/integration/test_market.py
- services/agent/tests/unit/test_ondo_usdy_oracle.py
- docs/ai-data-analytics/Phase1.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: backend route metadata now maps more cleanly to the off-chain discovery versus on-chain enforcement split, with routers and route families surfaced without pretending execution calldata is ready
- frontend: market surfaces now include an explicit USDY oracle status endpoint and route descriptors can carry discovered pool addresses and verification state
- data quality: verified Mantle mainnet addresses and the ETH/USD feed are now first-class defaults, while selector and quote-decoding gaps remain explicit degraded states instead of hidden assumptions

Assumptions / unresolved verification items:

- Ondo oracle selector and ABI method still require primary-source verification before live USDY oracle reads can be marked trusted
- AGNI QuoterV2 decoding and Merchant Moe live quote decoding are still verification-gated, so discovered routes do not yet imply executable quote amounts
- tests were updated but not executed in this turn

Commands the user still needs to run:

- install the Python dependencies if they are not already present
- provision PostgreSQL and set `DATABASE_URL`
- run the updated agent unit and integration tests
- verify the Ondo selector plus AGNI and Merchant Moe quote call shapes before claiming live-quote completeness

### 2026-05-21

Type:
Feature

Summary:

- added PostgreSQL-backed market-data persistence using SQLAlchemy models, session wiring, and a repository for price and quote snapshots
- introduced a config-driven Ondo USDY oracle client plus quote route discovery, ranking, route caching, and `/market/quotes/latest`, `/market/quotes/{token_in}/{token_out}`, `/market/quotes/{token_in}/{token_out}/best`, and `/market/routes` APIs
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
