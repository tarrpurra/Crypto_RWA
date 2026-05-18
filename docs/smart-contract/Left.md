# Smart Contract Remaining Work

## Purpose

This document tracks what is still left before the smart contract lane can be treated as MVP-complete against `docs/smart-contract/ImplementationPlan.md`.

## Current Status

Implemented in repo today:

- core contracts exist: `PauseGuardian`, `TradeApprovalManager`, `ExecutorVault`
- router whitelist and selector allowlist exist
- proposal approval and execution path exists
- emergency recovery path exists
- deployment/configuration scripts exist
- unit and integration tests exist for the core flows
- `forge build` succeeded in Docker on 2026-05-19
- `forge test` passed in Docker on 2026-05-19 with 23 tests passed, 0 failed, 0 skipped
- phase 6 operational docs exist

Not yet fully closed:

- live Sepolia deployment and end-to-end validation are not recorded
- ABI/address handoff artifacts for other teams are not produced yet
- live router selector support is still incomplete beyond the currently validated AGNI path
- lint warnings from `forge build` still need triage or explicit acceptance

## What Is Left

### 1. Complete Supported Router Surface

Still unfinished at the contract-validation layer:

- add explicit Merchant Moe selector support only after exact calldata semantics are verified
- decide which Merchant Moe surfaces are in MVP scope: classic router, LB router, aggregator, or a reduced subset
- implement selector-specific validation for each approved live selector
- leave every unsupported selector fail-closed

Reason:
The executor is now bounded, but it currently has concrete live validation only for the AGNI `exactInputSingle` path plus a test-only mock selector.

### 2. Sepolia Deployment Validation

Still left for Phase 5 completion:

- populate `.env.example` values with verified Sepolia values
- deploy to Mantle Sepolia using the existing scripts
- configure router whitelist and selector allowlist on the deployed contracts
- run the phase-gate script
- perform one minimal end-to-end proposal -> approve -> execute validation using verified testnet assets or mocks
- record deployed addresses

Reason:
Deployment scripts exist, but there is no verified deployment result or testnet execution record yet.

### 3. Mainnet Go-Live Preparation

Still left for true Phase 6 readiness:

- verify final mainnet router addresses and approved selectors
- verify final role owners, operator accounts, and recovery owner or multisig
- confirm operator-only launch policy for initial live usage
- dry-run the emergency runbook with the actual deployment roles
- complete post-deploy checklist against the deployed contracts

Reason:
The docs exist, but the environment-specific verification work is still pending.

### 4. Deliverables For Other Teams

Still left from the implementation plan output requirements:

- export and share ABI artifacts for frontend and backend consumption
- publish deployed contract addresses by environment
- provide event schema reference
- provide example normalized proposal payload
- provide execution error catalog mapped from custom errors

Reason:
The contracts exist, but the cross-team handoff package is not assembled yet.

### 5. Lint Warning Triage

Still unresolved:

- decide whether the current `forge build` warnings should be fixed now or explicitly accepted for MVP
- if fixing them, clean up the `unsafe-typecast`, `block-timestamp`, and mock transfer-return warnings where appropriate

Reason:
The suite now builds and tests cleanly, but the current warning set should either be addressed or consciously accepted.

### 6. Optional Scope Decision

Still unresolved:

- decide whether `AgentIdentity` is out of MVP scope or should be implemented later

Reason:
It remains listed as optional in the plan and is not implemented today.

## Recommended Immediate Order

1. Lock the MVP router/selector set.
2. Validate Sepolia deployment and record addresses.
3. Export ABI/address/error artifacts for the other teams.
4. Triage or accept the current lint warnings.
5. Only then expand contract support to additional router selectors if needed.

## Definition Of Done Gaps

The smart contract lane should still be considered incomplete until all of the following are true:

- Sepolia deployment is completed and recorded
- approved router selectors are explicitly validated, not just allowlisted
- ABI and address handoff is completed
- go-live constants and privileged roles are verified for the target environment

## Commands Still Needed

```powershell
cd contracts
forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url $env:RPC_URL --broadcast
forge script script/ConfigureRouters.s.sol:ConfigureRouters --rpc-url $env:RPC_URL --broadcast
forge script script/PhaseGateMinimalCheck.s.sol:PhaseGateMinimalCheck --rpc-url $env:RPC_URL
```
