# AI + Data Analytics Phase 0 Plan

## Purpose

Phase 0 establishes the service contract for every later AI + Data Analytics phase.

This phase is not about shipping strategy logic. It is about locking the startup path, configuration model, schema boundaries, safety vocabulary, test scaffolding, and baseline decision contracts so later work does not fragment.

## Phase Goal

Create a bootable backend skeleton for `services/agent` with:

- clear module ownership boundaries
- environment-driven runtime configuration
- typed request and response schemas
- health, status, and error response conventions
- baseline unit and integration test scaffolding
- locked pricing, freshness, logging, and status-code decisions

## Why Phase 0 Matters

If Phase 0 is weak, later phases will duplicate schemas, hardcode addresses, leak provider-specific logic into route handlers, and make risk or allocation outputs hard to stabilize.

This phase should reduce that risk by defining:

- where business logic lives
- how external dependencies are configured
- what a stable response payload looks like
- how degraded or missing data is represented
- what tests must exist before ingestion and risk logic grow
- what pricing and freshness rules later phases are required to honor

## In Scope

- `services/agent/app/main.py` startup and router registration
- `services/agent/app/core/settings.py` and adjacent config helpers
- `services/agent/app/core/logging.py` and error-handling conventions
- `services/agent/app/schemas/*` for shared DTOs
- skeleton folders under `modules`, `risk`, `strategies`, `simulations`, `repositories`, `jobs`, and `tests`
- health and service status surfaces
- documentation updates for AI service planning and changes
- `docs/ai-data-analytics/recommendation_model.md` as the canonical Phase 0 decision contract

## Out Of Scope

- live Hermes or Pyth ingestion logic
- quote sampling against AGNI or Merchant Moe
- portfolio valuation and risk scoring algorithms
- AI model calls and prompt orchestration
- database schema beyond the agreed first-pass relational layout and repository boundary
- production deployment automation

## Locked Decisions This Phase Must Implement

Phase 0 implementation must honor the following locked decisions from `recommendation_model.md`:

- runtime defaults to `monitor_only`
- Mantle Sepolia is the default development chain
- status responses must expose `status`, `status_code`, and `runtime_mode`
- startup errors fail fast for required configuration
- PostgreSQL is the initial database target
- simple relational tables plus JSONB are acceptable for MVP
- global plus per-subsystem logging is supported from MVP
- pricing and freshness rules are fixed before Phase 1 coding begins

## Implementation Principles

- keep FastAPI route handlers thin
- settings must come from environment or verified repo configuration, not literals spread across modules
- every shared schema should be reusable outside the API layer
- startup should fail safely on required configuration errors
- degraded-state fields must exist before live data integration starts
- no mock or fabricated live market data should be silently substituted
- status codes should be stable and machine-readable

## Planned Outputs

### 1. Service Skeleton

- confirm package layout under `services/agent`
- ensure the app can start with a minimal health/status surface
- keep API, modules, strategies, risk, simulations, repositories, jobs, and tests separate

### 2. Configuration Boundary

Define settings for:

- service name and environment
- host, port, and runtime mode
- Mantle chain ids and RPC endpoints
- core contract addresses
- oracle and quote provider configuration
- storage and cache toggles
- logging toggles and subsystem overrides
- freshness thresholds and safe-mode defaults

Required rule:

- missing critical runtime values should fail loudly at startup unless the service is explicitly in a documented simulation-safe mode that does not require the missing dependency

### 3. Shared Schemas

Create or normalize DTOs for:

- health and service status
- standardized error payloads
- recommendation outputs
- asset and price snapshots
- quote samples and route summaries
- portfolio positions and valuation summaries
- risk bucket outputs
- proposal / decision payloads

Schema rule:

- shared outputs must include enough metadata for provenance, freshness, and confidence

### 4. Logging And Errors

Define:

- structured logs with service and request context
- global and per-subsystem log-level controls
- predictable error response shape
- domain-safe messages for configuration, dependency, and validation failures
- explicit degraded status indicators instead of ambiguous success responses with partial data

### 5. Test Scaffolding

Add baseline test organization for:

- unit tests for settings and schema validation
- integration tests for app startup and health/status routes
- scenario fixtures directory for later simulation and risk work

## Workstreams

### Workstream A: Structure and Startup

Tasks:

- verify the current `services/agent` layout
- align the structure to the implementation plan where practical
- ensure startup imports do not pull business logic prematurely
- register base routers and health endpoints

Acceptance:

- the app starts with minimal dependencies
- startup errors are actionable
- module boundaries are visible in the repository

### Workstream B: Settings and Environment Model

Tasks:

- inventory current environment variables and gaps
- define typed settings models
- group settings by chain, contracts, providers, storage, and AI runtime
- include logging and freshness configuration as first-class settings

Acceptance:

- settings are centralized
- provider-specific configuration is not hardcoded inside route handlers
- missing required settings fail predictably

### Workstream C: Schema Baseline

Tasks:

- define core reusable DTOs
- align schema names with frontend and contract vocabulary where already known
- include freshness, confidence, veto, and status-code fields where later phases require them

Acceptance:

- schemas are importable outside the API layer
- later risk and allocation modules can extend rather than replace them
- response shape drift is minimized

### Workstream D: Safety and Error Vocabulary

Tasks:

- define health states such as `ok`, `degraded`, `stale`, `monitor_only`, and `pause_recommended`
- standardize error payload fields
- define how source freshness and provider outages are surfaced
- wire the locked `status_code` catalog into the service contract

Acceptance:

- consumers can distinguish healthy, stale, degraded, and blocked states
- status semantics are documented before ingestion begins

### Workstream E: Testing Baseline

Tasks:

- add initial unit and integration tests
- define where scenario fixtures will live
- ensure tests validate settings and schema expectations first

Acceptance:

- contributors have a clear place to add tests
- the service contract is protected before business logic expands

## Deliverables

- `docs/ai-data-analytics/ImplementationPlan.md` updated with the fuller phase map
- `docs/ai-data-analytics/Phase0.md` as the execution guide for this phase
- `docs/ai-data-analytics/recommendation_model.md` as the canonical recommendation and runtime contract
- bootstrapping checklist for service startup, settings, schemas, and tests
- updated `Changes.md` entry recording the planning expansion

## Acceptance Criteria

Phase 0 is complete when:

- the service can start locally with documented minimal configuration
- startup, health, and status behavior are defined and testable
- schemas for portfolio, risk, allocation, recommendations, and errors are centralized
- no market, risk, or AI logic is embedded in route handlers
- missing critical configuration fails safely and immediately
- pricing, freshness, logging, and status-code rules are documented and stable
- later phases can add ingestion and analytics modules without refactoring the core app contract

## Exit Criteria To Start Phase 1

Before starting Phase 1, the team should have:

- an agreed settings surface for RPC, oracle, quote, storage, logging, and contract dependencies
- shared DTO names and fields that frontend and backend can align on
- documented degraded-state semantics
- a locked status code catalog
- locked pricing and freshness rules
- baseline tests guarding settings and schema behavior

## Risks To Watch

- naming drift between backend schemas and frontend expectations
- undocumented environment variables appearing in multiple modules
- business logic creeping into FastAPI route handlers
- fake or fallback data being returned without explicit degraded status
- contract vocabulary diverging from backend proposal payload vocabulary
- implementation drift away from the locked pricing and freshness rules

## Definition Of Success

Phase 0 succeeds if later implementation can proceed module by module without reopening foundational decisions about configuration, schemas, startup shape, degraded-state semantics, pricing strategy, freshness thresholds, logging policy, or status-code vocabulary.
