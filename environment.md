# Backend Endpoint Testing Environment

## Purpose

This file documents the local environment needed to test all AI/Data Analytics backend endpoints in `services/agent`.

The backend is local-safe by default. Without live wallet, PostgreSQL, oracle, quote, and contract configuration, several endpoints intentionally return degraded, missing-data, simulation-only, or blocked readiness states.

## Service Root

Run commands from the repository root:

```powershell
cd D:\RWA
```

## Python Environment

Recommended setup:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r services\agent\requirements.txt
```

If dependencies are already installed globally or in an existing virtual environment, activate that environment instead.

## Required Local Environment Variables

Create or update:

```text
services/agent/.env
```

Minimum local-safe values:

```env
APP_NAME=AIxRWA Agent
APP_ENV=local
API_PORT=8000
RUNTIME_MODE=monitor_only
TARGET_CHAIN=mantle_sepolia

LOG_ENABLED=true
LOG_LEVEL=INFO

DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/aixrwa

MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz
MANTLE_MAINNET_RPC_URL=https://rpc.mantle.xyz

SIMULATION_FALLBACK_ENABLED=true
AI_REASONING_ENABLED=false
AI_REASONING_PROVIDER=ollama
AI_REASONING_MODEL=qwen2.5:3b
OLLAMA_URL=http://host.docker.internal:11434
```

Optional live-read values:

```env
PORTFOLIO_WALLET_ADDRESS=
EXECUTOR_VAULT_ADDRESS=
PAUSE_GUARDIAN_ADDRESS=
TRADE_APPROVAL_MANAGER_ADDRESS=

MANTLE_SEPOLIA_QUICKNODE_HTTP_URL=
MANTLE_SEPOLIA_QUICKNODE_WSS_URL=
MANTLE_MAINNET_QUICKNODE_HTTP_URL=
MANTLE_MAINNET_QUICKNODE_WSS_URL=
```

For proposal creation tests with successful `200` responses, you also need real configured router, token, vault, price snapshot, and risk state inputs. Without them, `/proposals/create` should fail safely with `400`.

## PostgreSQL

The code can fall back to in-memory SQLite for local tests, but PostgreSQL is required for realistic persistence testing.

Create the database before running full persistence checks:

```powershell
createdb -U postgres aixrwa
```

If using Docker PostgreSQL, start it first and make sure `DATABASE_URL` matches the exposed port and credentials.

## Start The Backend

From repo root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn services.agent.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Base URL:

```text
http://127.0.0.1:8000
```

API docs:

```text
http://127.0.0.1:8000/docs
http://127.0.0.1:8000/redoc
```

## Automated Test Commands

Full backend suite:

```powershell
python -m unittest discover services.agent.tests -v
```

Integration endpoint suite:

```powershell
python -m unittest services.agent.tests.integration.test_backtests services.agent.tests.integration.test_chain services.agent.tests.integration.test_health services.agent.tests.integration.test_market services.agent.tests.integration.test_ops services.agent.tests.integration.test_portfolio services.agent.tests.integration.test_portfolio_endpoints services.agent.tests.integration.test_risk -v
```

Phase 6 tests:

```powershell
python -m unittest services.agent.tests.unit.test_backtest_metrics services.agent.tests.unit.test_backtest_engine services.agent.tests.integration.test_backtests -v
```

Phase 7 tests:

```powershell
python -m unittest services.agent.tests.unit.test_ops_alerts services.agent.tests.integration.test_ops -v
```

## Endpoint Smoke Tests

Set:

```powershell
$BASE="http://127.0.0.1:8000"
```

### System

```powershell
curl "$BASE/health"
curl "$BASE/status"
curl "$BASE/chain/status"
```

### Contracts

```powershell
curl "$BASE/contracts"
curl "$BASE/contracts/pause_guardian"
curl "$BASE/contracts/trade_approval_manager"
curl "$BASE/contracts/executor_vault"
```

### Market Data

```powershell
curl "$BASE/market/ingestion/status"
curl "$BASE/market/prices/latest"
curl "$BASE/market/prices/USDY"
curl "$BASE/market/prices/mETH"
curl "$BASE/market/oracles/usdy"
curl "$BASE/market/routes"
```

### Quotes

```powershell
curl "$BASE/market/quotes/latest"
curl "$BASE/market/quotes/USDY/mETH"
curl "$BASE/market/quotes/USDY/mETH/best"
curl "$BASE/market/quotes/FOO/BAR/best"
```

Expected for unknown pairs:

```text
404 Not Found
```

### Portfolio

```powershell
curl "$BASE/portfolio/current"
curl "$BASE/portfolio/snapshot"
curl "$BASE/portfolio/snapshots"
curl "$BASE/portfolio/snapshots/latest"
```

Expected without configured wallet/vault or persisted snapshots:

```text
DATA_MISSING or 404 for latest persisted snapshot
```

### Risk

```powershell
curl "$BASE/risk/current"
curl "$BASE/risk/snapshot"
curl "$BASE/risk/assessments"
curl "$BASE/risk/assessments/latest"
```

Expected without usable portfolio/market data:

```text
RISK_VETO or DATA_MISSING states
```

### Allocation

```powershell
curl "$BASE/allocation/recommendation"
curl -X POST "$BASE/allocation/profile" -H "Content-Type: application/json" -d "{\"profile_name\":\"Defensive\"}"
curl -X POST "$BASE/allocation/profile" -H "Content-Type: application/json" -d "{\"profile_name\":\"Balanced\"}"
curl -X POST "$BASE/allocation/profile" -H "Content-Type: application/json" -d "{\"profile_name\":\"Yield-Seeking\"}"
```

Expected without usable portfolio data:

```text
PAUSE recommendation with no rebalance actions
```

### Decisions And Proposals

```powershell
curl "$BASE/decisions"
```

Create proposal:

```powershell
curl -X POST "$BASE/proposals/create" -H "Content-Type: application/json" -d "{\"asset_symbol\":\"mETH\",\"action\":\"BUY\",\"amount\":2.5}"
```

Expected without full live-safe inputs:

```text
400 Bad Request
```

Approve/reject only after a successful proposal creation returns a `proposal_id`:

```powershell
curl -X POST "$BASE/proposals/{proposal_id}/approve"
curl -X POST "$BASE/proposals/{proposal_id}/reject"
```

### Backtests

```powershell
curl "$BASE/backtests/scenarios"
curl "$BASE/backtests/demo-summary"
curl -X POST "$BASE/backtests/run" -H "Content-Type: application/json" -d "{\"scenario_id\":\"depeg\"}"
curl -X POST "$BASE/backtests/run" -H "Content-Type: application/json" -d "{\"scenario_id\":\"liquidity_shock\"}"
curl -X POST "$BASE/backtests/run" -H "Content-Type: application/json" -d "{\"scenario_id\":\"stale_oracle\"}"
```

Expected status code in payload:

```text
SIMULATION_ONLY
```

### Ops

```powershell
curl "$BASE/ops/health"
curl "$BASE/ops/alerts"
curl "$BASE/ops/readiness"
```

Expected until live validation is complete:

```text
ready_for_live=false
recommended_mode=pause or monitor_only depending on available local data
```

## Current Local Test Result

Last verified command:

```powershell
python -m unittest discover services.agent.tests -v
```

Result:

```text
Ran 67 tests
OK
```

Integration endpoint suite result:

```text
Ran 28 tests
OK
```

## Readiness Notes

The backend is locally testable and endpoint-safe when the automated suite passes.

The backend is not live-production-ready until Phase 1B validation is complete:

- Ondo USDY oracle live read verification
- Pyth ETH/USD and mETH pricing verification
- AGNI quote decoding verification
- Merchant Moe quote decoding verification
- PostgreSQL write/read persistence against the real configured database
- configured wallet/vault and contract addresses
- proposal creation tested with fresh price snapshots and policy-allowed rebalance actions
