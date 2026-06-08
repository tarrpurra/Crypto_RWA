# Recommendation Model

## Purpose

This document defines the canonical recommendation and runtime decision model for the AI + Data Analytics service.

It records the Phase 0 decisions already made and the remaining implementation rules that must now be treated as locked unless explicitly changed.

This document is the working contract for Phase 0 and the baseline for later risk, allocation, proposal, execution, and AI recommendation outputs.

## Locked Phase 0 Decisions

### 1. Runtime Mode Policy

Default mode:

- `monitor_only`

Other allowed modes:

- `simulation`
- `live`

Usage rule:

- local and normal development should default to `monitor_only`
- full demo validation may run in `simulation`
- deployment-ready environments may run in `live`

### 2. Chain Target Policy

Default chain during build and testing:

- Mantle Sepolia

Deployment target:

- Mantle Mainnet

Usage rule:

- all Phase 0 and early implementation should assume Mantle Sepolia first
- mainnet support should exist in configuration, but mainnet should not be the default operating target during development

### 3. Status Model

Every service-level status response should expose:

- `status`
- `status_code`
- `runtime_mode`

Allowed runtime modes:

- `monitor_only`
- `simulation`
- `live`

Recommended top-level status values:

- `ok`
- `degraded`
- `stale`
- `error`

`status_code` rule:

- use a stable machine-readable code, not only free-form text
- use `status_code` for machine logic
- use `status_label` for frontend display
- use `status_reason` for human explanation

Status namespaces are layered:

- allocation responses use risk-oriented codes
- proposal creation and queue management use proposal lifecycle codes
- execution readiness and submission use execution codes

## Locked Pricing Strategy

Use a multi-source pricing strategy.

Do not rely on a single oracle source.

### USDY

Primary reference price:

- Ondo Mantle Redemption Price Oracle

Market execution price:

- live DEX quotes from AGNI and Merchant Moe

Risk comparison:

- compare DEX mid price against Ondo oracle price
- include liquidity checks before trusting market execution quality

Rules:

- never invent a USDY oracle feed that is not verified
- never execute from oracle price alone
- never use DEX spot alone for RWA risk decisions

### mETH

Primary anchor:

- Pyth `ETH/USD`

Market price:

- DEX-derived `mETH/ETH` or `mETH/USD`

Risk comparison:

- monitor `mETH` discount or premium against ETH-linked fair value
- track basis risk and liquidity risk separately from ETH directional risk

Rules:

- treat `mETH` as an ETH-linked yield or growth asset, not a stablecoin peg asset
- do not assume a direct verified `mETH/USD` oracle exists until confirmed

### Execution Pricing

Rules:

- always use live DEX quotes before trade execution
- never execute from oracle price alone
- execution price must be the freshest valid best DEX quote

Final pricing rule:

```text
USDY price strategy = Ondo redemption oracle + DEX quote + liquidity check
mETH price strategy = Pyth ETH/USD + DEX mETH quote + basis/liquidity check
Execution price = fresh best DEX quote only
```

## Locked Freshness Thresholds

Use these MVP defaults.

| Data type | Fresh limit | Warn | Hard block |
| --- | ---: | ---: | ---: |
| Pyth ETH/USD | 120 sec | >120 sec | >300 sec |
| Ondo USDY oracle | 600 sec | >300 sec | >600 sec |
| DEX quote | 30 sec | >15 sec | >30 sec |
| Route / liquidity depth | 60 sec | >60 sec | >120 sec |
| Portfolio balance snapshot | 60 sec | >60 sec | >180 sec |
| Risk score snapshot | 60 sec | >60 sec | >120 sec |
| Trade approval packet | 120 sec expiry | N/A | expired = block |
| Pending transaction | 180 sec | >180 sec | switch to manual review |
| RPC health sample | 60 sec | >60 sec | degraded mode |

Implementation rules:

```text
If quote is stale -> do not build trade.
If oracle is stale -> do not execute trade.
If risk snapshot is stale -> recompute before approval.
If approval packet is expired -> reject execution.
```

## Locked Status Code Catalog

### System Mode Statuses

```text
LIVE
SIMULATION_ONLY
DEGRADED
PAUSED
EMERGENCY_PAUSED
MAINTENANCE
```

### Data Statuses

```text
DATA_FRESH
DATA_STALE
DATA_MISSING
DATA_PARTIAL
ORACLE_FRESH
ORACLE_STALE
QUOTE_FRESH
QUOTE_STALE
LIQUIDITY_UNKNOWN
```

### Risk Statuses

```text
RISK_NORMAL
RISK_CAUTION
RISK_REBALANCE_ONLY
RISK_REDUCE_ONLY
RISK_PAUSE_REQUIRED
RISK_VETO
```

Risk score band mapping:

```text
0-25   = RISK_NORMAL
25-45  = RISK_CAUTION
45-65  = RISK_REBALANCE_ONLY
65-80  = RISK_REDUCE_ONLY
>80    = RISK_PAUSE_REQUIRED
Hard guard failure = RISK_VETO
```

### Proposal Statuses

Proposal lifecycle codes are only for `/proposals/*` queue state and approval history.

```text
PROPOSAL_DRAFT
PROPOSAL_RISK_CHECKING
PROPOSAL_RISK_APPROVED
PROPOSAL_RISK_REJECTED
PROPOSAL_PENDING_APPROVAL
PROPOSAL_APPROVED
PROPOSAL_REJECTED
PROPOSAL_EXPIRED
PROPOSAL_EXECUTING
PROPOSAL_EXECUTED
PROPOSAL_FAILED
PROPOSAL_CANCELLED
```

### Execution Statuses

```text
EXECUTION_READY
EXECUTION_BLOCKED
EXECUTION_SUBMITTED
EXECUTION_PENDING
EXECUTION_CONFIRMED
EXECUTION_REVERTED
EXECUTION_FAILED
EXECUTION_SKIPPED
EXECUTION_SIMULATED
```

### Alert Severity Statuses

```text
INFO
WARNING
HIGH
CRITICAL
RESOLVED
```

## Locked Database Direction

Database choice:

- PostgreSQL

Storage rules:

- use a simple relational layout first
- use JSONB for flexible fields
- avoid complex time-series infrastructure for MVP

First-pass tables:

```text
assets
price_snapshots
quote_snapshots
portfolio_snapshots
risk_snapshots
allocation_decisions
trade_proposals
trade_executions
alerts
system_events
```

### Minimum `price_snapshots` Fields

```text
id
asset_symbol
source
price
confidence
publish_time
ingest_time
freshness_status
raw_payload_json
```

### Minimum `quote_snapshots` Fields

```text
id
protocol
route
token_in
token_out
amount_in
quoted_amount_out
estimated_slippage_bps
route_depth_usd
quote_time
freshness_status
raw_payload_json
```

### Minimum `risk_snapshots` Fields

```text
id
asset_symbol
total_score
risk_band
status_code
confidence
bucket_scores_json
prechecks_json
notes_json
created_at
```

### Minimum `allocation_decisions` Fields

```text
id
wallet_or_vault
current_allocation_json
target_allocation_json
recommended_action
confidence
reasoning
risk_snapshot_id
status_code
created_at
```

### Minimum `trade_proposals` Fields

```text
id
proposal_id
plan_hash
wallet_or_vault
router
token_in
token_out
amount_in
min_amount_out
deadline
expires_at
status_code
risk_snapshot_id
calldata_hash
created_at
updated_at
```

### Minimum `trade_executions` Fields

```text
id
proposal_id
tx_hash
quoted_out
actual_out
gas_used
realized_slippage_bps
status_code
failure_reason
executed_at
```

### Minimum `alerts` Fields

```text
id
severity
status_code
source_module
message
related_entity_type
related_entity_id
created_at
resolved_at
```

## Locked Logging Policy

Use both a global logging level and optional per-subsystem overrides.

Recommended environment variables:

```env
LOG_LEVEL=INFO

LOG_MARKET_DATA=INFO
LOG_ORACLE=INFO
LOG_QUOTES=INFO
LOG_RISK=DEBUG
LOG_ALLOCATION=INFO
LOG_AI=INFO
LOG_PROPOSALS=DEBUG
LOG_EXECUTION=DEBUG
LOG_ALERTS=INFO
LOG_DB=WARNING
```

Behavior rule:

```text
If subsystem log level is set, use it.
If not set, fall back to LOG_LEVEL.
```

Operational rule:

- global logging stays mandatory
- per-subsystem logging is supported from MVP
- risk, proposals, and execution should remain especially debuggable during hackathon delivery

## Canonical Recommendation Output Model

Every recommendation-oriented output should be shaped around these fields.

Required fields:

- `asset`
- `recommended_action`
- `risk_score`
- `confidence`
- `reasoning_summary`
- `data_sources_used`
- `hard_veto_status`
- `required_human_approval_status`

Recommended additional fields:

- `status`
- `status_code`
- `status_label`
- `status_reason`
- `runtime_mode`
- `target_chain`
- `as_of_timestamp`
- `freshness_status`
- `constraints_applied`
- `notes`

## Canonical Service Status Contract

Every Phase 0 status-oriented endpoint should converge on a common shape.

Minimum fields:

- `status`
- `status_code`
- `runtime_mode`
- `target_chain`
- `environment`

Recommended operational fields:

- `status_label`
- `status_reason`
- `configured_contracts`
- `freshness_thresholds`
- `logging_enabled`
- `log_level`
- `simulation_fallback_enabled`

## Error Contract

Recommended baseline error response:

```json
{
  "status": "error",
  "status_code": "CONFIG_ERROR",
  "message": "Required RPC configuration is missing.",
  "details": {
    "field": "MANTLE_SEPOLIA_RPC_URL"
  },
  "runtime_mode": "monitor_only",
  "degraded": false,
  "action_required": "Set the missing environment variable and restart the service."
}
```

Rules:

- error messages should be human-readable
- status codes should be stable and machine-readable
- details should help debugging without leaking secrets
- startup failures should surface immediately for required configuration

## Phase 0 Completion Rule

Phase 0 is complete when:

- the service foundation is ready for Phase 1

This means:

- startup path is stable
- config model is stable
- pricing strategy is locked
- freshness thresholds are locked
- status and error vocabulary are stable
- schema direction is stable
- logging behavior is stable
- test baseline exists

## Remaining Verification Items

These are not architecture decisions anymore. They are verification and implementation tasks.

- verify the exact Ondo oracle integration surface used on Mantle
- verify final contract and asset addresses by environment
- verify final feed identifiers required for `ETH/USD` and any approved derived pricing inputs
- translate the simple PostgreSQL decision into concrete migrations or models
- implement the status code catalog consistently across service responses, logs, and persistence

## Decision Summary

Locked now:

- default runtime mode is `monitor_only`
- development chain is Mantle Sepolia
- mainnet is for deployment and live operation
- USDY pricing uses Ondo oracle plus DEX quotes plus liquidity checks
- mETH pricing uses Pyth `ETH/USD` plus DEX pricing plus basis and liquidity checks
- execution always uses fresh DEX quotes
- freshness thresholds are fixed for MVP
- status responses must include `status_code` and `runtime_mode`
- PostgreSQL is the first database target
- JSONB is allowed for flexible fields
- logging uses global plus per-subsystem overrides from MVP
- startup errors should fail fast
- schema sharing stays inside the service for now
- Phase 0 is complete when the service is ready to enter Phase 1
