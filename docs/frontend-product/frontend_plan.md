# AIxRWA Frontend Demo Product Plan

## Purpose

This plan turns the current AIxRWA frontend into a demo-ready product surface for Mantle Sepolia. The app already has most of the necessary endpoint wiring, but the UI is cluttered and the current "full access AI" auto-approval path conflicts with the core product rule that no swap or execution-facing action happens without explicit user approval.

The frontend should feel like a capital operations terminal: calm, exacting, and clear about what is live, simulated, blocked, or ready for user action.

## Current State

The active frontend is the Vite React app under `frontend/`, not the older planned Next.js `/apps/web` structure.

Implemented or partially implemented:

- React routes for landing, dashboard, risk, allocation, trade, approvals, strategy lab, settings, and demo pages.
- Wallet support through Wagmi, RainbowKit, and Viem.
- Wallet-scoped hooks for portfolio, risk, allocation, decisions, reports, and proposal activity.
- Typed API modules for system, portfolio, risk, allocation, market, decisions, and reports.
- Proposal flow support through `/proposals/create`, `/proposals`, `/proposals/{id}`, `/approve`, `/reject`, and `/execute`.
- Trade page surfaces investment plan details, allocation targets, guard checks, blockers, transaction steps, linked proposals, and local proposal activity.
- Settings page exposes backend health, chain status, configured contracts, readiness, and report download.

Main issues:

- The UI has too many equally weighted bordered panels and repeated metric cards.
- Dashboard, Trade, Approvals, Settings, and the AI side panel repeat overlapping controls.
- AI prompt/debug output and pipeline internals are exposed in judge-facing UI.
- Proposal methods are grouped under `marketApi`, even though proposal lifecycle is not market data.
- "Full access AI" auto-opens Trade, auto-creates plans, auto-approves proposals, and auto-executes, which violates the main product plan.
- Wallet transaction submission currently returns a local tx hash, but the backend does not visibly persist that tx hash into proposal execution history.

## Product Invariants

These rules must hold across the frontend:

- AI can recommend, but deterministic risk and policy controls gate execution-facing actions.
- No auto-swapping.
- No auto-approval.
- No hidden execution.
- User approval is required before any proposal can become execution-ready.
- Wallet signature is required before any on-chain transaction is submitted.
- Wrong-chain or disconnected-wallet states block execution-facing controls.
- Degraded data remains visible and actionable, not hidden behind fake success.

## Demo Flow

The primary demo path should be linear and obvious:

1. User connects a Mantle Sepolia wallet.
2. Dashboard shows portfolio state, risk band, market freshness, and one recommended next action.
3. User opens Trade.
4. User chooses deposit asset, amount, risk profile, and allocation mode.
5. Frontend calls `POST /proposals/create`.
6. Trade shows proposal status, target allocation, guard checks, blockers, transaction steps, and linked proposals.
7. If guards pass, user explicitly approves the investment plan.
8. After approval, user prepares the wallet transaction from the proposal execution payload.
9. User signs in the wallet.
10. UI shows the tx hash, updated proposal activity, and report/export option.

## Endpoint Integration

### Existing Endpoints To Keep

System:

- `GET /health`
- `GET /status`
- `GET /system/readiness`
- `GET /chain/status`
- `GET /settings`
- `PUT /settings`

Portfolio:

- `GET /portfolio/current`
- `GET /portfolio/snapshots`
- `GET /portfolio/snapshots/latest`

Risk:

- `GET /risk/current`
- `GET /risk/assessments`
- `GET /risk/assessments/latest`

Allocation:

- `GET /allocation/recommendation`
- `POST /allocation/profile`

Decisions:

- `GET /decisions`

Market:

- `GET /market/ingestion/status`
- `GET /market/prices/latest`
- `GET /market/prices/{asset_symbol}`
- `GET /market/oracles/usdy`
- `GET /market/routes`
- `GET /market/quotes/latest`
- `GET /market/quotes/{token_in}/{token_out}`
- `GET /market/quotes/{token_in}/{token_out}/best`

Proposals:

- `POST /proposals/create`
- `GET /proposals`
- `GET /proposals/{proposal_id}`
- `POST /proposals/{proposal_id}/approve`
- `POST /proposals/{proposal_id}/reject`
- `POST /proposals/{proposal_id}/execute`

Reports:

- `GET /reports/latest`

### Needed Endpoint

Add one backend endpoint if execution persistence is in scope:

```text
POST /proposals/{proposal_id}/execution-result
```

Suggested request:

```json
{
  "tx_hash": "0x...",
  "status_code": "EXECUTION_SUBMITTED",
  "chain_id": 5003,
  "failure_reason": null
}
```

Purpose:

- Persist wallet-submitted tx hashes.
- Update proposal status after user submission.
- Let Approvals, Settings reports, and later sessions show execution history without relying only on localStorage.

If backend changes are deferred, keep transaction hashes in local proposal activity and label them as "local session activity."

## Architecture Changes

### API Modules

Create:

```text
frontend/src/lib/api/proposals.ts
```

Move these methods out of `marketApi`:

- `createProposal`
- `getProposalDetail`
- `approveProposal`
- `rejectProposal`
- `getProposals`
- `executeProposal`

Keep `marketApi` limited to prices, routes, quotes, oracle status, and ingestion state.

### Hooks

Rename or split `useSwap.ts` into proposal-focused hooks:

```text
frontend/src/hooks/useProposals.ts
```

Recommended hooks:

- `useProposals(status?)`
- `useCreateProposal()`
- `useProposalDetail(id)`
- `useApproveProposal()`
- `useRejectProposal()`
- `usePrepareProposalExecution()`
- `useSubmitProposalExecutionResult()` if the backend endpoint is added
- `useWrapMnt()` can remain separate because it is wallet/native-token specific

### Query Invalidation

After proposal creation, approval, rejection, execution preparation, or execution result persistence, invalidate:

- `["proposals"]`
- `["portfolio"]`
- `["risk"]`
- `["allocation"]`
- `["reports", "investment"]`
- `["system", "readiness"]`

## Remove Unsafe Automation

Remove or hard-disable these behaviors:

- Dashboard auto-opening Trade when AI mode is enabled.
- Trade auto-creating a plan from URL params.
- Trade auto-approving linked proposals.
- Trade auto-submitting proposal execution.
- Approvals hiding manual actions because "full access AI" is handling them.
- Backend-generated transaction step labels that imply AI-managed execution.

Replace "Full access AI" language with:

- "Recommendation only"
- "Operator approval required"
- "Ready for wallet signature"
- "Blocked by guard checks"
- "Simulation only"

## Screen Plan

### Dashboard

Purpose:

- Fast operating summary and demo entry point.

Show:

- Wallet scope.
- Runtime mode.
- Portfolio value.
- Risk band.
- Market freshness.
- Latest recommendation.
- One primary CTA: `Review investment plan` or `Open trade flow`.

Remove:

- AI access toggle.
- Auto-execution copy.
- Exposed AI debug/pipeline content.
- Duplicate controls already handled by Trade or Settings.

### Trade

Purpose:

- Primary guided demo workflow.

Recommended section order:

1. Wallet and network guard.
2. Investment configuration.
3. Guard result summary.
4. Selected allocation.
5. Transaction sequence.
6. Linked proposal actions.
7. Proposal activity.

Behavior:

- `Create investment plan` calls `/proposals/create`.
- If blocked, blockers appear above allocation details.
- `Approve investment plan` is enabled only when `approval_enabled=true`.
- `Prepare wallet transaction` is enabled only after proposal status is `PROPOSAL_APPROVED`.
- Wallet transaction submission must not be described as complete until the user signs.

### Approvals

Purpose:

- Queue and audit surface, not a second full Trade workflow.

Show:

- Queue count.
- Pending, approved, rejected, submitted, and executed counts.
- Proposal list.
- Proposal review dialog.
- Valid actions based on status.
- Local or persisted tx activity.

Remove:

- AI mode behavior.
- Auto-handling copy.
- Duplicate investment configuration.

### Risk

Purpose:

- Explain why the system permits, limits, or blocks action.

Improve:

- Put hard veto, approval requirement, risk band, and top blockers first.
- Group buckets by severity.
- Use status colors only for actual state.
- Keep raw bucket detail available but secondary.

### Allocation

Purpose:

- Explain target/current allocation and rebalance intent.

Improve:

- Keep profile controls.
- Show advisory status clearly: allocation is not executable until guard checks pass.
- Avoid duplicating proposal approval controls.

### Settings

Purpose:

- Diagnostics and report export.

Keep:

- API base URL.
- Backend health.
- Chain status.
- Configured contracts.
- Readiness.
- Report download.

Remove:

- AI access toggle.
- Full-access execution copy.

### Strategy Lab

Purpose:

- Demo explanation and future simulation surface.

For current demo:

- Keep it read-only.
- Label unavailable simulation features as future work unless backend simulation endpoints are added.

## Visual Cleanup Plan

The current terminal/control-room style is appropriate, but the hierarchy needs to be calmer.

Rules:

- Use fewer top-level metric cards per page.
- Do not show a fixed right-side overlay that covers main content.
- Avoid all-caps labels on every small element.
- Keep one primary action per screen state.
- Use green, amber, and red only for success, warning, and blocked states.
- Prefer progressive disclosure for raw details.
- Hide AI prompt/raw/parsed debug output from normal demo views.
- Keep copy precise and operational.

Recommended visible terms:

- `Recommendation`
- `Risk gate`
- `Guard checks`
- `Approval required`
- `Ready for wallet signature`
- `Execution blocked`
- `Simulation only`
- `Local tx submitted`

Avoid:

- `Full access AI`
- `No manual review required`
- `AI is executing automatically`
- `Autopilot`
- `Pipeline`
- `Brain`
- `Debug`

## Guard And Button Rules

Approval button enabled only when all are true:

- Wallet connected.
- Wallet on Mantle Sepolia.
- Active proposal exists.
- Plan has `approval_enabled=true`.
- No `approval_blockers`.
- Proposal status is `PROPOSAL_PENDING_APPROVAL`.

Execution preparation button enabled only when all are true:

- Wallet connected.
- Wallet on Mantle Sepolia.
- Proposal status is `PROPOSAL_APPROVED`.
- Backend returns execution payload from `/proposals/{id}/execute`.

Execution transaction can be submitted only after:

- Any required token allowance is confirmed.
- User sees router, token in, token out, max amount in, min amount out, deadline, and chain id.

## Demo Acceptance Criteria

A judge should be able to understand the core product in under three minutes:

- Connect wallet on Mantle Sepolia.
- See wallet-scoped portfolio and risk.
- Create an investment plan.
- Understand target allocation.
- See guard checks and blockers.
- Approve only when backend enables approval.
- Prepare/sign wallet transaction only after approval.
- See tx hash or a clear blocked reason.
- Download report from Settings.

Hard acceptance rules:

- No auto-swapping.
- No auto-approval.
- No execution button while blockers exist.
- No fake live data.
- No AI debug or internal prompt visible in the demo path.
- Wrong chain blocks execution-facing actions.

## Implementation Order

1. Remove unsafe full-access AI auto behavior and update copy.
2. Split proposal API methods out of `marketApi`.
3. Refactor Trade into the guided demo workflow.
4. Simplify Dashboard and remove duplicate controls.
5. Simplify or remove the Dashboard AI side panel.
6. Make Approvals a queue and audit surface.
7. Add execution-result persistence if backend changes are allowed.
8. Update frontend tests.
9. Run build, tests, and lint.
10. Update `docs/frontend-product/Changes.md`.

## Test Plan

Frontend tests:

- Dashboard disconnected state.
- Dashboard connected state with recommendation.
- Dashboard does not auto-navigate.
- Trade creates proposal from form values.
- Trade displays guard checks.
- Trade disables approval when blockers exist.
- Trade enables approval only when `approval_enabled=true`.
- Trade enables execution preparation only after approved proposal status.
- Approvals queue shows pending, approved, rejected, and submitted states.
- Settings report download handles missing data gaps.

Backend-adjacent tests if execution-result endpoint is added:

- Execution result persists tx hash.
- Proposal status updates after submitted or confirmed result.
- Report includes execution result.

Commands to run after implementation:

```powershell
cd frontend
npm run test
npm run build
npm run lint
```

Backend targeted commands if backend endpoint changes are made:

```powershell
cd services/agent
python -m pytest tests/unit/test_investment_planner.py
python -m pytest tests/integration/test_portfolio_endpoints.py
```

## Assumptions

- The plan file lives at `docs/frontend-product/frontend_plan.md`.
- The current demo should stay on the existing Vite React app.
- Mantle Sepolia chain id is `5003`.
- The frontend should prioritize safety and clarity over autonomous behavior.
- Existing backend degraded states are intentional and should be surfaced clearly.
