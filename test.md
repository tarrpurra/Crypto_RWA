# AIxRWA Agent Service Testing Guide

This document explains what the AI + Data Analytics service code does, defines its scope, and provides detailed instructions on how to run, configure, and test it in real life.

---

## 1. What Our Code Does & Its Scope

The service is the advisory, risk control, and execution-planning layer of **AIxRWA**. It is written in Python (FastAPI + SQLAlchemy + Web3.py) and is fully containerized.

### Scope of the Service:
1. **Market Data Ingestion**:
   - Ingests prices from Pyth/Hermes (e.g. `ETH/USD`) and Ondo Redemption Oracle (for `USDY`).
   - Samples live DEX swap quotes from AGNI and Merchant Moe pools.
2. **Portfolio Snapshot Engine**:
   - Queries the on-chain `ExecutorVault` contract for native `MNT` and ERC20 balances (`USDC`, `USDY`, `mETH`).
   - Values the portfolio in USD and computes current asset weights.
   - Falls back to a mock $1M portfolio if the RPC is unreachable or addresses are unconfigured.
3. **Risk Scoring Engine**:
   - Computes weighted risk scores (0-100) across 4 buckets: depeg risk, liquidity/slippage risk, oracle freshness risk, and asset concentration risk.
   - Maps scores to action bands (`RISK_NORMAL`, `RISK_CAUTION`, `RISK_REBALANCE_ONLY`, `RISK_REDUCE_ONLY`, `RISK_PAUSE_REQUIRED`).
   - Evaluates hard veto rules (`RISK_VETO`) to block execution if price feeds are stale or a token depegs.
4. **Allocation Engine**:
   - Computes targets using pre-configured profiles (`Defensive`, `Balanced`, `Yield-Seeking`).
   - Identifies drifts and designs a rebalance plan (e.g., SELL mETH, BUY USDC).
   - Enforces concentration caps and clip sizing (max limits per swap) to control price impact.
5. **AI Reasoning Layer**:
   - Generates explanations for recommendations. Queries local Ollama containers (`qwen2.5:3b` or `gemma:2b`) if available.
   - Automatically falls back to a deterministic, rule-based reasoning narrative if the model is offline or disabled.
6. **Proposal Generation (Contract Bridge)**:
   - Encodes smart contract calldata (such as AGNI `exactInputSingle` parameters).
   - Generates an `ExecutionPayload` containing proposal ID, plan hash, router, calldata hash, amounts, and nonces.
   - Serves approval and rejection workflows for operators.

---

## 2. Setup & Configuration

### Prerequisites
- Python 3.12+ (local testing)
- Docker & Docker Compose (containerized execution)
- Access to Mantle Sepolia (or Mainnet) RPC endpoint.

### Environment Setup
1. Configure your `.env` in the root folder. Minimum required configurations:
   ```env
   APP_ENV=local
   MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aixrwa
   
   # Deployed Contract Addresses on Sepolia
   PAUSE_GUARDIAN_ADDRESS=0x...
   TRADE_APPROVAL_MANAGER_ADDRESS=0x...
   EXECUTOR_VAULT_ADDRESS=0x...
   
   # Token Addresses (Sepolia defaults)
   METH_SEPOLIA_ADDRESS=0x9EF60874d4c5d57E7361F564b9cA86056fDf5B89
   ```

2. Activate virtual environment (Windows Powershell):
   ```powershell
   .venv/Scripts/activate
   ```

---

## 3. How to Run the Service

### Option A: Running Containerized (Recommended)
This runs the FastAPI backend and compiling foundry tools.
```bash
docker compose up --build -d
```
The backend service will be live on `http://localhost:8000`.

### Option B: Running Locally
If you want to run the Python service directly on your host machine:
```bash
# Ensure packages are installed
pip install -r services/agent/requirements.txt

# Start local server
uvicorn services.agent.app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 4. How to Test the Code

### 4.1 Automated Tests (Pytest)
Run the unit and integration tests from the repository root:
```bash
.venv/Scripts/pytest
```
This runs 33 tests verifying:
- Schema parameters, validation, and serialization.
- Drift allocation, Defensive/Balanced/Yield-Seeking weights, and clip sizing.
- Risk scoring logic, oracle freshness flags, and vetoes.
- FastAPI REST endpoint request-response cycles (mocking db connection failures using SQLite fallback).

---

### 4.2 Manual Verification (Step-by-Step API Checklist)

Use your favorite API client (Postman, Bruno, or `curl` command line) to run the following test lifecycle:

#### Step 1: Verify Service Health and Status
Check if the service is online and retrieves chain information:
```bash
curl http://localhost:8000/health
curl http://localhost:8000/chain/status
```

#### Step 2: Get Price and Quote Ingestion Data
Check if Pyth prices are fetched and DEX quotes are sampled:
```bash
curl http://localhost:8000/market/prices/latest
curl http://localhost:8000/market/quotes/latest
```

#### Step 3: Inspect Portfolio Snapshot
Generate and store a portfolio snapshot (queries on-chain balances, falling back to mock values if RPC is off):
```bash
curl http://localhost:8000/portfolio/snapshot
```

#### Step 4: Inspect Risk Scoring Check
Verify that risk filters, depeg monitors, and action bands are computed:
```bash
curl http://localhost:8000/risk/snapshot
```

#### Step 5: Check Allocation Target and Drift Recommendations
Check which assets are drifted and what trades are recommended:
```bash
curl http://localhost:8000/allocation/recommendation
```

#### Step 6: Change Target Allocation Profile
Switch the active profile to Defensive:
```bash
curl -X POST http://localhost:8000/allocation/profile \
     -H "Content-Type: application/json" \
     -d "{\"profile_name\": \"Defensive\"}"
```
Verify that targets update by fetching `/allocation/recommendation` again.

#### Step 7: Read AI Explanations and Reasoning
View the AI narrative summaries explaining the rebalance actions (falls back to deterministic template reasons if Ollama is offline):
```bash
curl http://localhost:8000/decisions
```

#### Step 8: Create a Trade Proposal
Propose a swap (e.g. buying 1.5 mETH using USDC reserves). This encodes the AGNI router calldata and returns the signed `ExecutionPayload`:
```bash
curl -X POST http://localhost:8000/proposals/create \
     -H "Content-Type: application/json" \
     -d "{\"asset_symbol\": \"mETH\", \"action\": \"BUY\", \"amount\": 1.5}"
```
Copy the returned `"proposal_id"` (e.g., `0xabc123...`) and the contract-compatible `"payload"` object from the response.

#### Step 9: Approve the Proposal
Register the operator's approval for the proposal ID:
```bash
curl -X POST http://localhost:8000/proposals/0xabc123...your_proposal_id/approve
```

---

## 5. Executing Trades On-Chain

Once a proposal status is `PROPOSAL_APPROVED`, the `ExecutionPayload` fields can be signed/submitted on-chain.

### Contract Invocation:
The executor account executes the swap by calling `executeApprovedTrade` on the `ExecutorVault` contract address:

```solidity
function executeApprovedTrade(
    ExecutionTypes.ExecutionPayload calldata payload,
    bytes calldata routerCalldata,
    uint256 amountIn
) external payable;
```

Pass the payload fields generated in **Step 8** and the router calldata. The contract will:
1. Re-validate the proposal hash matches the signature approvals in `TradeApprovalManager`.
2. Check `PauseGuardian` rules for the target router.
3. Perform the swap on AGNI/Moe and verify slippage is within bounds.
