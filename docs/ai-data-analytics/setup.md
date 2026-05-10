# AI + Data Analytics Service Setup

## Purpose

This document explains how to set up the AI + Data Analytics service for AIxRWA.

This service owns:

- allocation engine
- AI reasoning and prompt logic
- Pyth / Hermes ingestion
- quote sampling and market normalization
- risk scoring
- simulations and backtests
- analytics APIs consumed by the website

## Target Workspace

The service should primarily live in:

```text
/services/agent
|-- app/
|-- modules/
|-- strategies/
|-- risk/
|-- simulations/
|-- repositories/
|-- jobs/
`-- tests/
```

Optional supporting workspace:

```text
/data
|-- seeds/
`-- scenarios/
```

## Recommended Tooling

- Python 3.11+
- FastAPI for API endpoints
- Pydantic for schemas and settings
- `pandas` or `polars` for analytics
- `httpx` for async HTTP calls
- PostgreSQL for persistent data
- Redis optional for caching and queues
- `pytest` for testing

## Prerequisites

Install the following:

- Python 3.11 or newer
- Git
- PostgreSQL
- optional Redis
- access to Mantle RPC endpoints

## Create the Python Environment

From the repo root:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

## Install Core Dependencies

If dependency files do not exist yet, install the base stack manually:

```powershell
pip install fastapi uvicorn pydantic pydantic-settings httpx sqlalchemy psycopg[binary] pandas polars numpy pytest pytest-asyncio
```

Optional packages:

```powershell
pip install redis apscheduler python-dotenv
```

## Environment Variables

Create a `.env` file for local development.

Suggested variables:

```env
APP_ENV=local
API_PORT=8000
MANTLE_MAINNET_RPC_URL=https://rpc.mantle.xyz
MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aixrwa
REDIS_URL=redis://localhost:6379/0
PYTH_HERMES_URL=https://hermes.pyth.network
USDY_MAINNET_ADDRESS=0x5be26527e817998a7206475496fde1e68957c5a6
METH_MAINNET_ADDRESS=0xcDA86A272531e8640cD7F1a92c01839911B90bb0
METH_SEPOLIA_ADDRESS=0x9EF60874d4c5d57E7361F564b9cA86056fDf5B89
PYTH_MAINNET_CONTRACT=0xA2aa501b19aff244D90cc15a4Cf739D2725B5729
PYTH_SEPOLIA_CONTRACT=0x98046Bd286715D3B0BC227Dd7a956b83D8978603
```

Important rules:

- do not commit secrets
- do not assume final Sepolia stablecoin addresses until verified
- do not hardcode incomplete Pyth feed IDs

## Suggested Service Layout

```text
/services/agent
|-- app/
|   |-- main.py
|   |-- api/
|   |-- core/
|   `-- schemas/
|-- modules/
|   |-- market_data/
|   |-- oracle/
|   |-- quotes/
|   |-- proposals/
|   `-- alerts/
|-- strategies/
|   |-- allocation/
|   `-- decision_templates/
|-- risk/
|   |-- buckets/
|   |-- scoring/
|   `-- guards/
|-- simulations/
|   |-- backtests/
|   |-- stress/
|   `-- benchmarks/
|-- repositories/
|   |-- db/
|   `-- cache/
|-- jobs/
|   |-- ingest_prices.py
|   |-- sample_quotes.py
|   `-- compute_snapshots.py
`-- tests/
```

## First Local Commands

Health check:

```powershell
python --version
pip --version
```

Run tests:

```powershell
pytest
```

Run local API:

```powershell
uvicorn services.agent.app.main:app --reload --port 8000
```

## Local Development Flow

1. Set up Python environment.
2. Define settings and shared schemas.
3. Implement oracle and quote ingestion first.
4. Add persistence and snapshots.
5. Build risk scoring.
6. Build allocation and AI decision generation.
7. Add simulation and benchmarking.
8. Expose stable API contracts to the frontend.

## Setup Acceptance Checklist

- Python environment is active
- dependencies install successfully
- database is reachable
- service boots locally
- tests execute
- Mantle RPC URLs are configured
- Hermes endpoint is configured

## Notes

- This service should own the logic that explains why capital should move.
- AI output must remain advisory until risk rules pass.
- Keep deterministic fallback rules even if the LLM layer is unavailable.
