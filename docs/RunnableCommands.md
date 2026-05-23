# Runnable Commands

This file lists the commands you can run in the current `D:\RWA` workspace.

## Repo Root

Start all Docker services:

```powershell
cd D:\RWA
docker compose up --build
```

Start Docker services in background:

```powershell
cd D:\RWA
docker compose up -d --build
```

Stop Docker services:

```powershell
cd D:\RWA
docker compose down
```

Rebuild a specific service:

```powershell
cd D:\RWA
docker compose build foundry
docker compose build backend
```

Open a shell in the Foundry container:

```powershell
cd D:\RWA
docker compose exec foundry bash
```

Open a shell in the backend container:

```powershell
cd D:\RWA
docker compose exec backend bash
```

## AI / Data Analytics Service

Service location:

```text
services/agent
```

### Local Python Setup

Create a virtual environment:

```powershell
cd D:\RWA
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install from requirements:

```powershell
cd D:\RWA
pip install -r services\agent\requirements.txt
```

Install as a package from `pyproject.toml`:

```powershell
cd D:\RWA
pip install -e .\services\agent
```

### Run the API Locally

Run FastAPI with reload:

```powershell
cd D:\RWA
uvicorn services.agent.app.main:app --reload --host 0.0.0.0 --port 8000
```

Run FastAPI without reload:

```powershell
cd D:\RWA
uvicorn services.agent.app.main:app --host 0.0.0.0 --port 8000
```

### Run the API in Docker

Start only the backend service:

```powershell
cd D:\RWA
docker compose up --build backend
```

Backend is exposed at:

```text
http://localhost:8000
```

### Test the AI / Data Analytics Service

Run all tests from repo root:

```powershell
cd D:\RWA
pytest services\agent\tests
```

Run a specific integration test file:

```powershell
cd D:\RWA
pytest services\agent\tests\integration\test_health.py
pytest services\agent\tests\integration\test_market.py
```

## Smart Contracts

Contracts location:

```text
contracts
```

These commands are intended to run inside the Foundry container unless `forge` is installed locally.

### Build and Test

```bash
cd /workspace/contracts
forge build
forge test
```

Run individual contract test suites:

```bash
cd /workspace/contracts
forge test --match-path test/unit/PauseGuardian.t.sol
forge test --match-path test/unit/TradeApprovalManager.t.sol
forge test --match-path test/unit/ExecutorVault.t.sol
forge test --match-path test/integration/ProposalExecutionFlow.t.sol
forge test --match-path test/integration/RouterWhitelistFlow.t.sol
forge test --match-path test/integration/PauseAndRecoveryFlow.t.sol
```

### Sepolia Deployment and Configuration

Load env in the container shell:

```bash
cd /workspace/contracts
set -a
source .env
set +a
```

Deploy the contract suite:

```bash
cd /workspace/contracts
forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url "$RPC_URL" --broadcast -vvvv
```

Configure approved routers and selectors:

```bash
cd /workspace/contracts
forge script script/ConfigureRouters.s.sol:ConfigureRouters --rpc-url "$RPC_URL" --broadcast -vvvv
```

Run the phase gate check:

```bash
cd /workspace/contracts
forge script script/PhaseGateMinimalCheck.s.sol:PhaseGateMinimalCheck --rpc-url "$RPC_URL" -vvvv
```

### Mainnet Deployment Script

```bash
cd /workspace/contracts
forge script script/DeployMainnet.s.sol:DeployMainnet --rpc-url "$RPC_URL" --broadcast -vvvv
```

## Smart Contract Artifacts

Contract reference document:

```text
docs/smart-contract/SepoliaContractReference.md
```

ABI export folder:

```text
contracts/out/abis/
```

ABI manifest:

```text
contracts/out/abis/manifest.json
```

## Useful Docker Checks

Show running containers:

```powershell
docker compose ps
```

Show backend logs:

```powershell
cd D:\RWA
docker compose logs backend
```

Follow backend logs:

```powershell
cd D:\RWA
docker compose logs -f backend
```

Show foundry container logs:

```powershell
cd D:\RWA
docker compose logs foundry
```

## Notes

- Use `docker compose`, not `docker-compose`.
- Contract scripts depend on `contracts/.env` being populated.
- The exported ABI package is ready for the next service to consume.
