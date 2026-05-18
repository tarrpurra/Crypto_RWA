# Post-Deploy Verification Checklist

## Contract Wiring

1. `PauseGuardian` address deployed and reachable.
2. `TradeApprovalManager` address deployed and reachable.
3. `ExecutorVault` address deployed and reachable.
4. `TradeApprovalManager.hasRole(EXECUTOR_ROLE, EXECUTOR_VAULT_ADDRESS) == true`.

## Guardrails

1. `PauseGuardian.paused() == false` before normal operation.
2. Required routers are whitelisted.
3. Required selectors are allowlisted per router.
4. Unapproved router/selector path is confirmed to revert.

## Roles

1. `ADMIN_ADDRESS` verified (`TODO_VERIFY`).
2. `GUARDIAN_ADDRESS` verified (`TODO_VERIFY`).
3. `APPROVER_ADDRESS` verified (`TODO_VERIFY`).
4. `EXECUTOR_ADDRESS` verified (`TODO_VERIFY`).
5. `RECOVERY_ADDRESS` verified (`TODO_VERIFY`).

## Minimal Live Validation

1. Phase gate script returns PASS.
2. One minimal proposal lifecycle executed (create -> approve -> execute) with bounded capital.
3. Execution event payload checked for expected schema fields.
4. `minAmountOut` protection verified in a controlled slippage case.

## Security

1. Emergency pause transaction path validated.
2. Emergency withdrawal authorization validated.
3. Admin ownership/role transfer to multisig validated before scaling capital.
