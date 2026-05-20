# Smart Contract Service Changes

## Purpose

Track meaningful changes to the smart contract service. This file should be updated whenever scope, architecture, interfaces, or deployment behavior changes.

## Format

For each entry, record:

- date
- author
- type
- summary
- affected files or modules
- impact on frontend, AI/data analytics, or deployment

## Change Log

### 2026-05-12

Type:
Security | Docs

Summary:

- tightened `ImplementationPlan.md` so the executor is a bounded router executor instead of a generic arbitrary-call vault
- defined a normalized execution payload with selector, calldata hash, recipient, spend cap, value, and replay-protection requirements
- clarified that Sepolia validation must use verified testnet assets or mocks rather than assumed mainnet-equivalent assets
- aligned the contract plan with the master-plan requirement for an explicit emergency withdrawal and recovery path

Affected scope:

- `docs/smart-contract/ImplementationPlan.md`
- `docs/FileStructure.md`

Impact:

- frontend: proposal and execution UI should expect stricter status and payload semantics
- AI/data analytics: proposal builder must emit the normalized execution payload fields captured in the plan
- deployment: Sepolia testing should not depend on unverified USDY or stablecoin testnet addresses

### 2026-05-11

Type:
Documentation bootstrap

Summary:

- created smart contract service documentation folder
- added `setup.md`
- added `ImplementationPlan.md`
- added `Changes.md`

Affected scope:

- docs only

Impact:

- establishes the working documentation baseline for the smart contract owner

## Future Entry Template

```text
### YYYY-MM-DD

Type:
Feature | Refactor | Security | Deployment | Docs | Breaking change

Summary:

- item 1
- item 2

Affected scope:

- contracts/src/...
- contracts/test/...

Impact:

- frontend:
- AI/data analytics:
- deployment:
```


### 2026-05-14

Type:
Feature | Security | Docs

Summary:

- scaffolded `contracts/` Foundry workspace baseline with `foundry.toml` and `.env.example`
- added Phase 0 shared libraries for roles, errors, events, execution payload schema, proposal status enum, and normalized payload hashing
- added protocol interface stubs for ERC-20, AGNI, Merchant Moe, and Pyth-facing integration points
- implemented initial `PauseGuardian` guardrail contract with role-gated pause control, router whitelist, selector allowlist, and route enforcement checks

Affected scope:

- `contracts/foundry.toml`
- `contracts/.env.example`
- `contracts/src/core/PauseGuardian.sol`
- `contracts/src/interfaces/*.sol`
- `contracts/src/libraries/*.sol`

Impact:

- frontend: establishes event surface for pause/whitelist related administrative changes
- AI/data analytics: execution payload schema and proposal hash normalization are now codified for proposal construction alignment
- deployment: baseline Foundry project is prepared for dependency install and compilation

Assumptions / unresolved verification items:

- role identifiers and event schema are baseline and may need alignment with future multisig/admin model
- protocol interface stubs are intentionally minimal pending exact router method selection
- `PauseGuardian` currently uses a shared role mapping and will be integrated or inherited by executor/approval manager in later phases

Commands user still needs to run:

- `cd contracts`
- `forge install OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std`
- `forge build`
- `forge test`
### 2026-05-14

Type:
Feature | Security

Summary:

- implemented `TradeApprovalManager` proposal lifecycle with role-restricted creation/approval/rejection and executor-only execution marking
- bound proposal intent to normalized payload hash via `ProposalHashLib` to block modified calldata/payload execution
- added expiry and replay protections for proposal execution lifecycle
- expanded shared errors/events to include proposal lifecycle signaling and revert reasons
- added unit tests for create->approve->execute, rejection, expiry, hash mismatch protection, and replay rejection

Affected scope:

- `contracts/src/core/TradeApprovalManager.sol`
- `contracts/src/libraries/Errors.sol`
- `contracts/src/libraries/Events.sol`
- `contracts/test/unit/TradeApprovalManager.t.sol`

Impact:

- frontend: can consume explicit proposal lifecycle events for approvals and execution status tracking
- AI/data analytics: proposal builder must keep payload fields stable since hash binding is enforced at execution marking
- deployment: executor address must be granted role before execution flow can complete

Assumptions / unresolved verification items:

- custom errors are asserted generically in tests until local forge run confirms exact selector matching assertions
- expiry semantics currently use `proposalExpiry` from payload as authoritative lifecycle cutoff

Commands user still needs to run:

- `cd contracts`
- `forge install OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std`
- `forge test --match-path test/unit/TradeApprovalManager.t.sol`
- `forge test`
### 2026-05-14

Type:
Feature | Security

Summary:

- implemented `ExecutorVault` as bounded execution contract with executor role gating and no generic arbitrary-call surface beyond approved router calldata
- enforced guardrails on execution: pause/router/selector checks via `PauseGuardian`, proposal approval+hash validity via `TradeApprovalManager`, deadline, recipient semantics, spend-cap, `msg.value` match, and `minAmountOut` via output balance delta
- implemented safe token approval reset pattern (`approve(0)` then `approve(amount)`) around router execution
- added emergency withdrawal paths for ERC-20 and native assets with strict recovery-role checks and explicit events
- added basic mocks and initial unit test coverage for emergency withdrawal authorization path

Affected scope:

- `contracts/src/core/ExecutorVault.sol`
- `contracts/src/libraries/Errors.sol`
- `contracts/src/libraries/Events.sol`
- `contracts/src/mocks/MockERC20.sol`
- `contracts/src/mocks/MockRouter.sol`
- `contracts/test/unit/ExecutorVault.t.sol`

Impact:

- frontend: execution and recovery events now available for analytics/status timelines
- AI/data analytics: execution payload must maintain exact calldata hash and recipient=`ExecutorVault` semantics
- deployment: `TradeApprovalManager` must grant `EXECUTOR_ROLE` to deployed `ExecutorVault` for `markExecuted` calls to succeed

Assumptions / unresolved verification items:

- recipient semantics are currently strict (`payload.recipient == address(this)`) to keep output-delta guarantees and avoid ambiguous third-party recipient flows
- custom error mapping for calldata-hash mismatch currently reuses `ProposalHashMismatch`; may be split into a dedicated calldata-hash error in a refinement pass
- full happy-path execution tests need forge run and expanded mock integration checks

Commands user still needs to run:

- `cd contracts`
- `forge install OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std`
- `forge test --match-path test/unit/ExecutorVault.t.sol`
- `forge test`
### 2026-05-14

Type:
Deployment | Security

Summary:

- moved to next phase without adding additional mocks/tests, per user direction
- added Foundry deployment scripts for Sepolia and Mainnet using environment-provided real values only
- added router configuration script to apply whitelist + selector allowlist on deployed `PauseGuardian`
- wired mandatory `EXECUTOR_ROLE` grant from `TradeApprovalManager` to `ExecutorVault` during deploy flow
- expanded `.env.example` with role and router configuration variables using `TODO_VERIFY` placeholders

Affected scope:

- `contracts/script/DeploySepolia.s.sol`
- `contracts/script/DeployMainnet.s.sol`
- `contracts/script/ConfigureRouters.s.sol`
- `contracts/.env.example`

Impact:

- frontend: no direct ABI/event schema changes in this step
- AI/data analytics: router/selector must match proposal payload fields emitted by backend
- deployment: scripts are ready for real-network deployment once verified addresses/selectors are supplied

Assumptions / unresolved verification items:

- all env inputs are currently `TODO_VERIFY` and must be replaced with verified environment-specific values
- selector input is expected as a numeric env value convertible to `bytes4`; exact format must be validated during first dry run
- no live router addresses or selectors were embedded in code

Commands user still needs to run:

- `cd contracts`
- `forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url $env:RPC_URL --broadcast`
- `forge script script/ConfigureRouters.s.sol:ConfigureRouters --rpc-url $env:RPC_URL --broadcast`
- `forge script script/DeployMainnet.s.sol:DeployMainnet --rpc-url $env:RPC_URL --broadcast`
### 2026-05-15

Type:
Security | Deployment

Summary:

- added minimal phase-gate stop script that explicitly fails fast when core test-readiness conditions are not satisfied
- gate checks currently validate: not paused, router whitelisted, selector allowed, and `ExecutorVault` granted `EXECUTOR_ROLE` in `TradeApprovalManager`
- updated env template with deployed contract address fields needed for gate execution

Affected scope:

- `contracts/script/PhaseGateMinimalCheck.s.sol`
- `contracts/.env.example`

Impact:

- frontend: no impact
- AI/data analytics: no impact
- deployment: adds deterministic go/no-go checkpoint before running manual minimal end-to-end testing

Assumptions / unresolved verification items:

- gate script verifies minimal wiring only; it does not execute a live swap
- all address/selector env vars remain `TODO_VERIFY` until replaced with verified network values

Commands user still needs to run:

- `cd contracts`
- `forge script script/PhaseGateMinimalCheck.s.sol:PhaseGateMinimalCheck --rpc-url $env:RPC_URL`
### 2026-05-15

Type:
Security | Deployment | Docs

Summary:

- implemented Phase 6 mainnet-readiness documentation package
- added explicit operator-only launch policy and go/no-go gating conditions
- added emergency incident runbook covering pause, containment, recovery, and resume criteria
- added post-deploy verification checklist for contract wiring, guardrails, roles, minimal live validation, and security checks

Affected scope:

- `docs/smart-contract/MainnetReadiness.md`
- `docs/smart-contract/EmergencyRunbook.md`
- `docs/smart-contract/PostDeployChecklist.md`

Impact:

- frontend: no direct code impact
- AI/data analytics: clarifies operational expectations for proposal/execution monitoring
- deployment: introduces explicit runbook/checklist requirements before live-capital scaling

Assumptions / unresolved verification items:

- all operational constants/addresses remain `TODO_VERIFY` until environment-specific verification is completed
- no live transactions were executed in this update

Commands user still needs to run:

- `cd contracts`
- `forge script script/PhaseGateMinimalCheck.s.sol:PhaseGateMinimalCheck --rpc-url $env:RPC_URL`
### 2026-05-15

Type:
Feature | Security | Test

Summary:

- hardened `ExecutorVault` so approved router calldata must match the approved selector and pass selector-specific semantic validation before any external call is made
- added bounded support for AGNI-style `exactInputSingle` payload validation and retained a strictly test-only mock swap surface for local adversarial coverage
- added explicit pause, proposal lifecycle, and calldata mismatch errors plus role-change events for sensitive admin actions
- tightened `TradeApprovalManager.markExpired` so rejected or executed proposals cannot be mutated into expired state
- added the missing `MockPyth`, shared `MockSetup` fixture, `PauseGuardian` unit coverage, expanded executor/approval tests, and the integration flow tests required by the implementation plan

Affected scope:

- `contracts/src/core/ExecutorVault.sol`
- `contracts/src/core/PauseGuardian.sol`
- `contracts/src/core/TradeApprovalManager.sol`
- `contracts/src/interfaces/IAgniSwapRouter.sol`
- `contracts/src/libraries/Errors.sol`
- `contracts/src/libraries/Events.sol`
- `contracts/src/mocks/MockPyth.sol`
- `contracts/src/mocks/MockRouter.sol`
- `contracts/test/mocks/MockSetup.sol`
- `contracts/test/unit/PauseGuardian.t.sol`
- `contracts/test/unit/TradeApprovalManager.t.sol`
- `contracts/test/unit/ExecutorVault.t.sol`
- `contracts/test/integration/ProposalExecutionFlow.t.sol`
- `contracts/test/integration/PauseAndRecoveryFlow.t.sol`
- `contracts/test/integration/RouterWhitelistFlow.t.sol`

Impact:

- frontend: role-change, pause, proposal, and execution paths now have a more explicit event/error surface for operator UX and monitoring
- AI/data analytics: proposal builders must keep router selector, calldata hash, recipient, deadline, token pair, and amount semantics aligned with the supported execution surface
- deployment: live router execution is now fail-closed unless the selector is both allowlisted and explicitly supported by the executor's validation logic

Assumptions / unresolved verification items:

- `IAgniSwapRouter.exactInputSingle` is the only real router execution surface concretely enforced in this step; additional live router selectors remain `TODO_VERIFY` before mainnet use
- Merchant Moe execution selectors are still unverified at the contract-validation layer and should not be treated as production-ready until their exact calldata semantics are added explicitly
- Foundry is not installed in this workspace, so `forge build` / `forge test` were not executed here
- `apply_patch` was unavailable due repeated sandbox refresh failures, so file edits were written directly to the affected smart-contract files

Commands user still needs to run:

- `cd contracts`
- `forge install OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std`
- `forge build`
- `forge test`
- `forge test --match-path test/unit/PauseGuardian.t.sol`
- `forge test --match-path test/unit/TradeApprovalManager.t.sol`
- `forge test --match-path test/unit/ExecutorVault.t.sol`
- `forge test --match-path test/integration/ProposalExecutionFlow.t.sol`
- `forge test --match-path test/integration/PauseAndRecoveryFlow.t.sol`
- `forge test --match-path test/integration/RouterWhitelistFlow.t.sol`
### 2026-05-15

Type:
Test

Summary:

- added explicit `ExecutorVault` unit tests for calldata-hash mismatch and unwhitelisted-router rejection to close the remaining core executor coverage gap

Affected scope:

- `contracts/test/unit/ExecutorVault.t.sol`

Impact:

- frontend: no impact
- AI/data analytics: no impact
- deployment: improves confidence that executor guardrails fail closed before live verification

Assumptions / unresolved verification items:

- Foundry is still not installed in this workspace, so the new tests were not executed here

Commands user still needs to run:

- `cd contracts`
- `forge test --match-path test/unit/ExecutorVault.t.sol`
- `forge test`
### 2026-05-15

Type:
Docs

Summary:

- added `docs/smart-contract/Left.md` to track the remaining smart-contract work required for MVP completion
- separated implemented scope from still-unverified or still-undelivered items so the team has a concrete closeout list

Affected scope:

- `docs/smart-contract/Left.md`

Impact:

- frontend: clarifies when ABI/address handoff should be expected
- AI/data analytics: clarifies when example payload and error-catalog handoff is still pending
- deployment: makes the remaining verification and Sepolia/mainnet readiness work explicit

Assumptions / unresolved verification items:

- remaining-work items are based on current repository state and may shrink after the first successful Foundry build/test/deploy cycle

Commands user still needs to run:

- `cd contracts`
- `forge build`
- `forge test`
### 2026-05-19

Type:
Fix | Test | Deployment

Summary:

- fixed Foundry 1.7 / Solidity 0.8.24 compatibility issues in router scripts by narrowing `ROUTER_SELECTOR` env input from `uint256` to `uint32` before converting to `bytes4`
- updated tests to consume `TradeApprovalManager.getProposal` as a returned `ProposalRecord` struct instead of an outdated tuple destructure
- added the missing `TradeApprovalManager` imports in executor and integration tests so status assertions compile against the struct type

Affected scope:

- `contracts/script/ConfigureRouters.s.sol`
- `contracts/script/PhaseGateMinimalCheck.s.sol`
- `contracts/test/unit/TradeApprovalManager.t.sol`
- `contracts/test/unit/ExecutorVault.t.sol`
- `contracts/test/integration/ProposalExecutionFlow.t.sol`

Impact:

- frontend: no impact
- AI/data analytics: no impact
- deployment: scripts now accept selector env values in a way that compiles under the pinned toolchain, and contract build/test should progress past these type errors

Assumptions / unresolved verification items:

- `ROUTER_SELECTOR` is still expected to fit within 4 bytes when provided through env configuration
- this update addresses only the compiler errors reported from the latest `forge build`; any subsequent runtime or dependency issues still need to be validated with a fresh build/test run

Commands user still needs to run:

- `cd contracts`
- `forge build`
- `forge test -vv`
### 2026-05-19

Type:
Fix | Refactor

Summary:

- refactored `ExecutorVault.executeApprovedTrade` into smaller validation, execution, and event-emission helpers to resolve the Solidity `Stack too deep` compiler error under `0.8.24`
- preserved the existing execution flow: route validation, proposal approval check, guarded external call, realized output check, execution marking, and event emission

Affected scope:

- `contracts/src/core/ExecutorVault.sol`

Impact:

- frontend: no impact
- AI/data analytics: no impact
- deployment: contract build should progress past the previous stack-allocation failure in `ExecutorVault`

Assumptions / unresolved verification items:

- behavior is intended to remain unchanged aside from compiler layout; this still needs confirmation from a fresh `forge build` and `forge test`

Commands user still needs to run:

- `cd contracts`
- `forge build`
- `forge test -vv`
### 2026-05-19

Type:
Docs

Summary:

- updated `docs/smart-contract/Left.md` after confirmed Docker `forge build` success
- removed build-pass as a remaining blocker and narrowed the open items to tests, deployment, router-surface completion, handoff artifacts, and lint-warning triage

Affected scope:

- `docs/smart-contract/Left.md`

Impact:

- frontend: no direct impact
- AI/data analytics: no direct impact
- deployment: remaining-work tracker now reflects that compile acceptance has been met in Docker and that test/deploy validation is the next gate

Assumptions / unresolved verification items:

- `forge build` success was reported from Docker by the user on 2026-05-19; this update does not claim `forge test` passed
- current lint warnings are informational unless the team decides they must be cleared before MVP signoff

Commands user still needs to run:

- `cd contracts`
- `forge test`
- `forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url $env:RPC_URL --broadcast`
- `forge script script/ConfigureRouters.s.sol:ConfigureRouters --rpc-url $env:RPC_URL --broadcast`
- `forge script script/PhaseGateMinimalCheck.s.sol:PhaseGateMinimalCheck --rpc-url $env:RPC_URL`
### 2026-05-19

Type:
Docs | Test

Summary:

- updated `docs/smart-contract/Left.md` after confirmed Docker `forge test` success
- removed test-pass as a remaining blocker and narrowed the open items to live router-surface completion, Sepolia deployment, handoff artifacts, and lint-warning triage
- recorded current automated validation state as `forge build` passed and `forge test` passed with 23 tests, 0 failed, 0 skipped

Affected scope:

- `docs/smart-contract/Left.md`

Impact:

- frontend: clarifies that contract code is now build/test validated before ABI and address handoff
- AI/data analytics: clarifies that contract payload/execution behavior is test-validated, while deployed-address and example-payload handoff is still pending
- deployment: remaining-work tracker now reflects that the next gating milestone is Sepolia deployment rather than local verification

Assumptions / unresolved verification items:

- test success was reported from Docker by the user on 2026-05-19 and has not been re-run from this Windows workspace
- current `forge build` warnings remain informational unless the team decides they must be cleared before MVP signoff

Commands user still needs to run:

- `cd contracts`
- `forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url $env:RPC_URL --broadcast`
- `forge script script/ConfigureRouters.s.sol:ConfigureRouters --rpc-url $env:RPC_URL --broadcast`
- `forge script script/PhaseGateMinimalCheck.s.sol:PhaseGateMinimalCheck --rpc-url $env:RPC_URL`
### 2026-05-20

Type:
Feature | Security | Test

Summary:

- expanded `ExecutorVault` supported router surfaces to include AGNI `exactInput` multi-hop swaps and Merchant Moe classic `swapExactTokensForTokens`
- kept the executor fail-closed by validating selector-specific calldata semantics for both new swap surfaces before execution
- added V3 path endpoint validation for AGNI multi-hop calldata and explicit path endpoint validation for Merchant Moe classic routing
- extended mocks and executor unit tests to cover AGNI multi-hop success, Merchant Moe classic success, invalid AGNI path rejection, and Merchant Moe path mismatch rejection
- updated remaining-work tracking so the unresolved router-surface gap is narrowed to Merchant Moe LB and aggregator support rather than all Merchant Moe execution

Affected scope:

- `contracts/src/core/ExecutorVault.sol`
- `contracts/src/interfaces/IAgniSwapRouter.sol`
- `contracts/src/interfaces/IMerchantMoeRouter.sol`
- `contracts/src/interfaces/IMerchantMoeLBRouter.sol`
- `contracts/src/interfaces/IMerchantMoeAggregatorRouter.sol`
- `contracts/src/libraries/Errors.sol`
- `contracts/src/mocks/MockRouter.sol`
- `contracts/test/mocks/MockSetup.sol`
- `contracts/test/unit/ExecutorVault.t.sol`
- `docs/smart-contract/Left.md`

Impact:

- frontend: no direct impact yet, but future ABI exports will now include the broader supported swap surface
- AI/data analytics: backend can now construct approved payloads for AGNI multi-hop and Merchant Moe classic swap routes that match explicit executor validation
- deployment: allowlist configuration can now safely include AGNI `exactInputSingle`, AGNI `exactInput`, and Merchant Moe classic `swapExactTokensForTokens` once selectors are configured on deployed contracts

Assumptions / unresolved verification items:

- Merchant Moe LB router and aggregator router calldata are still intentionally unsupported until their exact semantics are verified
- this update was validated by static review in this workspace; rerun `forge build` and `forge test` in Docker to confirm there are no compiler or runtime regressions
- the Merchant Moe classic interface added here assumes the UniswapV2-style `swapExactTokensForTokens` surface, which matches the intended MVP classic-router usage but should still be confirmed against the exact deployed router ABI before production allowlisting

Commands user still needs to run:

- `cd contracts`
- `forge build`
- `forge test`
- `forge script script/ConfigureRouters.s.sol:ConfigureRouters --rpc-url $env:RPC_URL --broadcast`
