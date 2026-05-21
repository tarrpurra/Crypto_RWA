# Mantle Sepolia Contract Reference

## Status

This document is the single working reference for the AIxRWA smart-contract MVP on Mantle Sepolia as of 2026-05-21.

Current state:

- core contract suite is deployed
- AGNI Sepolia routing is configured for on-chain MVP execution
- a deterministic AGNI mock-token pool exists for validation
- one real proposal lifecycle has completed successfully on-chain
- `forge build` is lint-clean
- `forge test` passes with 32 tests passed, 0 failed, 0 skipped

## MVP Scope

On-chain execution in MVP:

- AGNI `exactInputSingle`
- AGNI `exactInput`

Off-chain only in MVP:

- AGNI quote and pool discovery
- Merchant Moe research if needed

Out of Sepolia MVP execution:

- Merchant Moe classic Sepolia execution until a verified Sepolia router exists
- Merchant Moe LB router execution
- Merchant Moe aggregator router execution
- mainnet live-capital readiness and ownership decisions

## Deployed Core Contracts

| Contract | Address | Purpose |
| --- | --- | --- |
| `PauseGuardian` | `0xfCe1098399186330acEd9c931D3304c8aC07ed86` | Global pause switch plus router and selector allowlist enforcement. This is the route-control boundary. |
| `TradeApprovalManager` | `0x1CDDD643D1b87841DF46A9A92e060c36c08Eadde` | Stores proposal hash, expiry, and status. Handles create, approve, reject, expire, and mark-executed transitions. |
| `ExecutorVault` | `0xBe99435D6067fBbeB97b9d0F16A02568Ddb1b521` | Holds assets, validates router calldata against the approved payload, executes the swap, and emits execution events. |

## Role Accounts

All Sepolia roles are currently assigned to the same test wallet:

- `ADMIN_ADDRESS`: `0x8ecc35264986c08E5C7594F27140f359A53768DD`
- `GUARDIAN_ADDRESS`: `0x8ecc35264986c08E5C7594F27140f359A53768DD`
- `APPROVER_ADDRESS`: `0x8ecc35264986c08E5C7594F27140f359A53768DD`
- `EXECUTOR_ADDRESS`: `0x8ecc35264986c08E5C7594F27140f359A53768DD`
- `RECOVERY_ADDRESS`: `0x8ecc35264986c08E5C7594F27140f359A53768DD`

Sepolia-only note:

- this is acceptable for testnet MVP validation
- this must not be the final mainnet role layout

## AGNI Contracts Used By AIxRWA

Runtime dependencies used by AIxRWA:

| Contract | Address | Use |
| --- | --- | --- |
| `SwapRouter` | `0xe38cfa32cCd918d94E2e20230dFaD1A4Fd8aEF16` | Executes whitelisted swaps from `ExecutorVault`. |
| `QuoterV2` | `0x9Da17239a4170f50A5A2c11813BD0C601b5c9693` | Off-chain quote and slippage simulation. |
| `AgniFactory` | `0xA9AcD50B042A72c33d05fDcC8ad209d3aD361762` | Pool discovery and route verification. |
| `WMNT` | `0x67A1f4A939b477A6b7c5BF94D97E45dE87E608eF` | Wrapped Mantle routing asset. |

Setup-only helper used to create the Sepolia mock pool:

| Contract | Address | Use |
| --- | --- | --- |
| `NonfungiblePositionManager` | `0x71959543c31EC4d68D9D6C492Bf69A1C174bb394` | Created and funded the deterministic AGNI validation pool. Not an AIxRWA runtime dependency. |

## ABI Package

Frontend and backend ABI handoff bundle:

- folder: `contracts/out/abis/`
- manifest: `contracts/out/abis/manifest.json`

Exported ABIs:

- `PauseGuardian.json`
- `TradeApprovalManager.json`
- `ExecutorVault.json`
- `IAgniSwapRouter.json`
- `IAgniFactory.json`
- `IERC20.json`
- `ExecutionTypes.json`
- `Events.json`
- `Errors.json`

Note:

- `IAgniQuoterV2` is not part of the exported ABI bundle because the local interface is still an empty placeholder rather than a modeled quoting ABI.

## Route Allowlist State

Whitelisted router:

| Router | Address | Allowed Selectors |
| --- | --- | --- |
| `AGNI SwapRouter` | `0xe38cfa32cCd918d94E2e20230dFaD1A4Fd8aEF16` | `0x414bf389` (`exactInputSingle`), `0xc04b8d59` (`exactInput`) |

Explicitly unsupported in Sepolia MVP execution:

| Router | Address | State |
| --- | --- | --- |
| `Merchant Moe Classic Router` | `TODO_VERIFY` | not configured on Sepolia |
| `Merchant Moe LB Router` | `0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a` | fail-closed |
| `Merchant Moe Aggregator Router` | `0x45A62B090DF48243F12A21897e7ed91863E2c86b` | fail-closed |

## What Each Core Contract Does

### `PauseGuardian`

Responsibilities:

- pauses all guarded route execution when needed
- stores `routerWhitelist[router]`
- stores `selectorAllowlist[router][selector]`
- reverts unsupported routers with `RouterNotWhitelisted`
- reverts unsupported selectors with `SelectorNotAllowed`
- keeps Merchant Moe LB and aggregator execution out of scope by default

Why it exists:

- `ExecutorVault` never forwards arbitrary router calldata blindly
- every runtime route must first clear the pause and allowlist gate

### `TradeApprovalManager`

Responsibilities:

- creates a proposal from a normalized `ExecutionPayload`
- hashes and stores the immutable proposal data
- transitions proposal status: `NONE -> PENDING -> APPROVED -> EXECUTED` or `REJECTED` or `EXPIRED`
- verifies the executor is marking the same approved payload as executed

Why it exists:

- proposal approval is separated from swap execution
- replay and payload mutation are blocked by proposal-hash validation

### `ExecutorVault`

Responsibilities:

- holds input assets before execution
- validates the execution request against:
  - router allowlist
  - selector allowlist
  - payload recipient
  - deadline
  - native value
  - max spend cap
  - calldata hash
  - selector-specific router semantics
- executes the router call only after validation passes
- marks the proposal executed in `TradeApprovalManager`
- emits the final `TradeExecuted` event
- provides emergency token and native withdrawals for the recovery role

Why it exists:

- execution is guarded, bounded, and auditable
- router calldata is accepted only where selector semantics are understood by the contract

## Deterministic Sepolia Validation Assets

Mock tokens deployed for validation:

| Asset | Address | Notes |
| --- | --- | --- |
| `MockTokenA` | `0x541e1E39F3b818eF01f2ce1C05Ed3B9950FC3f0F` | Used as `tokenIn` in the executed Sepolia validation swap. |
| `MockTokenB` | `0x87E57BD20E11569A5356Ba88E0193Cf57836Ceeb` | Used as `tokenOut` in the executed Sepolia validation swap. |

Live AGNI validation pool:

| Pool | Address | Fee Tier | Token0 | Token1 |
| --- | --- | --- | --- | --- |
| AGNI mock pool | `0x2053375e6B61dB84172E4ddb98093244057a84ce` | `500` | `0x541e1E39F3b818eF01f2ce1C05Ed3B9950FC3f0F` | `0x87E57BD20E11569A5356Ba88E0193Cf57836Ceeb` |

## Sepolia Transaction Record

### Core Deployment

| Action | Tx Hash |
| --- | --- |
| Deploy `PauseGuardian` | `0x027b45be73c9919815e805d842f8f08f907232a6adf3cfbbef0b29af76970580` |
| Deploy `TradeApprovalManager` | `0x5b0f40515f598171b412bf5fcfa1448c0d474ef21d9a6267e5f75aaeebf652f3` |
| Deploy `ExecutorVault` | `0x282919925b3b3e4265e92e140c0ea22e9b9912eaaf28a9692f3c91b53a85c1de` |
| Grant `EXECUTOR_ROLE` to `ExecutorVault` in `TradeApprovalManager` | `0x74c7526d6ade222d55576541ce0f74a59d2be5397215e0eb8bedfd19fef95888` |

### Router Configuration

| Action | Tx Hash |
| --- | --- |
| Allowlist AGNI router | `0xbd61345944c16dc505182acd07a0ccc647b73b89b29a0550300976fac4c45f62` |
| Allow selector `0x414bf389` (`exactInputSingle`) | `0xe26c9652b7c9ddf33f9e698895736c6e1d5d3d73ac6db40769db5c87b2e6671b` |
| Allowlist AGNI router again during second config run | `0x10f36b635bfc4bdd2ddd55c7230de8a8ea880d55613801388ee21654853b53e7` |
| Allow selector `0xc04b8d59` (`exactInput`) | `0xc4a6ffcb3e9b69f0846ea1b1360012cc404c25be4e80a21c29d87efcc1165769` |

### Mock Pool Bootstrap

| Action | Tx Hash |
| --- | --- |
| Approve `MockTokenA` to position manager | `0x785311c00dd3a01a1a1b3c129185f0b0bd0143154bc2e1ab945407795b2832b7` |
| Approve `MockTokenB` to position manager | `0x15703a873bde9a063a0210dd62ef6f4f15406b86aa576e258529618ac429aed2` |
| Create and initialize AGNI pool | `0xaef611f656ff968c1ca75c30c42a6604d9957f7f24c3787b19995387a94c9139` |
| Mint AGNI liquidity position | `0x0374bd896df106fe6f3afc9dfdc5573834cc1100d47ed8d3626bda5af0ad5203` |

### Vault Funding

| Action | Tx Hash |
| --- | --- |
| Transfer `1.0` `MockTokenA` into `ExecutorVault` | `0x518522f2d3f1c1d6f680b801a35dcfaa2a705d503eb59f1b37c294d0d96881f4` |

### Real Proposal Lifecycle

| Action | Tx Hash |
| --- | --- |
| `createProposal` | `0x41c17f7de3269e996bf75263f04c2f51ce8298357147ea8300362546510b0a30` |
| `approveProposal` | `0xb514967f9c3ad9102d3648dac294c4fd08572bf1f8cb01e20067404da9e8a6fe` |
| `executeApprovedTrade` | `0x9dfbce267592e91c2bbd920535fad103a74653eff37e3d1c56fcaf90fe5c867c` |

## Recorded Successful Execution

Executed payload summary:

- `proposalId`: `0xf223e0c23a9549e9729ed45e2d506747698cb6555116dff875d9a63db9599f51`
- `proposalHash`: `0xf29e7656d15140df4f7d9ec773f94fdf4c4046cf3758f9ca6530cf38b4637e5b`
- `router`: `0xe38cfa32cCd918d94E2e20230dFaD1A4Fd8aEF16`
- `tokenIn`: `0x541e1E39F3b818eF01f2ce1C05Ed3B9950FC3f0F`
- `tokenOut`: `0x87E57BD20E11569A5356Ba88E0193Cf57836Ceeb`
- `selector`: `0x414bf389`
- `fee`: `500`
- `amountIn`: `1000000000000000000`
- `minAmountOut`: `1`
- `vault tokenIn before`: `1000000000000000000`
- `vault tokenIn after`: `0`
- `vault tokenOut before`: `0`
- `vault tokenOut after`: `998501997253744881`
- `realized amount out`: `998501997253744881`
- final proposal status: `4` = `EXECUTED`

## Example Normalized Proposal Payload

This is the exact successful Sepolia `ExecutionPayload` used for `createProposal` and `executeApprovedTrade`.

```json
{
  "proposalId": "0xf223e0c23a9549e9729ed45e2d506747698cb6555116dff875d9a63db9599f51",
  "planHash": "0x3da7ce1edb39d78aa364bfef8582908de5cfdcb7f91ed20f2e6ad7adf342eb9c",
  "router": "0xe38cfa32cCd918d94E2e20230dFaD1A4Fd8aEF16",
  "selector": "0x414bf389",
  "calldataHash": "0xf1a3190c37f36132239910e53a66811188799e06e70a9af35503d78eff58e7bd",
  "tokenIn": "0x541e1E39F3b818eF01f2ce1C05Ed3B9950FC3f0F",
  "tokenOut": "0x87E57BD20E11569A5356Ba88E0193Cf57836Ceeb",
  "recipient": "0xBe99435D6067fBbeB97b9d0F16A02568Ddb1b521",
  "maxAmountIn": "1000000000000000000",
  "minAmountOut": "1",
  "nativeValue": "0",
  "deadline": "1779309931",
  "proposalExpiry": "1779313531",
  "nonce": "1"
}
```

## Event Schema

### Governance and Access Events

| Event | Meaning |
| --- | --- |
| `RoleGranted(bytes32 role, address account, address actor)` | Privileged role added. |
| `RoleRevoked(bytes32 role, address account, address actor)` | Privileged role removed. |
| `PauseStateSet(bool paused, address actor)` | Global pause state changed. |
| `RouterWhitelistSet(address router, bool allowed, address actor)` | Router allowlist changed. |
| `RouterSelectorSet(address router, bytes4 selector, bool allowed, address actor)` | Selector allowlist changed. |

### Proposal Lifecycle Events

| Event | Meaning |
| --- | --- |
| `ProposalCreated(bytes32 proposalId, bytes32 proposalHash, uint256 expiry, address actor)` | New proposal recorded. |
| `ProposalApproved(bytes32 proposalId, address actor)` | Proposal approved for execution. |
| `ProposalRejected(bytes32 proposalId, address actor)` | Proposal rejected. |
| `ProposalMarkedExecuted(bytes32 proposalId, address actor)` | Approved proposal marked executed by the executor. |
| `ProposalMarkedExpired(bytes32 proposalId, address actor)` | Proposal marked expired after deadline. |

### Execution and Recovery Events

| Event | Meaning |
| --- | --- |
| `TradeExecuted(bytes32 proposalId, address router, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 realizedAmountOut, address recipient, address actor)` | Final guarded swap execution record. |
| `EmergencyWithdrawal(address token, address to, uint256 amount, address actor)` | Recovery withdrawal of ERC-20 or native asset. |

## Error Catalog

### Access and Admin Errors

| Error | Meaning |
| --- | --- |
| `Unauthorized()` | Caller lacks the required role. |
| `ZeroAddress()` | Required address input was zero. |
| `Paused()` | Global pause is active. |

### Route Control Errors

| Error | Meaning |
| --- | --- |
| `RouterNotWhitelisted(address router)` | Router is not approved for execution. |
| `SelectorNotAllowed(address router, bytes4 selector)` | Selector is not approved for that router. |
| `UnsupportedSelector(bytes4 selector)` | Selector is outside the executor’s implemented validation set. |
| `InvalidCalldata()` | Calldata is too short or malformed. |
| `InvalidCalldataSelector(bytes4 expected, bytes4 actual)` | Payload selector and calldata selector do not match. |
| `InvalidPath()` | Encoded route path is malformed or too short. |

### Proposal Lifecycle Errors

| Error | Meaning |
| --- | --- |
| `ProposalAlreadyExists(bytes32 proposalId)` | Proposal ID is already in use. |
| `ProposalNotPending(bytes32 proposalId)` | Proposal is not in `PENDING` status. |
| `ProposalNotLive(bytes32 proposalId, uint8 status)` | Proposal is not in a live state for the attempted action. |
| `ProposalNotApproved(bytes32 proposalId)` | Proposal has not been approved or is no longer live. |
| `ProposalAlreadyExecuted(bytes32 proposalId)` | Proposal execution was already recorded. |
| `ProposalExpired(bytes32 proposalId)` | Proposal or deadline is already expired. |
| `ProposalNotExpired(bytes32 proposalId, uint256 expiry)` | Attempted expiry action before the expiry time. |
| `ProposalHashMismatch(bytes32 proposalId)` | The supplied payload or calldata does not match the approved proposal. |

### Execution Constraint Errors

| Error | Meaning |
| --- | --- |
| `InvalidDeadline(uint256 deadline)` | Payload deadline is already in the past. |
| `DeadlineMismatch(uint256 expected, uint256 actual)` | Calldata deadline does not match payload deadline. |
| `RecipientMismatch(address expected, address actual)` | Calldata recipient does not match the approved vault recipient. |
| `TokenInMismatch(address expected, address actual)` | Calldata input token does not match payload. |
| `TokenOutMismatch(address expected, address actual)` | Calldata output token does not match payload. |
| `CalldataSenderMismatch(address expected, address actual)` | Mock route sender mismatch. |
| `AmountInMismatch(uint256 expected, uint256 actual)` | Calldata input amount does not match execution request. |
| `MinAmountOutMismatch(uint256 expected, uint256 actual)` | Calldata minimum output does not match payload. |
| `NativeValueMismatch(uint256 expected, uint256 actual)` | Sent native value does not match payload. |
| `SpendCapExceeded(uint256 approvedMaxAmountIn, uint256 actualAmountIn)` | Requested spend exceeds payload cap. |
| `InsufficientOutput(uint256 minAmountOut, uint256 actualAmountOut)` | Realized output is below the approved minimum. |
| `TokenApproveFailed(address token, address spender)` | ERC-20 approval failed. |
| `ExternalCallFailed()` | Router or recovery external call failed. |

## Completion State

For contract MVP development, the Sepolia execution lane is complete:

- deployed
- allowlisted
- phase-gated
- pool-backed
- executed successfully on-chain
- lint-clean
- test suite passing

Still outside this document and still pending later:

- Merchant Moe classic Sepolia verification if that router is later brought into scope
- final mainnet readiness review
- mainnet ownership and multisig decisions
- operator-only launch and emergency runbook sign-off




