# Emergency Runbook

## Trigger Conditions

Use emergency controls immediately when any of the following occurs:

1. Unexpected vault asset movement.
2. Execution against non-approved router/selector observed.
3. Proposal lifecycle mismatch or replay indicators.
4. Upstream routing/oracle anomalies requiring execution halt.

## Immediate Response

1. Guardian sets pause:
   - call `PauseGuardian.setPaused(true)`
2. Stop proposal execution operations.
3. Notify all operators and incident channel.

## Containment

1. Verify no additional executions can pass route enforcement.
2. Confirm current vault token/native balances.
3. Confirm proposal states for latest approvals.

## Recovery Operations

Only authorized recovery operator executes:

1. `ExecutorVault.emergencyWithdrawToken(token, to, amount)`
2. `ExecutorVault.emergencyWithdrawNative(to, amount)`

Each action must capture:

- tx hash (`TODO_VERIFY`)
- timestamp (`TODO_VERIFY`)
- actor (`TODO_VERIFY`)
- assets recovered (`TODO_VERIFY`)

## Resume Criteria

System may resume only when:

1. Root cause is identified.
2. Misconfiguration or exploit path is closed.
3. Router/selector and roles are re-verified.
4. Team approves unpause.

## Post-Incident Checklist

1. Export contract events for timeline reconstruction.
2. Update `docs/smart-contract/Changes.md` with incident summary.
3. Update operator controls/runbooks if gaps found.
