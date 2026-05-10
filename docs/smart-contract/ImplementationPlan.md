# Smart Contract Service Implementation Plan

## Service Mission

The smart contract service is responsible for safe on-chain execution. It should be minimal, auditable, and opinionated about controls.

Its job is not to decide strategy. Its job is to:

- receive approved trade intent
- validate permissions and constraints
- execute only against approved routers
- pause fast when conditions are unsafe
- emit clean events for the website and analytics layers

## Owned Deliverables

- `ExecutorVault`
- `TradeApprovalManager`
- `PauseGuardian`
- optional `AgentIdentity`
- protocol interfaces for AGNI, Merchant Moe, ERC-20, and Pyth-facing checks where needed
- deployment scripts
- unit and integration tests for contract behavior

## Contract Design Principles

- keep contracts small
- prefer explicit role-based controls
- whitelist routers
- verify calldata intent using hashes or structured proposal IDs
- enforce deadline and `minAmountOut`
- log every sensitive action
- separate emergency pause from normal governance operations

## Proposed Contract Folder Structure

```text
/contracts
|-- foundry.toml
|-- .env.example
|-- src/
|   |-- core/
|   |   |-- ExecutorVault.sol
|   |   |-- TradeApprovalManager.sol
|   |   `-- PauseGuardian.sol
|   |-- identity/
|   |   |-- AgentIdentity721.sol
|   |   `-- AgentIdentity8004.sol
|   |-- interfaces/
|   |   |-- IERC20.sol
|   |   |-- IAgniSwapRouter.sol
|   |   |-- IAgniQuoterV2.sol
|   |   |-- IMerchantMoeRouter.sol
|   |   |-- IMerchantMoeLBRouter.sol
|   |   `-- IPyth.sol
|   |-- libraries/
|   |   |-- Errors.sol
|   |   |-- Events.sol
|   |   |-- Roles.sol
|   |   `-- ProposalHashLib.sol
|   `-- mocks/
|       |-- MockERC20.sol
|       |-- MockPyth.sol
|       `-- MockRouter.sol
|-- script/
|   |-- DeploySepolia.s.sol
|   |-- DeployMainnet.s.sol
|   `-- ConfigureRouters.s.sol
|-- test/
|   |-- unit/
|   |   |-- ExecutorVault.t.sol
|   |   |-- TradeApprovalManager.t.sol
|   |   `-- PauseGuardian.t.sol
|   |-- integration/
|   |   |-- ProposalExecutionFlow.t.sol
|   |   |-- PauseAndRecoveryFlow.t.sol
|   |   `-- RouterWhitelistFlow.t.sol
|   `-- mocks/
|       `-- MockSetup.sol
`-- lib/
```

## Phase-Wise Implementation

### Phase 0: Bootstrap and Standards

Goal:
Create the base contract workspace and standards before writing business logic.

Tasks:

- initialize Foundry workspace
- install OpenZeppelin and `forge-std`
- add `.env.example`
- define role names, event naming, and error conventions
- add interface stubs for AGNI, Merchant Moe, and Pyth

Deliverables:

- workspace builds
- dependency installation is documented
- code style and naming conventions are locked

Acceptance:

- `forge build` passes
- interfaces compile
- no product logic exists yet

### Phase 1: Core Guardrails

Goal:
Implement the control layer before any external execution.

Tasks:

- build `PauseGuardian`
- build router whitelist logic
- build role model for admin, trader, guardian, and approver
- define proposal hash format
- create event schema

Deliverables:

- emergency pause path
- role-controlled configuration
- reusable proposal hash utility

Acceptance:

- unauthorized calls revert
- pause blocks protected functions
- whitelist updates emit events

### Phase 2: Approval Lifecycle

Goal:
Create a proposal and approval system that ensures only reviewed trade plans can execute.

Tasks:

- build `TradeApprovalManager`
- store proposal id, plan hash, expiry, and status
- support approval and rejection flow
- prevent execution of modified or expired plans

Deliverables:

- proposal registry
- approval state machine
- rejection handling

Acceptance:

- expired proposals cannot execute
- modified calldata cannot execute
- approval status is queryable for UI and backend

### Phase 3: Executor Implementation

Goal:
Enable guarded router execution for approved trades.

Tasks:

- build `ExecutorVault`
- support ERC-20 approvals with safe reset pattern
- enforce router whitelist
- enforce deadline and `minAmountOut`
- emit execution events

Deliverables:

- core execution contract
- guarded swap flow for approved routers
- event output for analytics and frontend

Acceptance:

- unapproved router calls revert
- paused contract cannot execute
- slippage-protected execution succeeds in positive test cases
- execution emits structured logs

### Phase 4: Integration and Mocks

Goal:
Test realistic flows without relying on unstable live routing during early development.

Tasks:

- build mock tokens, router, and Pyth contracts
- write unit tests for all core branches
- write integration tests for proposal -> approval -> execute flow
- simulate pause, stale state, and invalid execution attempts

Deliverables:

- deterministic tests
- local integration flows
- reusable mock setup utilities

Acceptance:

- all critical paths have test coverage
- failure cases are explicit and tested
- mock execution proves event shape and sequencing

### Phase 5: Sepolia Deployment

Goal:
Deploy the system to Mantle Sepolia and validate live behavior.

Tasks:

- write deploy scripts
- deploy contract suite to Mantle Sepolia
- configure approved routers and operators
- verify contract addresses and events
- test proposal and execution flow against Sepolia

Deliverables:

- Sepolia deployment record
- verified deployment scripts
- environment-specific configuration output

Acceptance:

- contracts deploy without manual patching
- router whitelist is configured
- backend can target the deployed addresses
- execution path works end-to-end on Sepolia

### Phase 6: Mainnet Readiness

Goal:
Prepare the contract service for guarded mainnet usage without rushing live capital execution.

Tasks:

- review all mainnet constants
- confirm final token and router allowlist
- enforce operator-only mainnet execution at first
- document emergency runbook
- add verification and post-deploy checklist

Deliverables:

- mainnet deployment checklist
- emergency operations guide
- final review of assumptions and unresolved risks

Acceptance:

- all mainnet addresses are verified
- any unresolved oracle or asset uncertainty is documented
- go-live requires explicit team approval

## Suggested Interface Between Backend and Contracts

The backend should send approved trade intent, not free-form strategy decisions.

Minimum execution payload:

- proposal id
- plan hash
- router address
- calldata
- token in
- token out
- amount in
- `minAmountOut`
- deadline

The contract should validate:

- proposal is active
- router is whitelisted
- caller has execution role
- contract is not paused
- proposal hash matches approved intent

## Testing Matrix

Must-pass unit tests:

- role restrictions
- pause behavior
- whitelist updates
- proposal creation
- proposal expiry
- approval and rejection behavior
- `minAmountOut` enforcement
- invalid router rejection

Must-pass integration tests:

- create proposal -> approve -> execute
- create proposal -> pause -> revert execute
- create proposal -> expire -> revert execute
- attempt modified calldata -> revert execute

## Expected Outputs for Other Teams

The smart contract owner must provide:

- deployed addresses by environment
- ABI exports for frontend and backend
- event schema reference
- example proposal payload
- execution error catalog

## Definition of Done

The smart contract service is complete for MVP when:

- the contract suite deploys on Mantle Sepolia
- proposal approval and execution work end-to-end
- pause and whitelist controls are live
- ABI and addresses are shared with other services
- critical tests pass locally and in CI
- events are clean enough for UI and analytics consumption
