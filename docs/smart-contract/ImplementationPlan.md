# Smart Contract Service Implementation Plan

## Service Mission

The smart contract service is responsible for safe on-chain execution. It should be minimal, auditable, and opinionated about controls.

Its job is not to decide strategy. Its job is to:

- receive approved trade intent
- validate permissions and constraints
- execute only approved router functions
- pause fast when conditions are unsafe
- support emergency recovery when explicitly authorized
- emit clean events for the website and analytics layers

## Owned Deliverables

- `ExecutorVault`
- `TradeApprovalManager`
- `PauseGuardian`
- optional `AgentIdentity`
- protocol interfaces for AGNI, Merchant Moe, ERC-20, and Pyth-facing checks where needed
- execution payload schema and hashing utilities
- emergency pause and withdrawal controls
- deployment scripts
- unit and integration tests for contract behavior

## Contract Design Principles

- keep contracts small
- prefer explicit role-based controls
- whitelist routers and allowed selectors
- verify exact execution intent using a normalized payload hash
- enforce deadline, recipient, spend cap, and `minAmountOut`
- verify realised output using vault balance deltas instead of trusting router return values
- keep route discovery, quoting, and oracle freshness off-chain
- log every sensitive action
- separate emergency pause and recovery from normal governance operations
- do not expose a generic arbitrary-call path from the vault

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
|   |   |-- IMerchantMoeAggregatorRouter.sol
|   |   `-- IPyth.sol
|   |-- libraries/
|   |   |-- Errors.sol
|   |   |-- Events.sol
|   |   |-- Roles.sol
|   |   |-- ExecutionTypes.sol
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

## Design Constraints To Lock Before Coding

- `ExecutorVault` should be a bounded swap executor, not a generic router forwarder.
- The approval record should bind the exact execution payload the vault is allowed to run.
- If raw router calldata is passed to the vault, only selectors whose recipient and amount semantics can be validated should be supported. Everything else should revert.
- Output protection should be enforced with token balance delta checks, not only with router return values.
- Emergency withdrawal should exist only for authorized operators and should emit explicit recovery events.
- Sepolia flows must use verified testnet assets or mocks. Do not assume Mantle mainnet asset parity on testnet.

## Phase-Wise Implementation

### Phase 0: Bootstrap and Standards

Goal:
Create the base contract workspace and standards before writing business logic.

Tasks:

- initialize Foundry workspace
- install OpenZeppelin and `forge-std`
- add `.env.example`
- define role names, event naming, and error conventions
- define the `ExecutionPayload` struct and proposal status enum
- add interface stubs for AGNI, Merchant Moe, and Pyth

Deliverables:

- workspace builds
- dependency installation is documented
- code style and naming conventions are locked
- execution payload schema is defined before executor code exists

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
- build selector allowlist logic for each approved router
- build role model for admin, executor, guardian, approver, and recovery operator if separated
- define emergency withdrawal and asset rescue policy
- define proposal hash format and event schema

Deliverables:

- emergency pause path and recovery policy
- role-controlled configuration
- reusable proposal hash utility
- router and selector guard configuration

Acceptance:

- unauthorized calls revert
- pause blocks protected functions
- whitelist updates emit events
- unsupported selectors revert even on whitelisted routers

### Phase 2: Approval Lifecycle

Goal:
Create a proposal and approval system that ensures only reviewed trade plans can execute.

Tasks:

- build `TradeApprovalManager`
- store proposal id, plan hash, calldata hash, expiry, and status
- bind each proposal to router, selector, token pair, recipient, max amount in, `minAmountOut`, native value, and deadline
- support approval and rejection flow
- prevent execution of modified, replayed, or expired plans

Deliverables:

- proposal registry
- approval state machine
- rejection handling
- one-time execution tracking

Acceptance:

- expired proposals cannot execute
- modified calldata cannot execute
- executed proposals cannot be replayed
- approval status is queryable for UI and backend

### Phase 3: Executor Implementation

Goal:
Enable guarded router execution for approved trades.

Tasks:

- build `ExecutorVault`
- support ERC-20 approvals with safe reset pattern
- enforce router whitelist and allowed selector checks
- enforce approved recipient semantics and spend limits
- enforce deadline and `minAmountOut`
- validate output using pre/post token balance deltas
- implement emergency withdrawal path with strict role checks and event logging
- emit execution events

Deliverables:

- core execution contract
- guarded swap flow for approved routers
- event output for analytics and frontend
- emergency token recovery path
- no unrestricted external-call path

Acceptance:

- unapproved router calls revert
- disallowed selectors or recipient mismatch revert
- paused contract cannot execute
- slippage-protected execution succeeds in positive test cases
- output balance delta below `minAmountOut` reverts
- unauthorized emergency withdrawals revert
- execution emits structured logs

### Phase 4: Integration and Mocks

Goal:
Test realistic flows without relying on unstable live routing during early development.

Tasks:

- build mock tokens, router, and Pyth contracts
- write unit tests for all core branches
- write integration tests for proposal -> approval -> execute flow
- simulate pause, expiry, replay, invalid execution attempts, and emergency recovery

Deliverables:

- deterministic tests
- local integration flows
- reusable mock setup utilities

Acceptance:

- all critical paths have test coverage
- failure cases are explicit and tested
- mock execution proves event shape and sequencing
- malicious or malformed router calldata is rejected

### Phase 5: Sepolia Deployment

Goal:
Deploy the system to Mantle Sepolia and validate live behavior.

Tasks:

- write deploy scripts
- deploy contract suite to Mantle Sepolia
- configure approved routers and operators
- verify contract addresses and events
- test proposal and execution flow against Sepolia using only verified testnet assets or local mocks

Deliverables:

- Sepolia deployment record
- verified deployment scripts
- environment-specific configuration output

Acceptance:

- contracts deploy without manual patching
- router whitelist is configured
- backend can target the deployed addresses
- execution path works end-to-end on Sepolia
- the flow does not depend on unverified USDY or stablecoin testnet addresses

### Phase 6: Mainnet Readiness

Goal:
Prepare the contract service for guarded mainnet usage without rushing live capital execution.

Tasks:

- review all mainnet constants
- confirm final token and router allowlist
- enforce operator-only mainnet execution at first
- document emergency runbook
- add verification and post-deploy checklist
- transfer privileged ownership to the intended admin or multisig before live capital use

Deliverables:

- mainnet deployment checklist
- emergency operations guide
- final review of assumptions and unresolved risks

Acceptance:

- all mainnet addresses are verified
- any unresolved oracle or asset uncertainty is documented
- go-live requires explicit team approval

## MVP Scope Boundaries

The contract lane should explicitly avoid the following in the first implementation:

- no on-chain route discovery
- no assumption that Sepolia mirrors Mantle mainnet asset availability
- no generic multicall executor
- no hidden policy logic that duplicates the backend risk engine
- no upgradeability unless the team decides it is required before deployment

## Suggested Interface Between Backend and Contracts

The backend should send a normalized execution payload, not free-form strategy decisions.

Minimum execution payload:

- proposal id
- plan hash
- router address
- function selector
- calldata hash
- token in
- token out
- recipient
- max amount in
- `minAmountOut`
- native value
- deadline
- proposal expiry
- nonce or one-time proposal id

The contract should validate:

- proposal is active
- proposal has not already executed
- router is whitelisted
- selector is allowed for that router
- caller has execution role
- contract is not paused
- current time is within proposal expiry and execution deadline
- approved recipient semantics are preserved
- input spend does not exceed approved amount
- observed output balance delta meets `minAmountOut`
- `msg.value` matches the approved native value when applicable
- proposal hash and calldata hash match approved intent

If raw router calldata is passed to the executor, the contract should only support selectors whose semantics it can validate. Everything else should revert.

## Testing Matrix

Must-pass unit tests:

- role restrictions
- pause behavior
- whitelist updates
- selector allowlist enforcement
- emergency withdrawal role restriction
- proposal creation
- proposal expiry
- approval and rejection behavior
- replay protection
- `minAmountOut` enforcement
- invalid router rejection

Must-pass integration tests:

- create proposal -> approve -> execute
- create proposal -> pause -> revert execute
- create proposal -> expire -> revert execute
- attempt modified calldata -> revert execute
- attempt recipient mismatch -> revert execute
- attempt reused proposal -> revert execute
- perform emergency recovery -> emit expected events

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
- pause, whitelist, and emergency recovery controls are live
- ABI and addresses are shared with other services
- critical tests pass locally and in CI
- events are clean enough for UI and analytics consumption
- the executor is not able to perform arbitrary external calls outside the approved router surface
