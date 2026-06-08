# AI/Data Analytics Repair Plan

## Purpose

This document is the active repair plan for the AI + Data Analytics service. It focuses on fixing the current AI allocation, risk engine, decisioning, proposal, and endpoint flow without replacing the broader roadmap in `ImplementationPlan.md`.

Use this file when implementing the next repair pass. Use `ImplementationPlan.md` for the long-term phased roadmap, `recommendation_model.md` for canonical status and recommendation contracts, and `Changes.md` for completed work records.

## Current Status

The service has working scaffolding and several local-safe features, but the live decision flow is inconsistent across risk, allocation, AI reasoning, and proposals.

### Implemented

- FastAPI app startup is wired through `services/agent/app/main.py`.
- Core routers exist for health, chain, contracts, market, reports, portfolio, risk, allocation, decisions, and settings.
- Market ingestion surfaces exist for prices, USDY oracle status, routes, and quotes.
- Portfolio reads support wallet-scoped `/portfolio/current` and persisted snapshot history.
- Risk has a richer canonical response through `/risk/current`.
- `RiskEngine.evaluate()` now owns the canonical oracle freshness, USDY depeg, liquidity/slippage, concentration, portfolio valuation, ops readiness, and data quality checks.
- `RiskScoreEngine.compute_risk_snapshot()` is now a deprecated compatibility adapter for `/risk/snapshot` instead of a separate risk scoring path.
- Shared decision context includes market price and quote snapshots and passes them into canonical risk evaluation.
- Deprecated `/portfolio/snapshot`, `/risk/snapshot`, and `/allocation/profile` are marked in FastAPI and return deprecation headers.
- Allocation recommendations exist through `/allocation/recommendation`.
- AI reasoning exists through `/decisions`.
- Proposal creation and approval queue routes exist through `/proposals/*`.
- Proposal plan generation now uses execution-oriented status codes for ready, blocked, and skipped states instead of leaking proposal lifecycle codes into execution responses.
- Sepolia-specific USDY, mETH, WMNT, and MNT flow work has started.

### Broken Or Inconsistent

- Some legacy tests still assert the older risk snapshot shape and should be refreshed around the adapter behavior.
- AI decision-maker mode can override the deterministic allocation action in parser logic, which conflicts with the locked rule that AI must explain, not bypass controls.
- Runtime AI state is split between static settings and `runtime_config.AI_DECISION_MAKER_ENABLED`, so endpoints can report and behave differently.
- Legacy `/portfolio/snapshot` and `/risk/snapshot` are deprecated but still force env fallback for temporary compatibility.
- Some integration tests still assert legacy endpoints and stale proposal payload shapes.

## Endpoint Status

### Canonical Endpoints To Keep

System and configuration:

- `GET /health`
- `GET /status`
- `GET /chain/status`
- `GET /system/readiness`
- `GET /settings`
- `PUT /settings`
- `GET /hermes/probe`

Market and oracle:

- `GET /market/ingestion/status`
- `GET /market/prices/latest`
- `GET /market/prices/{asset_symbol}`
- `GET /market/oracles/usdy`
- `GET /market/routes`
- `GET /market/quotes/latest`
- `GET /market/quotes/{token_in}/{token_out}`
- `GET /market/quotes/{token_in}/{token_out}/best`

Portfolio:

- `GET /portfolio/current`
- `GET /portfolio/snapshots`
- `GET /portfolio/snapshots/latest`

Risk, allocation, and AI:

- `GET /risk/current`
- `GET /risk/assessments`
- `GET /risk/assessments/latest`
- `GET /allocation/recommendation`
- `GET /decisions`

Reports and proposals:

- `GET /reports/latest`
- `POST /proposals/create`
- `GET /proposals`
- `GET /proposals/{proposal_id}`
- `POST /proposals/{proposal_id}/approve`
- `POST /proposals/{proposal_id}/reject`
- `POST /proposals/{proposal_id}/execute`

### Deprecated Or Legacy Endpoints

- `GET /portfolio/snapshot`
  - Problem: returns the legacy internal snapshot shape and forces env fallback.
  - Fix: mark as deprecated in FastAPI, return a deprecation header, and keep only as a temporary compatibility adapter.
  - Replacement: `GET /portfolio/current?wallet_address=...`.

- `GET /risk/snapshot`
  - Problem: returns the older `RiskSnapshot` shape and uses the older risk engine path.
  - Fix: mark as deprecated in FastAPI, return a deprecation header, and keep only as a temporary compatibility adapter.
  - Replacement: `GET /risk/current?wallet_address=...`.

- `POST /allocation/profile`
  - Problem: mutates module-level runtime state and is not a stable multi-user or multi-wallet contract.
  - Fix: keep temporarily for local demos, but prefer passing `risk_profile` or `profile_name` into recommendation or proposal requests.
  - Replacement: `GET /allocation/recommendation?wallet_address=...&risk_profile=...` or scoped investment params.

- `frontend/src/lib/api.ts` exchange and challenge routes
  - Problem: routes such as `/exchange/*`, `/challenges/*`, and `/health/workers` are not registered by this AI/Data Analytics backend.
  - Fix: treat this client as external-service or legacy frontend code. Do not include those routes in the AI/Data Analytics API contract unless a matching backend is intentionally added.

## Target Decision Flow

The repaired service should have one deterministic decision flow. Every recommendation, report, and proposal must pass through it.

### Status Code Namespaces

| Layer | Codes |
| --- | --- |
| Allocation | `RISK_NORMAL`, `RISK_CAUTION`, `RISK_REBALANCE_ONLY`, `RISK_REDUCE_ONLY`, `RISK_PAUSE_REQUIRED`, `RISK_VETO` |
| Proposal | `PROPOSAL_DRAFT`, `PROPOSAL_PENDING_APPROVAL`, `PROPOSAL_APPROVED`, `PROPOSAL_REJECTED`, `PROPOSAL_EXPIRED` |
| Execution | `EXECUTION_READY`, `EXECUTION_SUBMITTED`, `EXECUTION_CONFIRMED`, `EXECUTION_FAILED`, `EXECUTION_BLOCKED`, `EXECUTION_SKIPPED`, `EXECUTION_SIMULATED` |

1. Resolve scope.
   - If `wallet_address` is provided, read the connected wallet portfolio.
   - If deposit scope is provided, build an investment-scope preview from `deposit_asset_symbol`, `deposit_amount`, `risk_profile`, and `allocation_mode`.
   - If neither exists, return a degraded response with `DATA_MISSING`, not env fallback, for user-facing endpoints.

2. Build portfolio snapshot.
   - Read configured ERC-20 balances for wallet-scoped requests.
   - Fetch latest prices when balances exist.
   - Fall back to persisted prices only when live fetch fails and the source is clearly marked.
   - Preserve zero-balance demo normalization only for explicit zero-balance cases.

3. Load market context.
   - Load latest normalized prices.
   - Load latest normalized quotes.
   - Compute quote validation status for intended execution legs.
   - Preserve source freshness and data provenance.

4. Run canonical risk once.
   - Use `RiskEngine.evaluate()` for all current risk, allocation, decision, report, and proposal flows.
   - Return the canonical `RiskAssessmentResponse`.
   - Persist the assessment best-effort.

5. Compute allocation from canonical risk.
   - Use the requested risk profile, or the configured default.
   - On Mantle Sepolia, remove `USDC` from profiles that include it and renormalize the remaining weights.
   - Return `PAUSE` with no actions when hard veto or pause-required risk is active.
   - Return `HOLD` when drift is inside tolerance or no actionable route exists.
   - Return bounded `REBALANCE` actions only when data and risk allow it.

6. Generate AI explanation.
   - AI receives portfolio, canonical risk, allocation decision, and rebalance actions.
   - AI may generate reasoning, confidence, notes, and operator-friendly summary.
   - AI must not change deterministic action, risk score, hard veto status, proposal guard result, or execution readiness.

7. Create proposal.
   - Recompute or reuse fresh canonical context.
   - Validate risk, quote freshness, oracle freshness, price deviation, slippage, concentration, pause guardian, configured routers, and approval manager state.
   - Build linked proposals only for executable, fresh, positive-amount swap legs.
   - Return blockers explicitly instead of creating partial executable proposals.

8. Execute or automate.
   - Recommendation-only mode requires manual operator approval.
   - Full-access AI can auto-create, approve, and execute only after deterministic guard checks pass.
   - Execution must still go through wallet approval, calldata, deadline, allowance, and quote-bound checks.

## Risk Engine Repair

### Goal

Make `RiskEngine.evaluate()` the only canonical risk engine for current application behavior.

### Required Changes

- [x] Move the useful checks from `RiskScoreEngine` into `RiskEngine`:
  - stale oracle hard-block checks
  - USDY oracle versus DEX depeg checks
  - quote availability checks
  - slippage and liquidity checks
  - concentration checks
  - portfolio data quality checks
- [x] Keep weighted, explainable buckets in the canonical response.
- [x] Keep the restrictive escalation rule: hard guards override numeric score.
- [x] Add metadata showing:
  - input portfolio snapshot id
  - quote validation status
  - latest price snapshot ids where available
  - latest quote snapshot ids where available
  - scoring method
  - bucket weights
- [ ] Refresh tests that directly assert legacy `RiskSnapshot` internals.
- [x] Finish proposal and allocation status namespace cleanup.

### Hard Veto Rules

The risk engine must return `RISK_VETO`, `recommended_action = pause`, and `hard_veto_status = active` for:

- missing portfolio positions when a wallet or scope is expected
- unvalued non-zero positions
- stale oracle beyond hard-block threshold
- severe USDY depeg beyond configured threshold
- critical route slippage beyond configured threshold
- missing execution quote for a proposal-ready action
- pause guardian active when configured
- required live execution contract address missing in live mode

### Non-Veto Restricted Rules

The risk engine should return restricted but non-veto states for:

- missing quote validation in advisory views: `RISK_REBALANCE_ONLY`
- warning-level stale oracle data: `RISK_CAUTION` or stricter by bucket score
- moderate depeg: `RISK_REBALANCE_ONLY` or `RISK_REDUCE_ONLY`
- concentration drift without missing valuation: `RISK_REBALANCE_ONLY`
- monitor-only runtime: human approval remains required

### Legacy Adapter

Keep `RiskScoreEngine.compute_risk_snapshot()` only for the deprecated `/risk/snapshot` adapter until that endpoint is removed. It now calls canonical `RiskEngine.evaluate()` and converts the result back into the older `RiskSnapshot` shape for compatibility.

## Allocation Engine Repair

### Goal

Make allocation consume canonical risk and emit allocation-only statuses.

### Required Changes

- Refactor `/allocation/recommendation` to call the shared decision-context builder.
- Replace `RiskSnapshot` dependency with canonical `RiskAssessmentResponse`, or add a narrow internal adapter with no independent scoring.
- Ensure `RISK_VETO` and `RISK_PAUSE_REQUIRED` always produce:
  - `recommended_action = PAUSE`
  - no `rebalance_actions`
  - status `degraded`
  - risk status code preserved
- Ensure missing price or quote data produces `HOLD`, `PAUSE`, or explicit blockers, not zero-sized fake actions.
- Keep clip sizing and pacing deterministic.
- Keep Sepolia target profiles deterministic:
  - `Defensive`, `Balanced`, and `Yield-Seeking` remove `USDC` on Mantle Sepolia.
  - Remaining weights are renormalized.
  - `Sepolia Test` remains `USDY: 0.50`, `mETH: 0.50`.
- Stop using proposal statuses in allocation decisions.
  - Allocation status codes should use `RISK_*` or `DATA_*`.
  - Proposal status codes belong only under `/proposals/*`.

### Suggested Schema Additions

Keep existing fields for compatibility and add optional metadata:

- `RebalanceAction.value_usd`
- `RebalanceAction.quote_status_code`
- `RebalanceAction.blocked_reason`
- `AllocationDecision.metadata`

These fields let the frontend show why a recommendation is not executable without parsing free-form reasoning.

## AI Decision Flow Repair

### Goal

AI can explain and orchestrate, but deterministic risk and policy gates remain authoritative.

### Required Changes

- Remove or disable `_override_with_ai_decision()` for production decision flow.
- Update the prompt wording so full-access AI is described as an orchestration mode, not a policy override mode.
- Keep `ai_debug.ai_overrode_deterministic = false` for normal flows.
- If model output suggests a different action, store it only in debug metadata such as `ai_suggested_action`, not in `recommended_action`.
- If model output is malformed or unavailable, return deterministic fallback reasoning.
- Never let AI change:
  - `recommended_action`
  - `risk_score`
  - `risk_band`
  - `hard_veto_status`
  - `required_human_approval_status`
  - proposal guard checks
  - execution readiness

### Runtime Config Fix

- Create one helper for current AI access mode, for example `get_ai_decision_maker_enabled()`.
- Initialize it from `settings.ai_decision_maker_enabled`.
- Use it consistently in:
  - `/settings`
  - `/status`
  - `/reports/latest`
  - proposal planning
  - AI parser metadata
  - frontend hooks
- Set default full-access AI to disabled unless explicitly enabled.

## Proposal And Execution Repair

### Goal

Proposal creation must be a guarded output of deterministic context, not an independent shortcut.

### Required Changes

- Make `/proposals/create` call the same canonical context path used by `/risk/current` and `/allocation/recommendation`.
- Use `RiskAssessmentResponse` from the canonical risk engine for `risk_assessment`.
- Reject proposal creation with explicit blockers when:
  - risk hard veto is active
  - no wallet address or recipient is available
  - deposit asset is not configured
  - target asset is not configured
  - live quote is missing for a swap leg
  - quote is stale
  - slippage exceeds threshold
  - quote deviation exceeds threshold
  - pause guardian is active
  - router address is missing
  - approval manager is required but missing in live mode
- Build linked proposals only for fresh AGNI executable routes with positive amount and valid calldata.
- Update proposal statuses only in proposal endpoints.
- Mark successful execute response as `EXECUTION_READY` or `EXECUTION_SUBMITTED` where appropriate, not `PROPOSAL_APPROVED`.

## Frontend API Cleanup

### Required Changes

- Keep RWA dashboard code on modular clients under `frontend/src/lib/api/*`.
- Remove any RWA dashboard dependency on legacy `/portfolio/snapshot` and `/risk/snapshot`.
- Ensure `useCurrentRisk`, `useAllocationRecommendation`, `useDecisions`, and report hooks send the same wallet and scope params.
- Keep query keys aligned so toggling AI access invalidates:
  - settings
  - status
  - risk
  - allocation
  - decisions
  - reports
  - proposals
- Mark `frontend/src/lib/api.ts` as legacy or external-service client if exchange/challenge pages remain.
- Do not add exchange/challenge routes to the AI/Data Analytics backend unless that product scope is intentionally reintroduced.

## Documentation Cleanup

Update these docs during implementation:

- `docs/ai-data-analytics/README.md`
  - Add `ai_plan.md` to the document list.
- `docs/ai-data-analytics/Changes.md`
  - Record every implementation pass.
- `docs/ai-data-analytics/Phase3.md`
  - Replace "complete" wording with "local-safe complete, canonical unification pending" until risk unification lands.
- `docs/ai-data-analytics/Phase4.md`
  - Document canonical risk dependency.
- `docs/ai-data-analytics/Phase5.md`
  - Clarify that AI cannot override deterministic decisions.
- `docs/ai-data-analytics/recommendation_model.md`
  - Keep status-code and recommendation-output requirements aligned with code.

## Implementation Sequence

### Step 1: Shared Decision Context

Add a module under `services/agent/modules` or `services/agent/app/api` that builds a single reusable decision context.

The context should include:

- request scope
- settings snapshot
- portfolio response
- market prices
- market quotes
- quote validation status
- canonical risk assessment
- selected profile name
- selected target weights
- data gaps

Consumers:

- `/risk/current`
- `/allocation/recommendation`
- `/decisions`
- `/reports/latest`
- `/proposals/create`

### Step 2: Canonical Risk Unification

- Move old risk checks into `RiskEngine`.
- Add price and quote optional inputs to `RiskEngine.evaluate()`.
- Make output deterministic and explainable.
- Add tests before changing downstream allocation behavior.

### Step 3: Allocation Refactor

- Make allocation use shared context and canonical risk.
- Remove proposal status codes from allocation response.
- Add action blocker metadata.
- Update Sepolia profile tests.

### Step 4: AI Refactor

- Remove AI action override from normal response path.
- Keep AI output advisory in metadata.
- Update prompt and parser tests.
- Confirm hard veto cannot be bypassed in full-access AI mode.

### Step 5: Proposal Guard Refactor

- [x] Reuse canonical context in `/proposals/create`.
- Return explicit blockers for every failed guard.
- [x] Make execute response status code execution-oriented.
- Add tests for blocked and successful plan creation.

### Step 6: Endpoint Deprecation Cleanup

- [x] Add `deprecated=True` to legacy snapshot route decorators.
- [x] Add response headers:
  - `Deprecation: true`
  - `Link: </portfolio/current>; rel="successor-version"` for portfolio
  - `Link: </risk/current>; rel="successor-version"` for risk
- Update tests to use canonical endpoints.
- Keep legacy tests only for deprecation behavior.

### Step 7: Frontend Alignment

- Ensure dashboard, trade, approvals, reports, risk center, and allocation studio all consume canonical routes.
- Remove any RWA usage of legacy snapshot routes.
- Leave exchange/challenge code outside the AI backend contract unless separately scoped.

## Acceptance Criteria

The repair pass is complete when:

- `/risk/current`, `/allocation/recommendation`, `/decisions`, `/reports/latest`, and `/proposals/create` all use the same canonical risk assessment for the same wallet or scope.
- A hard veto in risk always blocks allocation actions and proposal creation.
- AI cannot override deterministic action or hard veto state.
- Full-access AI can only automate after deterministic proposal guards pass.
- Deprecated snapshot endpoints remain temporarily available but are marked deprecated.
- Frontend RWA pages use canonical endpoints only.
- Allocation responses no longer use proposal status codes.
- Tests cover canonical normal, degraded, and blocked flows.

## Test Plan

### Backend Unit Tests

Risk:

- missing portfolio returns `RISK_VETO`
- unvalued non-zero position returns `RISK_VETO`
- fresh portfolio plus missing quote returns `RISK_REBALANCE_ONLY`
- fresh portfolio plus fresh quote can return `RISK_NORMAL`
- stale oracle hard block returns `RISK_VETO`
- warning stale oracle returns restricted non-veto state
- severe USDY depeg returns `RISK_VETO`
- critical slippage returns `RISK_VETO`
- concentration drift returns restricted non-veto state

Allocation:

- canonical `RISK_VETO` returns `PAUSE` and no actions
- canonical `RISK_PAUSE_REQUIRED` returns `PAUSE` and no actions
- `RISK_REBALANCE_ONLY` blocks risk-increasing buys
- missing pricing returns explicit blocker metadata
- Sepolia profiles remove `USDC` and renormalize
- allocation status codes are `RISK_*` or `DATA_*`, not `PROPOSAL_*`

AI:

- AI fallback returns canonical deterministic action
- model suggested override is recorded only in metadata
- malformed model output falls back safely
- hard veto remains blocked in full-access AI mode

Proposal:

- missing quote blocks linked proposal creation
- stale quote blocks linked proposal creation
- active risk veto blocks linked proposal creation
- valid fresh AGNI route creates linked proposal
- execute response uses execution status code

### Backend Integration Tests

- `GET /portfolio/current?wallet_address=...`
- `GET /risk/current?wallet_address=...`
- `GET /allocation/recommendation?wallet_address=...`
- `GET /decisions?wallet_address=...`
- `GET /reports/latest?wallet_address=...`
- `POST /proposals/create` with full `InvestmentPlanRequest`
- deprecated `/portfolio/snapshot` returns compatibility payload plus deprecation headers
- deprecated `/risk/snapshot` returns compatibility payload plus deprecation headers

### Frontend Tests

- dashboard fetches canonical wallet-scoped portfolio, risk, allocation, and decisions
- trade page creates plan with current `InvestmentPlanRequest`
- full-access toggle invalidates settings, status, risk, allocation, decisions, reports, and proposals
- full-access AI does not show manual approve buttons
- recommendation-only mode keeps manual review visible
- no RWA page calls `/portfolio/snapshot` or `/risk/snapshot`

## Rollout Plan

1. Land docs and tests for expected behavior.
2. Add shared decision context.
3. Unify risk engine.
4. Update allocation and decisions.
5. Update proposal guards.
6. Mark deprecated endpoints.
7. Align frontend clients and hooks.
8. Run backend unit and integration tests.
9. Run frontend targeted tests.
10. Update `Changes.md` with implementation details and commands run.

## Assumptions

- Mantle Sepolia remains the default implementation and test target.
- Mantle mainnet support remains configuration-driven but not the default.
- No smart-contract bytecode changes are included in this repair plan.
- No fabricated market data, portfolio balances, quotes, or oracle values should be introduced.
- PostgreSQL persistence remains best-effort for current local-safe flows.
- Existing unversioned route paths remain the MVP contract; this plan does not add `/api/v1`.
- Deprecated endpoints are retained temporarily for compatibility, then removed in a later cleanup pass after frontend and tests stop using them.

## Open Verification Items

- Verify live AGNI quote behavior for all intended Sepolia and mainnet pairs.
- Verify USDY oracle freshness and selector behavior for the active target environment.
- Verify mETH pricing mode for Sepolia demo asset versus mainnet asset.
- Verify frontend exchange/challenge pages are intentionally in scope before adding any matching backend routes.
- Verify whether full-access AI should default to disabled in all environments or only local/demo environments.
