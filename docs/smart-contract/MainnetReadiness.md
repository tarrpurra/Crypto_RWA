# Smart Contract Mainnet Readiness (Phase 6)

## Scope

This document defines go-live readiness controls for guarded mainnet usage.

## Operator-Only Launch Policy

1. Initial execution must be restricted to a single verified `EXECUTOR_ADDRESS` (`TODO_VERIFY`).
2. `ADMIN_ADDRESS` should be a multisig (`TODO_VERIFY`) before live capital execution.
3. `RECOVERY_ADDRESS` should be a separate operator or multisig (`TODO_VERIFY`).
4. No additional executors should be granted until first production observation window is complete.

## Verified Constants Checklist

All values below must be verified before go-live. Do not deploy with placeholders.

- `CHAIN_ID_MAINNET`: `TODO_VERIFY`
- `RPC_URL_MAINNET`: `TODO_VERIFY`
- `PAUSE_GUARDIAN_ADDRESS`: `TODO_VERIFY`
- `TRADE_APPROVAL_MANAGER_ADDRESS`: `TODO_VERIFY`
- `EXECUTOR_VAULT_ADDRESS`: `TODO_VERIFY`
- Approved routers list: `TODO_VERIFY`
- Allowed selectors per router: `TODO_VERIFY`
- Approved token allowlist policy: `TODO_VERIFY`
- Pyth contract/feed IDs used off-chain: `TODO_VERIFY`

## Governance and Ownership Transfer

Before live capital execution:

1. Transfer `DEFAULT_ADMIN_ROLE` responsibilities to intended multisig/governance (`TODO_VERIFY`).
2. Validate guardian pause authority is held by approved operator set only.
3. Validate recovery authority is held by approved operator set only.

## Go/No-Go Gate

Mainnet go-live requires all conditions:

1. Phase gate script passes with production values.
2. Router + selector config is on-chain and verified.
3. Executor role grant to vault is verified on-chain.
4. Emergency pause and emergency withdrawal dry-runs are executed in controlled environment.
5. Team explicitly approves go-live.
