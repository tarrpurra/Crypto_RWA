# AI + Data Analytics Service Changes

## Purpose

Track meaningful changes to the AI + Data Analytics service.

## Format

For each entry, record:

- date
- author
- type
- summary
- affected files or modules
- impact on smart contracts, frontend, or data quality

## Change Log

### 2026-06-11

Type:
Snapshot-first dashboard foundation

Author:
Codex

Summary:

- removed the unsafe non-test database fallback to in-memory SQLite so persistence failures now surface clearly instead of silently discarding snapshots
- added a cached `/dashboard/summary` endpoint that reads latest persisted portfolio, risk, allocation, and proposal records without triggering live market or wallet recomputation
- moved the frontend dashboard onto the new summary endpoint for core portfolio and risk state, and changed `/portfolio/current` plus `/risk/current` to prefer persisted snapshots unless `force_refresh=true`

Affected scope:

- services/agent/repositories/db/session.py
- services/agent/app/api/dashboard.py
- services/agent/app/schemas/dashboard.py
- services/agent/modules/dashboard/cache.py
- services/agent/modules/dashboard/summary.py
- services/agent/app/api/portfolio.py
- services/agent/app/api/risk.py
- frontend/src/lib/api/dashboard.ts
- frontend/src/hooks/useDashboardSummary.ts
- frontend/src/pages/Index.tsx
- frontend/src/App.tsx

Impact:

- persistence: non-test runtimes no longer silently lose data by falling back to in-memory SQLite
- performance: dashboard core state can be served from one cached snapshot endpoint instead of repeatedly hitting separate live-compute portfolio and risk paths
- compatibility: portfolio and risk endpoints still work but now default to persisted snapshots unless explicitly forced to refresh

### 2026-06-11

Type:
Vault cost-basis and P&L tracking

Author:
Codex

Summary:

- added backend persistence for per-user vault cash-flow records so deposits, withdrawals, and manual adjustments can be stored as cost basis
- extended the `/vault/portfolio` response with invested amount, total deposits, total withdrawals, and P&L fields derived from the stored flow ledger plus live vault valuation
- added `POST /vault/flows/record` so confirmed deposit and withdrawal activity can be written back to backend state after the wallet or frontend completes the on-chain action

Affected scope:

- services/agent/app/api/vault.py
- services/agent/app/schemas/vault.py
- services/agent/repositories/db/models.py
- services/agent/repositories/db/vault_repository.py

Impact:

- portfolio vault UX can now show invested capital and P&L from backend-provided fields instead of hardcoded or missing values
- data model: vault performance now depends on recorded cash flows; internal vault swaps do not change invested basis
- operations: frontend or execution flow still needs to call `/vault/flows/record` after successful deposits or withdrawals

### 2026-06-11

Type:
Decision API ai_debug compatibility fix

Author:
Codex

Summary:

- fixed the decisions and scoped-investment logging paths to read `AIDebugPayload` as a Pydantic model instead of calling dict-style `.get(...)`
- kept the API tolerant of either model or dict payloads so legacy/internal call sites do not crash the response path
- added direct unit coverage for the async `/decisions` helper to ensure a typed `RecommendationResponse` no longer raises during completion logging

Affected scope:

- services/agent/app/api/decisions.py
- services/agent/app/api/investment_scope.py
- services/agent/tests/unit/test_decisions_api.py

Impact:

- reliability: `/decisions` and scoped decision flows no longer fail after recommendation generation because of `ai_debug` attribute access
- risk: the observed exception was in the API/logging layer, not in canonical risk evaluation
- tests: focused unit coverage now protects the typed `ai_debug` response path

### 2026-06-08

Type:
Proposal routing and dust-leg fix

Author:
Codex

Summary:

- updated the proposal planner to prefer rebalance swap legs built from the current wallet holdings when the actual portfolio is available and the allocation engine returns actionable rebalance moves
- surfaced `RISK_REBALANCE_ONLY` as a Sepolia advisory warning instead of a blocker so rebalance-backed execution can proceed when the swap route is valid
- added dust guards to both planned swap builders so swap legs below the minimum executable value are skipped before proposal encoding and approval-step generation
- passed the actual wallet portfolio into proposal planning from the decisions endpoint and added regression coverage for held-asset routing, dust skipping, and rebalance-path selection

Affected scope:

- services/agent/modules/proposals/investment_planner.py
- services/agent/app/api/decisions.py
- services/agent/tests/unit/test_investment_planner.py

Impact:

- behavior: proposal creation now follows held-asset rebalance routes instead of forcing a deposit-to-target path when the wallet already holds the rebalance assets
- data quality: dust-sized swap legs are filtered before they can leak into proposal payloads or approval steps
- tests: direct coverage now exercises both swap builders and the rebalance-path selection logic

### 2026-06-08

Type:
Pre-demo market/report latency reduction

Author:
Codex

Summary:

- parallelized `GET /market/quotes/latest` so live price refresh and route discovery can run together before quote sampling starts
- added a small request-local cache inside the report builder so repeated report sections can reuse the same fetched portfolio, risk, allocation, and market data within one `reports/latest` request
- added focused tests for the new quote-parallelization path and the report cache helper

Affected scope:

- services/agent/app/api/market.py
- services/agent/modules/quotes/service.py
- services/agent/modules/reports/builder.py
- services/agent/tests/integration/test_market.py
- services/agent/tests/integration/test_reports.py

Impact:

- performance: quote sampling and report generation should spend less time waiting on avoidable sequential fetches
- reliability: request-local reuse reduces repeated upstream calls during one report render
- tests: concurrency and cache behavior now have direct coverage

### 2026-06-08

Type:
Pre-demo latency reduction

Author:
Codex

Summary:

- parallelized the live portfolio refresh path so persisted snapshot lookup, ERC-20 balance reads, and price bundle fetches can run concurrently instead of serializing inside `current_portfolio()`
- updated the shared decision context builder to run portfolio and market-context reads in parallel and reuse the same built context for downstream allocation and reasoning flows
- added unit coverage for the new concurrency shape so the request pipeline does not drift back to sequential fetches

Affected scope:

- services/agent/app/api/portfolio.py
- services/agent/modules/decisions/context.py
- services/agent/tests/unit/test_investment_scope.py
- services/agent/tests/unit/test_portfolio_snapshot.py

Impact:

- performance: the demo-critical request path should spend less time waiting on independent live reads
- reliability: slow upstream market and RPC calls still fall back to persisted data when available
- tests: concurrency-oriented unit coverage now guards the new parallel fetch behavior

### 2026-06-08

Type:
Swap cleanup and soft-advisory AI

Author:
Codex

Summary:

- changed proposal plan generation to emit execution-oriented status codes instead of proposal lifecycle codes
- kept swap proposal creation guarded by quote freshness, slippage, deviation, pause-guardian, router, approval-manager, and recipient checks
- updated the AI decision prompt and parser metadata path so AI remains advisory but can surface suggested actions without overriding deterministic recommendations
- updated investment planner tests to expect execution-oriented linked proposal statuses

Affected scope:

- services/agent/modules/proposals/investment_planner.py
- services/agent/strategies/decision_templates/prompt_builder.py
- services/agent/strategies/decision_templates/parser.py
- services/agent/tests/unit/test_investment_planner.py
- docs/ai-data-analytics/ai_plan.md

Impact:

- execution: swap plans now surface execution readiness and blocking status using execution vocabulary
- ai: model suggestions remain visible in metadata/debug payloads while the deterministic recommendation stays authoritative
- tests: touched unit expectations now match execution-oriented swap planning

### 2026-06-08

Type:
Swap-context prompt enrichment

Author:
Codex

Summary:

- extended the scoped allocation prompt so it can render current wallet holdings alongside the deposit preview instead of only showing the deposit-to-target path
- updated the AI reasoning prompt to include explicit `token_in_symbol`, `token_out_symbol`, `route_id`, and `swap_pair_label` fields for each rebalance action
- threaded the best-effort wallet portfolio into scoped decision and allocation flows so the AI can see held assets like `USDY` and `mETH` when reasoning about rebalances
- adjusted the fallback unit tests so they run deterministically without probing a live AI provider

Affected scope:

- services/agent/modules/decisions/context.py
- services/agent/app/api/investment_scope.py
- services/agent/strategies/decision_templates/prompt_builder.py
- services/agent/strategies/decision_templates/parser.py
- services/agent/tests/unit/test_ai_fallback.py
- services/agent/tests/unit/test_investment_scope.py

Impact:

- ai: prompt context now reflects held assets and explicit swap routes, not just the WMNT-centric deposit path
- reasoning: operator-visible explanations now preserve the concrete token-in/token-out execution context
- tests: AI fallback coverage stays deterministic and no longer depends on a live model endpoint

### 2026-06-07

Type:
Risk engine unification

Author:
Codex

Summary:

- moved legacy oracle freshness, USDY depeg, liquidity/slippage, and concentration checks into canonical `RiskEngine.evaluate()`
- added optional latest price and quote snapshots to canonical risk evaluation and risk metadata
- changed hard-veto risk scoring so canonical hard guards force a `RISK_VETO` score of `100.0`
- converted `RiskScoreEngine.compute_risk_snapshot()` into a deprecated adapter that calls `RiskEngine.evaluate()` and converts the result to the old `RiskSnapshot` shape
- wired shared decision context, `/risk/current`, scoped risk, `/proposals/create`, and proposal execution to pass market context into canonical risk where available
- marked `/portfolio/snapshot`, `/risk/snapshot`, and `/allocation/profile` as deprecated and added successor-link headers
- changed proposal execution payload readiness from `PROPOSAL_APPROVED` leakage to `EXECUTION_READY`

Affected scope:

- services/agent/risk/engine.py
- services/agent/risk/scoring/score_engine.py
- services/agent/modules/decisions/context.py
- services/agent/app/api/risk.py
- services/agent/app/api/investment_scope.py
- services/agent/app/api/decisions.py
- services/agent/app/api/portfolio.py
- services/agent/app/api/allocation.py
- docs/ai-data-analytics/ai_plan.md

Impact:

- risk: current, allocation, decisions, and proposal creation now use one canonical risk engine instead of split new/legacy scoring paths
- execution: proposal execute responses now use execution status vocabulary once calldata is ready
- compatibility: legacy risk and portfolio endpoints remain available for old clients but are visibly deprecated
- tests: syntax compilation was run for touched backend files; full unit/integration tests were not run in this pass

### 2026-06-07

Type:
Proposal execution logging

Author:
Codex

Summary:

- added backend logs at the start of `POST /proposals/{proposal_id}/execute`
- added warning logs when execution is blocked so the failure reason is visible before the HTTP 400 is raised
- added a final payload-ready log showing the router, selector, tokens, and chain id when execution passes all backend guards

Affected scope:

- services/agent/app/api/decisions.py

Impact:

- observability: execution failures and successful payload generation are now visible in backend logs, making it easier to distinguish a backend block from a frontend wallet issue

### 2026-06-07

Type:
Trade execution modal fix

Author:
Codex

Summary:

- kept the Trade confirmation modal in place, but changed confirm handling so the execution flow owns the modal lifecycle instead of closing first and racing the swap calls
- added explicit frontend logs before each approved proposal is executed through `/proposals/{id}/execute`
- suppressed the modal's close handler during programmatic completion so the confirm action does not get mistaken for cancel

Affected scope:

- frontend/src/pages/Trade.tsx

Impact:

- frontend behavior: confirming the modal now actually drives the execution sequence while preserving the last-review checkpoint for the operator

### 2026-06-07

Type:
Trade auto-create gating fix

Author:
Codex

Summary:

- removed the `routeHasInvestmentParams` requirement from the Trade page's full-access AI auto-create effect
- kept the current form scope as the source of truth so AI-managed Trade can create a plan even when the URL does not include `asset`, `amount`, or `risk` query parameters

Affected scope:

- frontend/src/pages/Trade.tsx

Impact:

- frontend behavior: full-access AI on Trade will now create and execute from the active form state instead of silently waiting for route query parameters that are absent in normal navigation

### 2026-06-07

Type:
Backend and frontend request logging

Author:
Codex

Summary:

- added request-level backend logs for `/allocation/recommendation` and `/proposals/create`
- added browser-console logs in the Trade flow for plan creation, auto-create evaluation, wrap execution, proposal execution, and onchain router submission
- renamed the AI prompt logger to the `services.agent.ai` subsystem so AI prompt logs are grouped with the rest of the AI logs

Affected scope:

- services/agent/app/api/allocation.py
- services/agent/app/api/decisions.py
- services/agent/strategies/decision_templates/parser.py
- frontend/src/pages/Trade.tsx
- frontend/src/hooks/useSwap.ts

Impact:

- observability: the frontend and backend now log the exact entry points for allocation, proposal creation, and swap submission, making it much easier to confirm whether the AI path is actually being exercised

### 2026-06-07

Type:
Frontend allocation logging

Author:
Codex

Summary:

- added browser-console logs when the frontend calls `/allocation/recommendation`
- added browser-console logs when the Trade flow submits `/proposals/create`, which is the frontend entrypoint that triggers backend allocation during plan creation

Affected scope:

- frontend/src/hooks/useAllocation.ts
- frontend/src/hooks/useSwap.ts

Impact:

- frontend observability: allocation requests and proposal submissions are now visible in the browser console, making it easier to confirm when allocation is actually being queried from the UI

### 2026-06-07

Type:
AI prompt logging

Author:
Codex

Summary:

- added explicit backend logs for the full AI allocation and reasoning prompts immediately before each Ollama call
- kept the prompt logging on the backend call path so the frontend does not need extra debug noise to confirm the AI request

Affected scope:

- services/agent/strategies/decision_templates/parser.py

Impact:

- observability: backend logs now show the exact system prompt being sent to the AI provider for allocation and reasoning calls

### 2026-06-07

Type:
Proposal quote scaling / quote visibility

Author:
Codex

Summary:

- fixed proposal encoding so `min_amount_out` is scaled to the actual swap size instead of reusing the raw sample quote amount
- fixed the price-deviation guard to compare against the scaled quote output, which removes the false block caused by sample quotes being attached to larger proposals
- surfaced an approximate quote rate on the Approvals queue and added swap-direction labels in the Trade allocation view so the active pair is visible in the UI

Affected scope:

- services/agent/modules/proposals/investment_planner.py
- services/agent/tests/unit/test_investment_planner.py
- frontend/src/pages/ApprovalsPage.tsx
- frontend/src/pages/Trade.tsx

Impact:

- proposals: approval queue min-out values now reflect the actual planned swap amount rather than the fixed quote sample size
- allocation/ui: the swap direction and approximate rate are visible when reviewing queued proposals and selected allocations

### 2026-06-07

Type:
Quote freshness / stale price snapshot fix

Author:
Codex

Summary:

- changed quote and proposal price lookup to prefer the fresh in-memory Sepolia price bundle instead of only the persisted market repository snapshot
- made the Sepolia quote endpoints refresh the latest price bundle before sampling quotes so `WMNT -> mETH` and related AIYIELD rates stay aligned with current market prices
- confirmed WMNT is already present in the Sepolia asset registry; the stale swap-rate issue was coming from persisted price reads, not from the asset filter

Affected scope:

- services/agent/modules/quotes/service.py
- services/agent/modules/proposals/investment_planner.py
- services/agent/app/api/market.py

Impact:

- market data: Sepolia quote sampling now tracks the latest price bundle rather than lagging the database snapshot
- allocation/proposals: swap-rate-derived guards and min-out checks now follow the same fresh price source as the market UI

### 2026-06-07

Type:
Runtime cleanup / Remove Sepolia USDC from active flow

Author:
Codex

Summary:

- removed the Sepolia `USDC` asset from the active asset registry so market ingestion no longer reports it as missing
- removed `USDC` from the frontend swap and trade selectors so the active Sepolia flow only exposes `USDY`, `mETH`, and `WMNT`
- updated the Sepolia settings test to reflect the reduced active asset set

Affected scope:

- services/agent/app/core/settings.py
- services/agent/tests/unit/test_settings.py
- services/agent/.env.example
- frontend/src/pages/Index.tsx
- frontend/src/pages/Trade.tsx
- frontend/src/components/swap/SwapForm.tsx
- frontend/src/components/swap/TokenSelectDialog.tsx

Impact:

- market data: `DATA_PARTIAL` should clear once the backend reloads with the new asset registry
- frontend: USDC is no longer presented as an active Sepolia swap choice
- allocation: Sepolia planning now stays on the active `USDY` / `mETH` basket

### 2026-06-07

Type:
Feature / Sepolia guard threshold relaxation

Author:
Codex

Summary:

- loosened the Sepolia investment-plan guard checks so normal test allocations can clear proposal creation without tripping on the old 1% quote band or 70% concentration cap
- widened the Sepolia quote-deviation threshold to 10% and the Sepolia concentration cap to 100%, while keeping the live defaults tighter
- increased the Sepolia slippage threshold so the AIYIELD test router can pass the planner without failing on conservative testnet estimates

Affected scope:

- services/agent/modules/proposals/investment_planner.py
- services/agent/tests/unit/test_investment_planner.py
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract bytecode changed
- frontend: allocation and trade flows can now reach proposal creation more reliably on Mantle Sepolia
- data quality: the guard layer still runs, but its thresholds are now more permissive on Sepolia test flows so synthetic and lightly deviated quotes do not block execution

Assumptions / unresolved verification items:

- the relaxed thresholds are intended for Sepolia/testnet flows; live-chain guarding remains strict
- approval freshness is still informational and will remain pending until the ERC-20 approval transaction is submitted

### 2026-06-07

Type:
Feature / allocation swap pair labels

Author:
Codex

Summary:

- added explicit `token_in_symbol`, `token_out_symbol`, and `swap_pair_label` fields to allocation rebalance actions so UI surfaces can show the actual swap direction instead of only the target asset
- taught deterministic and AI-backed allocation paths to populate swap pair metadata, including normalization of native `MNT` display into `WMNT` for router-facing flows
- updated quote ranking to prefer the deployed AIYIELD test router on Sepolia so the planner does not keep choosing a live AGNI quote that fails the 1% deviation guard
- updated the dashboard, risk, and allocation screens to render swap pairs such as `WMNT -> USDY` directly in the allocation summary and rebalance clip lists

Affected scope:

- services/agent/app/schemas/allocation.py
- services/agent/strategies/allocation/swap_pairs.py
- services/agent/strategies/allocation/rebalance.py
- services/agent/strategies/decision_templates/parser.py
- services/agent/modules/quotes/route_ranker.py
- frontend/src/lib/api/types.ts
- frontend/src/pages/AllocationStudio.tsx
- frontend/src/pages/RiskCenter.tsx
- frontend/src/pages/Index.tsx
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract bytecode changed
- frontend: allocation and dashboard summaries now show the actual swap direction, which makes AI recommendations and rebalance clips easier to interpret
- data quality: the rebalance metadata now preserves source/target context instead of leaving the UI to infer it from the target asset alone

Assumptions / unresolved verification items:

- swap pair inference is heuristic for allocation previews and uses the best available portfolio/target weights or the connected deposit asset as the source leg
- the UI change has not been manually verified in-browser after this patch

### 2026-06-06

Type:
Fix / shared decision context and AI override removal

Author:
Codex

Summary:

- added a shared decision context module for portfolio, canonical risk, risk-snapshot adaptation, and allocation profile resolution
- refactored `/allocation/recommendation` non-scoped reads to use canonical `RiskEngine.evaluate()` context instead of independently computing the older `RiskScoreEngine` snapshot
- refactored `/decisions` non-scoped reads to use the same shared context as allocation
- changed AI decision-maker parsing so model output can suggest an action in metadata but cannot override the deterministic allocation action
- updated the AI prompt to describe full-access AI as orchestration bounded by deterministic risk and proposal guards
- refreshed the stale proposal lifecycle integration test to use the current `InvestmentPlanRequest` shape

Affected scope:

- services/agent/modules/decisions/context.py
- services/agent/modules/decisions/__init__.py
- services/agent/app/api/allocation.py
- services/agent/app/api/decisions.py
- services/agent/strategies/decision_templates/parser.py
- services/agent/strategies/decision_templates/prompt_builder.py
- services/agent/tests/unit/test_ai_fallback.py
- services/agent/tests/integration/test_portfolio_endpoints.py
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract bytecode changed
- frontend: no UI code changed; allocation and decision endpoints now align more closely with `/risk/current`
- data quality: risk and allocation recommendations now share the same canonical portfolio/risk context for non-scoped reads

Assumptions / unresolved verification items:

- scoped investment allocation still uses its existing helper path and should be moved onto the shared context in the next pass
- proposal creation still has its own risk call and should be unified with the shared context in the next pass
- full risk unification still needs the stale-oracle, depeg, liquidity, and slippage checks from `RiskScoreEngine` folded into `RiskEngine`

Commands run:

- `python -m unittest services.agent.tests.unit.test_allocation services.agent.tests.unit.test_ai_fallback services.agent.tests.unit.test_risk_engine -v`
- `python -m unittest services.agent.tests.integration.test_portfolio_endpoints services.agent.tests.integration.test_risk services.agent.tests.integration.test_health -v`

---

### 2026-06-06 (later)

Type:
Scoped allocation moved onto shared decision context + AI-driven allocation

Author:
Codex

Summary:

- extended `build_decision_context()` to accept deposit scope params (`deposit_asset_symbol`, `deposit_amount`, `risk_profile`, `allocation_mode`) and build a scoped portfolio via `_build_scoped_portfolio()` helper
- added `scope_type` and `scope_input` fields to `DecisionContext` dataclass
- added `build_allocation_prompt()` in `prompt_builder.py` — prompt for AI to generate allocation amounts
- added `generate_ai_allocation()`, `_apply_allocation_guardrails()`, `_deterministic_allocation()` in `parser.py` — AI generates allocation actions with deterministic guardrails (veto blocks AI, clip sizing, deterministic fallback on AI failure)
- refactored `build_scoped_allocation_response()` to be async, using shared context + AI allocation instead of ad-hoc action builder
- refactored `build_scoped_decision_response()` to use canonical `RiskEngine.evaluate()` via shared context instead of old `RiskScoreEngine.compute_risk_snapshot()`
- changed `compute_rebalance()` `PROPOSAL_DRAFT` status code to `RiskStatusCode.RISK_NORMAL.value`
- used lazy imports in `allocation.py`, `decisions.py`, `investment_scope.py` to avoid circular imports through the new context → api chain
- added price-resolution fallback in scoped portfolio builder via `_resolve_price()` with sepolia-specific stable/mETH fallbacks

Affected scope:

- services/agent/modules/decisions/context.py
- services/agent/strategies/decision_templates/prompt_builder.py
- services/agent/strategies/decision_templates/parser.py
- services/agent/app/api/investment_scope.py
- services/agent/app/api/allocation.py
- services/agent/app/api/decisions.py
- services/agent/strategies/allocation/rebalance.py
- services/agent/tests/unit/test_investment_scope.py
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract bytecode changed
- frontend: scoped allocation and decision endpoints now flow through shared context + canonical risk; AI can generate allocation amounts directly for scoped/preview flows but veto still blocks
- data quality: all flows (wallet and scoped) now use the same `RiskEngine.evaluate()` for risk; scoped allocation no longer emits `PROPOSAL_DRAFT` status codes

Assumptions / unresolved verification items:

- scoped decision responses now pass through `generate_recommendation_reasoning()` with canonical risk snapshot adapter (risk_assessment_to_snapshot) — verify human-readable output matches old risk snapshot format
- AI allocation prompt assumes Ollama is available; falls back to deterministic weight-based allocation if unavailable
- proposal creation (`/proposals/create`) still has its own risk call and should be unified with shared context in a future pass
- full risk unification still needs the stale-oracle, depeg, liquidity, and slippage checks from `RiskScoreEngine` folded into `RiskEngine`

Commands run:

- `python -m unittest services.agent.tests.unit.test_investment_scope -v` (7 tests, all pass)
- `python -m unittest services.agent.tests.unit.test_allocation services.agent.tests.unit.test_ai_fallback services.agent.tests.unit.test_risk_engine services.agent.tests.unit.test_investment_scope -v` (27 tests, all pass)
- `python -m unittest services.agent.tests.integration.test_portfolio_endpoints services.agent.tests.integration.test_risk services.agent.tests.integration.test_health -v` (13 tests, all pass)

### 2026-06-06

Type:
Docs / AI repair plan

Author:
Codex

Summary:

- added `ai_plan.md` as the active remediation plan for the current AI allocation, risk engine, proposal, and endpoint flow
- documented the current status of Phase 3 through Phase 5, including the split between canonical `RiskEngine` behavior and older `RiskScoreEngine` consumers
- listed canonical endpoints, deprecated snapshot endpoints, and legacy frontend API surfaces that should not be treated as part of the AI/Data Analytics backend contract
- defined the target wallet/scope decision flow, deterministic risk gates, allocation constraints, AI orchestration boundaries, proposal guard flow, implementation sequence, acceptance criteria, and test plan
- updated the AI docs README so the repair plan is discoverable

Affected scope:

- docs/ai-data-analytics/ai_plan.md
- docs/ai-data-analytics/README.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract bytecode changed
- frontend: no UI code changed, but the plan identifies deprecated and legacy API surfaces that frontend work should stop relying on
- data quality: no data-source behavior changed, but the plan locks the intended fail-safe risk and allocation repair flow

Assumptions / unresolved verification items:

- Mantle Sepolia remains the default target chain for the repair pass
- implementation and tests have not been changed yet

Commands not run:

- backend and frontend tests, builds, lint, and formatting were not run because this is a documentation-only update

### 2026-06-06

Type:
Fix / scoped allocation, quote fallback, and risk labeling cleanup

Author:
Codex

Summary:

- taught the scoped allocation preview to reuse configured fallback pricing for Sepolia stable assets and mirrored test assets instead of collapsing target legs to zero when the persisted price cache is missing
- changed planned swap building to fall back to persisted fresh quotes whenever the live quote attempt is unavailable or not actionable, so risk validation can see real quote coverage
- filtered allocation and recommendation surfaces down to actionable positive-amount legs, which stops the dashboard from surfacing zero-sized swap suggestions
- corrected the risk-band styling and risk-item severity mapping in the dashboard AI widgets so `RISK_REBALANCE_ONLY` and related bands no longer render as normal or unlabeled
- added unit tests covering scoped fallback pricing, quote fallback selection, no-actionable allocation status, and actionable-asset recommendation focus

Affected scope:

- services/agent/app/api/investment_scope.py
- services/agent/modules/proposals/investment_planner.py
- services/agent/strategies/allocation/rebalance.py
- services/agent/strategies/decision_templates/parser.py
- services/agent/tests/unit/test_investment_scope.py
- services/agent/tests/unit/test_investment_planner.py
- services/agent/tests/unit/test_allocation.py
- services/agent/tests/unit/test_ai_fallback.py
- frontend/src/pages/Index.tsx
- frontend/src/components/dashboard/AISidePanel.tsx
- frontend/src/components/dashboard/AIDecisionFeed.tsx
- frontend/src/components/dashboard/AIGlassbox.tsx
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract bytecode changed
- frontend: the dashboard now shows only actionable swap recommendations and renders the risk state more accurately
- data quality: scoped pricing and quote selection now reuse available fallback sources before declaring a rebalance leg unusable

Assumptions / unresolved verification items:

- the new unit tests were added but not executed in this turn

### 2026-06-06

Type:
Fix / full-access AI auto-execution flow

Author:
Codex

Summary:

- removed the remaining manual review prompt from the dashboard when full access AI is enabled
- made the dashboard auto-open the trade flow for actionable rebalance recommendations in full access mode
- made the trade page auto-create the investment plan once the scoped route is ready, so linked proposals can be approved and executed without a human swap review step
- marked the generated transaction steps as AI-managed in full access mode so the approval queue and report surfaces stop describing them as manual user actions
- made the approvals queue read-only in full access mode so approval and execution buttons are hidden while AI handles the swap flow
- retained the risk-details modal for inspection while hiding the manual plan/approval actions in full access mode
- added regression tests covering the dashboard auto-launch path and the full-access planner step labels

Affected scope:

- frontend/src/pages/Index.tsx
- frontend/src/pages/Trade.tsx
- frontend/src/pages/ApprovalsPage.tsx
- frontend/src/pages/Index.test.tsx
- services/agent/modules/proposals/investment_planner.py
- services/agent/tests/unit/test_investment_planner.py
- docs/ai-data-analytics/Changes.md

Impact:

- frontend: full access AI now drives the swap flow automatically from dashboard recommendation to trade execution
- backend: the generated plan payload now marks swap steps as AI-managed when full access AI is enabled
- data quality: no change to data sources; the behavior change is orchestration only

Assumptions / unresolved verification items:

- the new frontend and backend tests were added but not executed in this turn
- the fallback pricing path depends on the existing Sepolia simulation flags and configured reference prices

Commands not run:

- backend and frontend test suites, builds, lint, and formatting were not run in this turn

### 2026-06-06

Type:
Fix / report missing-data list instead of partial warning

Author:
Codex

Summary:

- replaced the report card's generic partial-data warning with a neutral list of the data sources that could not be fetched
- stopped truncating the report missing-data list so the Settings page now shows every gap returned by the backend
- updated the downloadable investment report markdown to use a `Missing Data` section instead of `Data Gaps`
- changed the report status text so it describes missing sources without calling the report partial

Affected scope:

- services/agent/modules/reports/builder.py
- frontend/src/pages/SettingsPage.tsx
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract behavior changed
- frontend: the Settings report card no longer presents the report as a warning state; it now enumerates every missing fetch directly
- data quality: the report output is clearer about which inputs were unavailable, without implying that the user only received a partial summary

Assumptions / unresolved verification items:

- the report status code remains `DATA_PARTIAL` when inputs are missing, but the user-facing wording now stays neutral
- backend and frontend tests, builds, lint, and formatting were not fully rerun after the copy update

Commands not run:

- full backend and frontend test suites, builds, lint, and formatting were not run in this turn

### 2026-06-06

Type:
Config / verified Pyth feed-id refresh for USDY, mETH, and WMNT

Author:
Codex

Summary:

- updated the USDY direct Pyth feed id to the verified `Crypto.USDY/USD` Hermes feed
- updated the main mETH USD feed and mETH/ETH ratio feed ids to the verified Hermes records
- routed WMNT through the configured MNT/USD feed path instead of a flat parity stub when the feed is available
- kept WMNT on a fallback native MNT parity path only when the MNT/USD feed is missing, because Hermes does not expose a dedicated WMNT feed
- aligned the Sepolia and mainnet settings defaults, `.env.example`, and ingestion checks with the verified feed ids

Affected scope:

- services/agent/app/core/settings.py
- services/agent/modules/market_data/prices.py
- services/agent/.env.example
- services/agent/tests/unit/test_settings.py
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract bytecode changed
- frontend: no direct UI change, but the dashboard and trade surfaces now receive cleaner price readiness signals for USDY, mETH, and WMNT
- data quality: verified Hermes feed ids replace placeholder or parity-only assumptions, improving the reliability of price ingestion and asset readiness checks

Assumptions / unresolved verification items:

- Hermes currently exposes a direct MNT/USD feed but no dedicated WMNT feed, so WMNT still reuses the MNT/USD price path
- the Sepolia mETH test-token flow continues to use the existing manual-mirror branch when explicitly enabled
- backend and frontend tests, builds, lint, and formatting were only partially verified in this turn

Commands not run:

- full backend and frontend test suites, builds, lint, and formatting were not run in this turn

### 2026-06-06

Type:
Feature / wallet-connected investment flow, recommendation notifications, and downloadable report

Author:
Codex

Summary:

- added a wallet-scoped investment flow that starts from the dashboard, carries the deposit amount into the trade page, and exposes the AI access choice as recommendation only versus full access AI
- wired the connect-wallet action to the auth wallet flow so the primary CTA no longer just scrolls the page
- added a recommendation notification banner and toast so recommendation-only mode can prompt the user with prefilled swap details before approval
- added full-access AI execution on the trade page so linked proposals auto-approve and auto-execute when the AI decision maker is enabled
- added a new `/reports/latest` endpoint plus a downloadable markdown report in Settings that summarizes portfolio, risk, allocation, system readiness, market health, and execution queue state
- hardened portfolio valuation so live-price failures fall back to persisted market data or a degraded empty-price snapshot instead of hard-failing the page
- switched runtime AI access reads to the live settings flag so the UI, health endpoints, and report output stay consistent after toggling AI mode

Affected scope:

- services/agent/app/api/portfolio.py
- services/agent/app/api/reports.py
- services/agent/app/api/settings.py
- services/agent/app/api/health.py
- services/agent/app/api/__init__.py
- services/agent/app/main.py
- services/agent/app/schemas/reports.py
- services/agent/modules/reports/builder.py
- services/agent/strategies/decision_templates/parser.py
- frontend/src/pages/Index.tsx
- frontend/src/pages/Trade.tsx
- frontend/src/pages/SettingsPage.tsx
- frontend/src/components/dashboard/AISidePanel.tsx
- frontend/src/hooks/useReports.ts
- frontend/src/lib/api/reports.ts
- frontend/src/lib/download.ts
- frontend/src/lib/api/types.ts

Impact:

- smart contracts: no contract bytecode changes were introduced, but the UI now drives a stricter execution flow before calling the existing proposal approval and execution endpoints
- frontend: the main dashboard now supports wallet connect, investment scope entry, recommendation notifications, AI access selection, and a settings report download path
- data quality: missing live market data no longer hard-fails the portfolio route, and the report generator records data gaps instead of silently omitting missing sources

Assumptions / unresolved verification items:

- the new fallback behavior relies on the repo's existing market-data providers and persisted price snapshots; no new third-party provider was added in this turn
- full-access AI still requires the user to create the investment plan from the trade page before auto-execution begins
- backend and frontend tests, builds, lint, and formatting were not run in this turn

Commands not run:

- backend and frontend tests, builds, lint, and formatting were intentionally not run in this turn

### 2026-06-06

Type:
Feature / Sepolia demo-asset readiness and manual-mirror mETH support

Summary:

- added explicit Sepolia demo-asset config fields for `mETH`, including `SEPOLIA_METH_IS_TEST_TOKEN`, `SEPOLIA_METH_PRICE_MODE`, `METH_MANUAL_PRICE_USD`, and `REQUIRE_LIVE_PRICES`
- fixed the broken Sepolia USDY ingestion branch in `prices.py` and added a first-class `manual_mirror` pricing path for the Sepolia `mETH` demo asset
- expanded `/settings` so the frontend can see the active Sepolia chain and token configuration instead of only WMNT wrap support
- added `GET /system/readiness` to report token verification, pricing mode, AGNI route status, and current execution mode for Mantle Sepolia debugging
- updated frontend system types and trade surfaces so the `mETH` sleeve is labeled as a Sepolia demo asset while still using live wallet and AGNI routing surfaces

Affected scope:

- services/agent/app/core/settings.py
- services/agent/modules/market_data/prices.py
- services/agent/app/api/settings.py
- services/agent/app/api/health.py
- services/agent/app/schemas/health.py
- services/agent/.env.example
- services/agent/tests/unit/test_settings.py
- services/agent/tests/integration/test_health.py
- frontend/src/lib/api/types.ts
- frontend/src/lib/api/system.ts
- frontend/src/hooks/useSystem.ts
- frontend/src/components/swap/TokenSelectDialog.tsx
- frontend/src/components/swap/SwapForm.tsx
- frontend/src/pages/Trade.tsx

Impact:

- smart contracts: no runtime contract bytecode changed in the agent service, but the backend now expects an explicitly marked Sepolia demo-token path for `mETH`
- frontend: trade and token-selection flows now expose the Sepolia `mETH` sleeve as a demo asset instead of implying canonical protocol liquidity
- data quality: Sepolia `mETH` pricing can now be made explicit as `manual_mirror` rather than silently falling through to stale or misleading assumptions

Assumptions / unresolved verification items:

- a new Sepolia `mETH` demo token still needs to be deployed and its address written into the live `.env` before the route checks can return `ok`
- the new readiness endpoint reports current AGNI single-hop route status, but it does not seed liquidity or create pools by itself
- backend and frontend tests, builds, lint, formatting, and on-chain deployment commands were not run in this turn

Commands not run:

- backend and frontend tests, builds, lint, formatting, and Sepolia deployment commands were intentionally not run in this turn

### 2026-06-04

Type:
Config / Sepolia mock-token mETH pricing alignment

Summary:

- kept the existing deployed Sepolia mock ERC-20 at `SEPOLIA_METH_ADDRESS` as the application-owned testnet `mETH` asset for demo speed
- cleared the unverified direct `METH_USD_PYTH_FEED_ID` and `METH_ETH_RATIO_FEED_ID` placeholders so the backend intentionally falls back to the existing ETH/USD Pyth proxy path for `mETH` valuation
- preserved the repo's asset-registry symbol as `mETH`, so frontend and portfolio surfaces continue to present the token as the testnet `mETH` sleeve while its price follows the live ETH reference

Affected scope:

- services/agent/.env
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract behavior changed
- frontend: no UI code changed, but the active Sepolia `mETH` sleeve is now intentionally backed by the deployed mock token rather than accidentally using a stale or misleading feed config
- data quality: `mETH` valuation now explicitly follows the ETH/USD Pyth proxy path instead of carrying unresolved `TODO_VERIFY` direct-feed placeholders

Assumptions / unresolved verification items:

- the configured Sepolia `mETH` address remains a mock ERC-20 contract, not an official `mETH` deployment
- this is acceptable for the current demo because the token's price behavior, not its protocol identity, is what the allocation and swap flow need
- backend and frontend tests, builds, lint, and formatting were not run in this turn

Commands not run:

- backend and frontend tests, builds, lint, and formatting were intentionally not run in this turn

### 2026-06-04

Type:
Feature / Sepolia USDY mainnet-oracle reference wiring

Summary:

- verified the Ondo `RWADynamicOracle` mainnet read selector as `getPrice()` with selector `0x98d5fdca`
- confirmed the configured Ondo oracle address has no code on Mantle Sepolia and therefore cannot be used as a native Sepolia oracle deployment
- added `ONDO_USDY_REFERENCE_RPC_URL` so Mantle Sepolia can mirror the verified Mantle mainnet Ondo oracle as its USDY reference source
- updated Sepolia USDY ingestion and proposal guard logic to treat the mirrored Ondo mainnet oracle as the preferred reference source when configured

Affected scope:

- services/agent/.env
- services/agent/app/core/settings.py
- services/agent/modules/oracle/ondo_usdy_oracle.py
- services/agent/modules/market_data/prices.py
- services/agent/modules/proposals/investment_planner.py
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract behavior changed
- frontend: no direct UI code changed, but backend price and proposal surfaces can now expose a real Ondo-derived USDY reference during Mantle Sepolia runs
- data quality: Sepolia USDY pricing can now follow the verified Mantle mainnet Ondo oracle instead of relying on manual mirror or fixed simulation fallback

Assumptions / unresolved verification items:

- the mainnet selector verification was performed against Mantle mainnet RPC and Ondo docs describing `getPrice()` and `getPriceData()`
- Mantle Sepolia still does not host code at the configured Ondo oracle address, so this remains a mirrored mainnet reference model rather than a native Sepolia oracle deployment
- the configured `SEPOLIA_METH_ADDRESS` is still a mock token in the current env and must be replaced before `mETH` can be treated as a real tracked asset
- backend and frontend tests, builds, lint, and formatting were not run in this turn

Commands not run:

- backend and frontend tests, builds, lint, and formatting were intentionally not run in this turn

### 2026-06-04

Type:
Feature / Native MNT wrap-first investment flow

Summary:

- made `MNT` the default deposit asset in the dashboard launcher, swap launcher, and trade flow
- exposed `native_mnt_enabled` and `sepolia_wmnt_address` through `/settings` so the frontend can verify whether native wrapping is configured
- changed the trade flow to wrap native `MNT` into `WMNT` in the connected wallet before creating the investment plan, instead of blocking `MNT` deposits outright
- updated the backend investment-plan steps so `MNT` plans explicitly include a wrap step and use ERC-20 `WMNT` swap execution rather than pretending the router will consume native value directly
- taught execution to submit an ERC-20 approval transaction when allowance is missing before sending the swap transaction
- updated scoped-price resolution so `MNT` can reuse `WMNT` pricing in investment-scope previews

Affected scope:

- frontend/src/pages/Index.tsx
- frontend/src/pages/Trade.tsx
- frontend/src/components/swap/SwapForm.tsx
- frontend/src/hooks/useSwap.ts
- frontend/src/lib/api/types.ts
- services/agent/app/api/settings.py
- services/agent/app/api/investment_scope.py
- services/agent/modules/proposals/investment_planner.py
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract bytecode changed, but the frontend now uses the deployed `WMNT` contract as the required wrap entrypoint before swap execution
- frontend: `MNT` is now the primary deposit path and the UI no longer treats it as a permanent blocker when wrapping is configured
- data quality: scoped previews and plan sequencing now align more closely with the actual `MNT -> WMNT -> swap` flow

Assumptions / unresolved verification items:

- the configured `SEPOLIA_WMNT_ADDRESS` must expose a standard payable `deposit()` method
- direct guarded execution is still limited by the repository's broader proposal and contract-execution architecture; this change specifically fixes the wrap-first deposit path
- backend and frontend tests, builds, lint, and formatting were not run in this turn

Commands not run:

- backend and frontend tests, builds, lint, and formatting were intentionally not run in this turn

### 2026-06-04

Type:
Fix / Wallet-scoped portfolio gating and Sepolia USDY mirrored pricing path

Summary:

- stopped the frontend from treating a disconnected but locally stored wallet address as an active portfolio scope, so dashboard and AI surfaces no longer keep querying wallet-scoped backend endpoints after disconnect
- removed the dashboard's explicit env-fallback reads for `/portfolio/current` and `/risk/current`, keeping wallet-required states visible instead of surfacing backend preview balances
- gated `/decisions` queries behind an active wallet and updated the AI side panel to show a connect-wallet state when no Mantle Sepolia wallet is connected
- added a Sepolia USDY mirrored-price path that prefers a configured direct `USDY_PYTH_FEED_ID`, falls back to an explicit `SEPOLIA_USDY_REFERENCE_PRICE_USD`, and only uses the old `$1` simulation fallback as the last resort

Affected scope:

- frontend/src/hooks/usePortfolioWallet.ts
- frontend/src/hooks/useDecisions.ts
- frontend/src/components/dashboard/AISidePanel.tsx
- frontend/src/pages/Index.tsx
- frontend/src/pages/Index.test.tsx
- services/agent/app/core/settings.py
- services/agent/.env.example
- services/agent/modules/market_data/prices.py
- services/agent/tests/unit/test_settings.py
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract behavior changed
- frontend: disconnecting a wallet now clears wallet-scoped analytics reads immediately, and the dashboard/AI panel no longer shows backend preview portfolio values as if they belonged to the user
- data quality: Sepolia USDY valuation can now follow a configured mirrored direct feed instead of always degrading to a generic `$1` fallback

Assumptions / unresolved verification items:

- `USDY_PYTH_FEED_ID` still needs a verified live feed id before Sepolia USDY can truly follow a live mirrored market source automatically
- `SEPOLIA_USDY_REFERENCE_PRICE_USD` is only a controlled fallback for testnet valuation; it does not replace a live mirrored feed
- backend and frontend tests, builds, lint, and formatting were not run in this turn

Commands not run:

- backend and frontend tests, builds, lint, and formatting were intentionally not run in this turn

### 2026-06-04

Type:
Config / Simulation runtime posture

Summary:

- updated the active service env to `RUNTIME_MODE=simulation` so the agent can run the AI reasoning and allocation surfaces without claiming live execution readiness
- aligned `.env.example` with the simulation posture and enabled AI reasoning by default for new local setups

Affected scope:

- services/agent/.env
- services/agent/.env.example
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract behavior changed
- frontend: no UI behavior changed directly, but the backend can now expose AI reasoning in simulation mode instead of monitor-only posture
- data quality: the service is still not live-execution ready, but the runtime posture now matches the intended simulation workflow

Assumptions / unresolved verification items:

- the running backend process still needs to be restarted to pick up the `.env` change
- live execution should remain disabled until quote, oracle, and approval paths are fully verified

Commands not run:

- backend and frontend tests, builds, lint, and formatting were intentionally not run in this turn

### 2026-06-03

Type:
Feature / Investment scope and Mantle Sepolia chain gating

Summary:

- added a persisted frontend investment scope so the user-entered deposit asset, deploy amount, risk profile, and allocation mode can be reused across Trade, the side launcher, and AI-facing analytics surfaces
- tightened wallet scoping so a connected wallet only counts for portfolio and planning when the active chain is Mantle Sepolia `5003`
- extended `/allocation/recommendation`, `/risk/current`, and `/decisions` with optional investment-scope parameters so they can return deposit-sized analysis instead of always analyzing the full connected wallet balance
- added backend synthetic portfolio builders for scoped allocation, scoped risk scoring, and scoped recommendation reasoning

Affected scope:

- frontend/src/hooks/useInvestmentScope.ts
- frontend/src/hooks/usePortfolioWallet.ts
- frontend/src/hooks/useAllocation.ts
- frontend/src/hooks/useRisk.ts
- frontend/src/hooks/useDecisions.ts
- frontend/src/lib/api/allocation.ts
- frontend/src/lib/api/risk.ts
- frontend/src/lib/api/decisions.ts
- frontend/src/lib/api/types.ts
- frontend/src/components/rwa/WalletScopeControl.tsx
- frontend/src/components/swap/SwapForm.tsx
- frontend/src/pages/Trade.tsx
- services/agent/app/api/investment_scope.py
- services/agent/app/api/allocation.py
- services/agent/app/api/risk.py
- services/agent/app/api/decisions.py
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract behavior changed
- frontend: the connected wallet is now chain-gated to Mantle Sepolia `5003`, and investment-analysis hooks can follow the user-entered deploy amount instead of defaulting to the entire wallet balance
- data quality: allocation, risk, and decision views can now reflect a scoped investment preview, but they still depend on current price and quote availability for the selected assets

Assumptions / unresolved verification items:

- scoped preview uses synthetic portfolio data derived from the selected deposit amount and current target weights; it is not a substitute for post-execution reconciliation
- quote freshness and route availability for scoped previews still depend on the same AGNI and market-data surfaces as the rest of the service
- backend and frontend tests, builds, lint, and formatting were not run in this turn

Commands not run:

- backend and frontend tests, builds, lint, and formatting were intentionally not run in this turn

### 2026-06-03

Type:
Feature / Sepolia status normalization and AI debug visibility

Summary:

- added `target_chain` to `/chain/status` so frontend chain diagnostics can render the active network without inferring it from separate status calls
- normalized Sepolia market, quote, and route responses so simulation-only or verification-gated testnet data no longer appears as degraded by default
- extended recommendation responses with structured `ai_debug` payloads containing the model prompt, raw output, parsed output, fallback reason, and AI override metadata
- updated the frontend AI side panel to render full prompt and output debug sections instead of only a truncated reasoning summary
- labeled the Settings environment card with explicit Mantle Sepolia or Mantle Mainnet network names

Affected scope:

- services/agent/app/api/chain.py
- services/agent/app/api/market.py
- services/agent/app/schemas/chain.py
- services/agent/app/schemas/recommendations.py
- services/agent/strategies/decision_templates/parser.py
- frontend/src/lib/api/types.ts
- frontend/src/components/dashboard/AISidePanel.tsx
- frontend/src/pages/SettingsPage.tsx
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract behavior changed
- frontend: the AI Planning or Intelligence side panel can now show prompt-and-output debug data directly, and Settings surfaces the active Mantle network more clearly
- data quality: Sepolia testnet responses no longer misleadingly present expected simulation-only data paths as degraded, while active-chain context is now explicit in chain diagnostics

Assumptions / unresolved verification items:

- quote and route endpoints intentionally stay permissive on Sepolia when live routes are absent or verification-gated; mainnet should continue treating the same conditions as degraded
- `ai_debug` is intended as application-owned debugging output, not hidden model chain-of-thought
- frontend and backend tests, builds, lint, and formatting were not run in this turn

Commands not run:

- backend and frontend tests, builds, lint, and formatting were intentionally not run in this turn

### 2026-06-03

Type:
Feature / Investment plan flow integration

Summary:

- added a deposit-aware investment plan builder behind `POST /proposals/create` that accepts deposit asset, amount, risk profile, allocation mode, and optional manual weights
- added backend plan detail responses with target allocations, guard checks, linked proposals, transaction steps, and embedded risk assessment data
- generalized quote-pair discovery for active chain assets and added best-route attempt lookup so AGNI quoter gas metadata can flow into the investment plan
- wired the frontend trade and approvals screens to consume backend proposal detail instead of relying only on locally inferred review state
- normalized proposal list and approval mutation responses to include `status_code`, `status_label`, and `status_reason`
- added database-backed `investment_plans` persistence so proposal review can survive backend restarts for newly created proposals
- added a configurable `SEPOLIA_USDC` asset path plus simulation-only stable pricing so Mantle Sepolia `USDC` can be supported when a verified address is supplied
- surfaced current repository blockers directly in the trade form for unsupported Mantle Sepolia deposit assets such as native `MNT`

Affected scope:

- services/agent/app/api/decisions.py
- services/agent/app/schemas/proposals.py
- services/agent/app/core/settings.py
- services/agent/modules/market_data/prices.py
- services/agent/modules/proposals/investment_planner.py
- services/agent/modules/quotes/service.py
- services/agent/repositories/db/investment_plan_repository.py
- services/agent/repositories/db/models.py
- services/agent/.env.example
- frontend/src/lib/api/market.ts
- frontend/src/lib/api/types.ts
- frontend/src/hooks/useSwap.ts
- frontend/src/pages/Trade.tsx
- frontend/src/pages/ApprovalsPage.tsx
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: proposal payload generation now carries a fuller guarded-execution review object, but native `MNT` wrap and unwrap execution remains unimplemented and veto-state reads remain address-level only
- frontend: trade and approvals now display backend-computed guard checks, allocation targets, gas metadata, proposal details, and transaction sequencing with less local inference
- data quality: proposal review now depends on persisted prices, live quotes, and live oracle state rather than only UI-derived assumptions, while liquidity depth remains inferred from live quote success instead of a strict 2x depth proof

Assumptions / unresolved verification items:

- proposal detail retrieval is persisted only for proposals created after this change; older proposals remain detail-incomplete
- Mantle Sepolia `USDC` now has a config path, but it still requires a real deployed token address in `SEPOLIA_USDC_ADDRESS`; native `MNT` deposit flow remains blocked by missing wrap and unwrap execution support
- Merchant Moe is still not part of the executable proposal path; AGNI is the only encoded execution route in the current implementation
- approval freshness is still advisory because allowance age is not yet read back from chain state

Commands not run:

- backend and frontend tests, builds, lint, and formatting were intentionally not run in this turn

### 2026-06-01

Type:
Fix / Active Sepolia asset filtering

Summary:

- added active-portfolio asset filtering so Mantle Sepolia balance reads only include `SEPOLIA_METH` and `SEPOLIA_USDY` when mock pricing is disabled
- removed lingering mock-token contamination from `/portfolio/current` and downstream risk scoring
- verified the filtered portfolio snapshot no longer reports `MOCK_TOKEN_A` or `MOCK_TOKEN_B` as unvalued positions in the active Sepolia flow
- moved Docker Postgres host exposure to `localhost:5433` to avoid conflict with an existing Windows Postgres process on `5432`
- kept Docker backend database access on the internal service address `postgres:5432`
- allowed explicit Sepolia simulation-only USDY prices to value portfolio positions while still rejecting ordinary stale or partial prices

Affected scope:

- docker-compose.yml
- services/agent/.env
- services/agent/app/core/settings.py
- services/agent/app/api/portfolio.py
- services/agent/modules/market_data/balances.py
- services/agent/tests/unit/test_settings.py
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract behavior changed
- frontend: dashboard, allocation, trade, and approvals surfaces now reflect the active Sepolia pair without stale mock-token positions
- data quality: risk vetoes now reflect only the actual active assets instead of a mixed real-plus-mock registry, and Sepolia simulation prices are explicit rather than treated as live oracle data

Assumptions / unresolved verification items:

- live Sepolia balance reads and route discovery still depend on the local machine being allowed to reach the configured Mantle RPC and Hermes endpoints
- mock-token registry entries remain available for explicit mock mode, but they are no longer part of the active portfolio path when mock pricing is off
- host-side Postgres clients should use `localhost:5433`; backend containers should continue using `postgres:5432`

Commands executed:

- `npm run build`
- `npm run test -- --run src/components/layout/TopBar.test.tsx src/components/layout/AppSidebar.test.tsx`
- transient local checks against `http://127.0.0.1:5173/{route}` and backend endpoints under `http://127.0.0.1:8000/`
- `docker compose up -d --force-recreate postgres backend`
- direct Postgres checks from host and backend container

### 2026-05-31

Type:
Fix / Allocation profile compatibility

Summary:

- added a canonical `Sepolia Test` allocation profile for the current Mantle Sepolia `USDY`/`mETH` flow
- normalized allocation profile names before API validation and rebalance computation so stale or aliased profile names do not crash `/decisions`
- added unit coverage for the Sepolia profile acceptance path
- aligned the Sepolia quote and asset registry path to use the real test `USDY`/`mETH` pair instead of the retired mock-token pair
- made Sepolia `$1` USDY fallback explicitly simulation-only and contingent on `simulation_fallback_enabled`

Affected scope:

- services/agent/strategies/allocation/profiles.py
- services/agent/strategies/allocation/rebalance.py
- services/agent/app/api/allocation.py
- services/agent/app/api/decisions.py
- services/agent/app/core/settings.py
- services/agent/modules/market_data/prices.py
- services/agent/modules/quotes/service.py
- services/agent/tests/unit/test_allocation.py
- services/agent/tests/unit/test_quote_service.py
- services/agent/tests/unit/test_settings.py
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract behavior changed
- frontend: `/decisions` and allocation profile updates no longer fail when the runtime is configured for the Sepolia test profile
- data quality: no fabricated market data added; this only aligns allocation-profile naming with the current Sepolia asset set

Assumptions / unresolved verification items:

- `Sepolia Test` is treated as a deterministic 50/50 `USDY` and `mETH` basket for the current testnet flow
- any persisted historical decisions using the old mock-token profile remain separate and are not migrated by this change

Commands not run:

- unit and integration tests were not executed in this turn
### 2026-05-29

Type:
Fix / Environment alignment

Summary:

- synced backend local Sepolia runtime env with the deployed contract addresses and mock validation token addresses already present in `contracts/.env`
- added frontend local env defaults so the Vite app calls the local FastAPI service during full-flow testing
- normalized risk-scorer timestamp age calculations to tolerate DB-loaded naive timestamps and service-generated UTC-aware timestamps
- relaxed the portfolio integration smoke expectation so configured Sepolia balance probes can return the correct degraded partial state instead of only the unconfigured missing state

Affected scope:

- frontend/.env.local
- services/agent/.env
- services/agent/risk/scoring/score_engine.py
- services/agent/tests/integration/test_portfolio.py
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no contract behavior changed; backend reads now point at the configured Mantle Sepolia deployment
- frontend: local dev server can call the backend without relying on implicit Vite defaults
- data quality: Sepolia mock assets remain explicit simulation-only inputs, and partial portfolio states remain degraded rather than treated as complete

Assumptions / unresolved verification items:

- live Sepolia RPC calls still depend on the configured endpoint being reachable from the local machine
- PostgreSQL is not provisioned locally, so tests fall back to in-memory SQLite for persistence paths
- Privy remains optional for local unauthenticated UI testing unless `VITE_PRIVY_APP_ID` is configured

Commands executed:

- `.\.venv\Scripts\python.exe -m unittest discover services.agent.tests -v`
- `npm run test`
- `npm run build`

### 2026-05-29

Type:
Feature / Test integration

Summary:

- added wallet-aware query parameters to portfolio, risk, allocation, decision, and snapshot read paths so frontend tests can target a connected wallet without rewriting backend env
- added Mantle Sepolia validation assets for the deployed mock tokens, with explicit simulation-only fixed prices for local end-to-end testing
- enabled Sepolia AGNI mock-token route discovery while keeping live quote amount decoding verification-gated
- added settings for Docker test allocation profile selection and Sepolia mock asset configuration
- persisted price bundles during portfolio reads so allocation/risk paths can consume the same generated test snapshots
- fixed the Pyth Hermes parser to match feed IDs with or without a `0x` prefix

Affected scope:

- services/agent/.env.example
- services/agent/.env.docker.test
- services/agent/app/api/allocation.py
- services/agent/app/api/decisions.py
- services/agent/app/api/market.py
- services/agent/app/api/portfolio.py
- services/agent/app/api/risk.py
- services/agent/app/core/settings.py
- services/agent/modules/market_data/balances.py
- services/agent/modules/market_data/prices.py
- services/agent/modules/oracle/pyth_parser.py
- services/agent/modules/quotes/agni_discovery.py
- services/agent/modules/quotes/service.py
- services/agent/strategies/allocation/profiles.py
- services/agent/tests/unit/test_pyth_parser.py

Impact:

- smart contracts: no execution behavior changed; Sepolia mock-token reads now align with the deployed validation contracts
- frontend: portfolio/risk/allocation can now follow the wallet selected in the UI through query parameters
- data quality: mock-token prices are explicitly labeled simulation-only and do not replace verified mainnet oracle/quote validation

Assumptions / unresolved verification items:

- AGNI QuoterV2 amount-out decoding remains verification-gated, so quote routes may be discoverable while quote amounts remain unknown
- Sepolia mock prices are for end-to-end testing only and must not be used as live market data
- production wallet ownership verification still requires signed-message auth before user portfolios are treated as authenticated

Commands executed:

- `python -c "from services.agent.app.main import app; print('backend import ok')"`
- `python -m unittest services.agent.tests.unit.test_settings services.agent.tests.unit.test_allocation services.agent.tests.unit.test_portfolio_snapshot services.agent.tests.unit.test_pyth_parser -v`

### 2026-05-25

Type:
Feature / Safety hardening

Summary:

- completed the local-safe Phase 4 and Phase 5 coding path
- removed mock portfolio fallback from allocation and decisioning surfaces; missing vault, price, or chain data now returns a missing portfolio snapshot and pauses allocation
- hardened rebalance generation so missing portfolio data, zero portfolio value, and missing position prices do not produce trade actions
- fixed proposal creation by importing `MarketDataRepository`, requiring the requested proposal action to match the current deterministic rebalance plan, requiring real configured token/router/vault addresses, rejecting missing price snapshots, removing fallback calldata hashes, and enforcing `PolicyGuard`
- made AI reasoning settings-driven and disabled by default, with deterministic fallback explanations as the safe baseline
- added Phase 4 and Phase 5 execution docs

Affected scope:

- docs/ai-data-analytics/Phase4.md
- docs/ai-data-analytics/Phase5.md
- docs/ai-data-analytics/README.md
- docs/ai-data-analytics/Changes.md
- services/agent/.env.example
- services/agent/app/api/allocation.py
- services/agent/app/api/decisions.py
- services/agent/app/core/settings.py
- services/agent/modules/market_data/balances.py
- services/agent/strategies/allocation/rebalance.py
- services/agent/strategies/decision_templates/parser.py

Impact:

- smart contracts: proposal payload creation is now policy-gated and no longer uses fallback calldata hashes or fallback addresses
- frontend: allocation and decision endpoints remain stable but now surface conservative pause/hold behavior when data is missing
- data quality: allocation and AI reasoning no longer depend on fabricated portfolio values or hardcoded market prices

Assumptions / unresolved verification items:

- successful proposal creation still requires configured vault/router/token addresses plus fresh persisted USDC and mETH price snapshots
- live quote-depth and slippage validation remain Phase 1B dependent
- production-grade AI request/response persistence can be expanded later, but deterministic fallback is complete and safe for local operation

Commands to run after this change:

- `python -m unittest services.agent.tests.unit.test_allocation services.agent.tests.unit.test_ai_fallback services.agent.tests.integration.test_portfolio_endpoints -v`
- `python -m unittest discover services.agent.tests -v`

### 2026-05-24

Type:
Feature

Summary:

- completed the local-safe Phase 3 deterministic risk engine target with weighted bucket scoring and restrictive status escalation
- added best-effort PostgreSQL persistence for risk assessments
- added `GET /risk/assessments` and `GET /risk/assessments/latest`
- expanded risk tests to cover weighted scores and persisted assessment read surfaces

Affected scope:

- docs/ai-data-analytics/Phase3.md
- docs/ai-data-analytics/Changes.md
- services/agent/app/api/risk.py
- services/agent/app/schemas/__init__.py
- services/agent/app/schemas/risk.py
- services/agent/repositories/db/models.py
- services/agent/repositories/db/risk_repository.py
- services/agent/risk/engine.py
- services/agent/tests/integration/test_risk.py
- services/agent/tests/unit/test_risk_engine.py

Impact:

- smart contracts: no execution approval behavior added; risk remains advisory and conservative
- frontend: risk center can consume current, latest, and recent assessment surfaces with stable bucket metadata
- data quality: hard vetoes and restrictive statuses remain explicit, with no optimistic approval when quote/oracle validation is missing

Assumptions / unresolved verification items:

- quote-depth liquidity scoring still requires Phase 1B live AGNI and Merchant Moe quote validation
- mainnet oracle trust scoring still requires verified Ondo and Pyth live reads
- Phase 4 allocation should consume `recommended_action`, `risk_score`, `hard_veto_status`, and bucket reasons as deterministic gates

Commands to run after this change:

- `python -m unittest services.agent.tests.unit.test_risk_engine services.agent.tests.integration.test_risk -v`
- `docker compose restart backend`
- `curl http://localhost:8000/risk/current`
- `curl http://localhost:8000/risk/assessments`

### 2026-05-24

Type:
Feature

Summary:

- started Phase 3 with a deterministic risk-engine plan and first local-safe implementation slice
- added risk response schemas with required action, score, confidence, hard-veto status, human-approval status, and bucket breakdowns
- added a deterministic risk engine that hard-vetoes missing or unvalued portfolio data and blocks execution-facing recommendations while quote validation is missing
- exposed `GET /risk/current`
- added Phase 3 risk scenario fixtures and focused risk tests

Affected scope:

- docs/ai-data-analytics/Phase3.md
- docs/ai-data-analytics/README.md
- docs/ai-data-analytics/Changes.md
- services/agent/app/api/__init__.py
- services/agent/app/api/risk.py
- services/agent/app/main.py
- services/agent/app/schemas/__init__.py
- services/agent/app/schemas/risk.py
- services/agent/risk/__init__.py
- services/agent/risk/engine.py
- services/agent/tests/integration/test_risk.py
- services/agent/tests/scenarios/risk_missing_portfolio.json
- services/agent/tests/scenarios/risk_normal_fixture.json
- services/agent/tests/scenarios/risk_quote_gated.json
- services/agent/tests/unit/test_risk_engine.py

Impact:

- smart contracts: no execution approvals or proposals are emitted; risk output is advisory and explicitly blocks execution-facing recommendations when hard vetoes or missing quote validation exist
- frontend: can consume `/risk/current` for risk center and dashboard status, including bucket-level reasons and hard-veto state
- data quality: missing portfolio data, unvalued positions, and Phase 1B quote gaps become visible risk states instead of optimistic recommendations

Assumptions / unresolved verification items:

- quote-depth liquidity scoring remains deferred until Phase 1B validates live AGNI and Merchant Moe quote decoding
- mainnet/fork oracle trust scoring remains deferred until Ondo and Pyth live paths are verified
- AI-authored explanations and allocation policy integration remain later phases

Commands to run after this change:

- `python -m unittest services.agent.tests.unit.test_risk_engine services.agent.tests.integration.test_risk -v`
- `docker compose restart backend`
- `curl http://localhost:8000/risk/current`

### 2026-05-24

Type:
Feature

Summary:

- completed the local-safe Phase 2 portfolio analytics target with target-weight drift fields, best-effort portfolio snapshot persistence, and historical read APIs
- added `GET /portfolio/snapshots` and `GET /portfolio/snapshots/latest`
- added PostgreSQL `portfolio_snapshots` storage and repository mapping
- added complete, partial, and missing portfolio scenario fixtures for later risk and allocation phases

Affected scope:

- services/agent/.env.example
- services/agent/app/core/settings.py
- services/agent/app/api/portfolio.py
- services/agent/app/schemas/__init__.py
- services/agent/app/schemas/portfolio.py
- services/agent/modules/market_data/balances.py
- services/agent/repositories/db/models.py
- services/agent/repositories/db/portfolio_repository.py
- services/agent/tests/integration/test_portfolio.py
- services/agent/tests/scenarios/portfolio_complete.json
- services/agent/tests/scenarios/portfolio_missing.json
- services/agent/tests/scenarios/portfolio_partial.json
- services/agent/tests/unit/test_portfolio_snapshot.py
- docs/ai-data-analytics/Phase2.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: still read-only; no execution proposal or signing behavior added
- frontend: portfolio dashboard can consume current, recent, and latest persisted snapshot surfaces with explicit empty/degraded states
- data quality: target drift is computed only from valued positions, unvalued positions remain visible, and route-depth/slippage fields stay null until Phase 1B quote validation is complete

Assumptions / unresolved verification items:

- local-safe Phase 2 is complete, but live portfolio quality still depends on configured wallet/vault addresses and verified active-chain asset addresses
- route-depth and slippage enrichment remains blocked on Phase 1B live quote validation
- richer historical pagination can be added later if frontend requirements exceed the current latest/recent surfaces

Commands to run after this change:

- `python -m unittest services.agent.tests.unit.test_portfolio_snapshot services.agent.tests.integration.test_portfolio -v`
- `docker compose restart backend`
- `curl http://localhost:8000/portfolio/current`
- `curl http://localhost:8000/portfolio/snapshots`

### 2026-05-24

Type:
Feature

Summary:

- continued Phase 2 by adding an ERC-20 balance-read boundary for configured portfolio addresses
- wired `/portfolio/current` to attempt balance reads for verified assets on the active chain when `PORTFOLIO_WALLET_ADDRESS` or `EXECUTOR_VAULT_ADDRESS` is configured
- preserved fail-safe behavior by returning `DATA_MISSING` when no balance source exists and keeping failed token reads as visible unvalued positions
- updated Phase 2 documentation with current behavior and next implementation slices

Affected scope:

- services/agent/app/api/portfolio.py
- services/agent/app/schemas/portfolio.py
- services/agent/modules/market_data/__init__.py
- services/agent/modules/market_data/balances.py
- services/agent/tests/unit/test_portfolio_snapshot.py
- docs/ai-data-analytics/Phase2.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: no execution behavior added; the endpoint can use configured vault addresses as read-only balance targets
- frontend: `/portfolio/current` can now progress from empty degraded state to partial/valued positions when a portfolio address and verified asset addresses are available
- data quality: failed balance reads remain explicit and do not create synthetic balances or values

Assumptions / unresolved verification items:

- active-chain asset coverage still depends on verified asset addresses in settings
- Mantle Sepolia is expected to remain mostly degraded because real RWA asset surfaces are not available there
- historical portfolio persistence and allocation drift metrics remain pending Phase 2 work

Commands executed:

- `python -m unittest services.agent.tests.unit.test_portfolio_snapshot services.agent.tests.integration.test_portfolio -v`

### 2026-05-23

Type:
Feature

Summary:

- started Phase 2 with a dedicated portfolio analytics plan and the first safe implementation slice
- added typed portfolio balance, position, and current snapshot schemas
- added a deterministic portfolio snapshot engine that values supplied balances from fresh price snapshots and marks missing or unpriced inputs as degraded
- exposed `GET /portfolio/current` as a stable Phase 2 API surface that returns `DATA_MISSING` instead of inventing balances when no portfolio address or balance source is configured

Affected scope:

- docs/ai-data-analytics/Phase2.md
- docs/ai-data-analytics/README.md
- docs/ai-data-analytics/Changes.md
- services/agent/.env.example
- services/agent/app/core/settings.py
- services/agent/app/api/__init__.py
- services/agent/app/api/portfolio.py
- services/agent/app/main.py
- services/agent/app/schemas/__init__.py
- services/agent/app/schemas/portfolio.py
- services/agent/modules/market_data/balances.py
- services/agent/tests/integration/test_portfolio.py
- services/agent/tests/unit/test_portfolio_snapshot.py

Impact:

- smart contracts: no execution-facing behavior added; configured executor vault can be used as portfolio metadata later, but no on-chain balance reads are claimed yet
- frontend: can begin integrating a stable `/portfolio/current` response shape, including empty/degraded state handling
- data quality: portfolio analytics now fail safely when balances or prices are unavailable, preserving Phase 1 degraded-data semantics

Assumptions / unresolved verification items:

- live wallet or vault balance reads are not implemented in this slice
- historical portfolio snapshot persistence is still pending
- allocation drift, route-depth impact, and target-delta analytics remain later Phase 2 work
- strict Phase 1B mainnet or mainnet-fork validation is still required before live market-derived portfolio decisions can be trusted

Commands executed:

- `python -m unittest services.agent.tests.unit.test_portfolio_snapshot services.agent.tests.integration.test_portfolio -v`

### 2026-05-23

Type:
Validation / Documentation

Summary:

- recorded Phase 1 as Sepolia scaffold complete while keeping strict mainnet or mainnet-fork market validation pending
- added PostgreSQL to Docker Compose for local persistence validation and confirmed safe read endpoints can execute against the running backend
- hardened `/chain/status` so unavailable or invalid RPC configuration returns structured degraded data instead of an HTTP 500
- changed blank QuickNode defaults so local Sepolia runs fall back to the public Mantle Sepolia RPC unless real QuickNode URLs are explicitly configured

Affected scope:

- docker-compose.yml
- services/agent/.env.example
- services/agent/app/api/chain.py
- services/agent/app/schemas/chain.py
- services/agent/tests/integration/test_chain.py
- docs/ai-data-analytics/Phase1.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: contract metadata endpoints remain usable without deployed Sepolia addresses, while deployed-state reads stay null until addresses are configured
- frontend: `/chain/status` and market endpoints now expose stable degraded responses that can be rendered without treating expected Sepolia gaps as crashes
- data quality: Sepolia missing-market-data behavior is explicitly documented and does not substitute WETH, mocks, or candidate addresses for mETH, USDY, AGNI, or Merchant Moe validation

Assumptions / unresolved verification items:

- strict Phase 1 remains pending until Mantle mainnet or a mainnet fork validates Ondo USDY oracle reads, Pyth ETH/USD fetches, AGNI quotes, Merchant Moe quotes, and PostgreSQL write/read round trips
- real QuickNode endpoints are optional for local Sepolia RPC status and should be configured only when available
- AGNI Sepolia addresses remain candidate-only and Merchant Moe/Ondo remain mainnet-only unless independently verified

Commands executed:

- `docker compose config`
- local-safe HTTP GET checks against `/health`, `/status`, `/chain/status`, `/contracts`, `/market/ingestion/status`, `/market/prices/latest`, `/market/oracles/usdy`, `/market/routes`, and quote endpoints
- `python -m unittest services.agent.tests.integration.test_chain -v`

### 2026-05-22

Type:
Feature

Summary:

- aligned the Phase 1 config baseline with the locked Mantle mainnet integration spec for Ondo, Merchant Moe, AGNI, and Pyth ETH/USD
- added an explicit Ondo USDY oracle adapter and status surface plus split AGNI and Merchant Moe route discovery into dedicated modules instead of leaving everything inside one quote service placeholder
- added a shared versioned Mantle config file under `packages/config/src/mantle.ts` and extended market APIs with `/market/oracles/usdy` while keeping live quote decoding verification-gated instead of fabricating outputs

Affected scope:

- packages/config/src/mantle.ts
- services/agent/app/core/settings.py
- services/agent/app/api/market.py
- services/agent/app/schemas/oracle.py
- services/agent/app/schemas/quotes.py
- services/agent/modules/oracle/ondo_usdy_oracle.py
- services/agent/modules/oracle/__init__.py
- services/agent/modules/market_data/prices.py
- services/agent/modules/quotes/agni_discovery.py
- services/agent/modules/quotes/agni_quotes.py
- services/agent/modules/quotes/merchant_moe_discovery.py
- services/agent/modules/quotes/merchant_moe_quotes.py
- services/agent/modules/quotes/service.py
- services/agent/modules/quotes/__init__.py
- services/agent/.env.example
- services/agent/tests/integration/test_market.py
- services/agent/tests/unit/test_ondo_usdy_oracle.py
- docs/ai-data-analytics/Phase1.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: backend route metadata now maps more cleanly to the off-chain discovery versus on-chain enforcement split, with routers and route families surfaced without pretending execution calldata is ready
- frontend: market surfaces now include an explicit USDY oracle status endpoint and route descriptors can carry discovered pool addresses and verification state
- data quality: verified Mantle mainnet addresses and the ETH/USD feed are now first-class defaults, while selector and quote-decoding gaps remain explicit degraded states instead of hidden assumptions

Assumptions / unresolved verification items:

- Ondo oracle selector and ABI method still require primary-source verification before live USDY oracle reads can be marked trusted
- AGNI QuoterV2 decoding and Merchant Moe live quote decoding are still verification-gated, so discovered routes do not yet imply executable quote amounts
- tests were updated but not executed in this turn

Commands the user still needs to run:

- install the Python dependencies if they are not already present
- provision PostgreSQL and set `DATABASE_URL`
- run the updated agent unit and integration tests
- verify the Ondo selector plus AGNI and Merchant Moe quote call shapes before claiming live-quote completeness

### 2026-05-21

Type:
Feature

Summary:

- added PostgreSQL-backed market-data persistence using SQLAlchemy models, session wiring, and a repository for price and quote snapshots
- introduced a config-driven Ondo USDY oracle client plus quote route discovery, ranking, route caching, and `/market/quotes/latest`, `/market/quotes/{token_in}/{token_out}`, `/market/quotes/{token_in}/{token_out}/best`, and `/market/routes` APIs
- made market API persistence best-effort while keeping ingestion jobs persistence-aware, so the service can still expose degraded read surfaces before PostgreSQL or live quote methods are fully verified

Affected scope:

- services/agent/repositories/db/models.py
- services/agent/repositories/db/session.py
- services/agent/repositories/db/market_repository.py
- services/agent/modules/oracle/ondo_client.py
- services/agent/modules/market_data/*
- services/agent/modules/quotes/*
- services/agent/app/api/market.py
- services/agent/app/core/settings.py
- services/agent/app/schemas/quotes.py
- services/agent/jobs/ingest_prices.py
- services/agent/jobs/sample_quotes.py
- services/agent/.env.example
- services/agent/requirements.txt
- services/agent/pyproject.toml
- services/agent/tests/integration/test_market.py
- services/agent/tests/unit/test_quote_ranking.py

Impact:

- smart contracts: backend now tracks the configured router surfaces and route identifiers that later proposal-generation logic can bind to contract-approved execution paths
- frontend: market APIs now expose quote and route surfaces in addition to prices, with explicit `DATA_MISSING` and `LIQUIDITY_UNKNOWN` degraded states
- data quality: USDY can use a config-driven Ondo oracle path without inventing a Pyth feed, while quote sampling remains fail-closed until exact AGNI and Merchant Moe read methods are verified

Assumptions / unresolved verification items:

- Ondo oracle method selector and final feed IDs still need verification before live USDY pricing is trusted end-to-end
- AGNI and Merchant Moe quote methods are still represented as discovery and persistence scaffolding; live calldata and amount-out reads are not implemented yet
- tests were added and updated but not executed in this turn

Commands the user still needs to run:

- install the new Python dependencies for SQLAlchemy and psycopg
- provision PostgreSQL and set `DATABASE_URL`
- verify the Ondo oracle selector and live feed IDs before relying on mainnet market outputs

### 2026-05-21

Type:
Feature

Summary:

- started Phase 1 with market-data settings, asset registry wiring, Hermes/Pyth parsing, freshness evaluation, and initial `/market` API surfaces
- added a price-ingestion service that derives mETH from ETH/USD plus ratio feeds when needed and keeps USDY explicitly unimplemented until Ondo oracle integration lands
- added Phase 1 job and test scaffolding while keeping quote discovery and PostgreSQL persistence deferred to the next implementation slice

Affected scope:

- services/agent/app/api/market.py
- services/agent/app/core/settings.py
- services/agent/app/schemas/market_data.py
- services/agent/app/schemas/oracle.py
- services/agent/app/schemas/quotes.py
- services/agent/modules/oracle/*
- services/agent/modules/market_data/*
- services/agent/modules/quotes/*
- services/agent/jobs/ingest_prices.py
- services/agent/jobs/sample_quotes.py
- services/agent/tests/unit/test_freshness.py
- services/agent/tests/integration/test_market.py
- services/agent/.env.example
- services/agent/pyproject.toml

Impact:

- smart contracts: no direct contract integration change yet, but the service now has the first market-data layer that later proposal generation can depend on
- frontend: adds initial `/market/prices/latest`, `/market/prices/{asset_symbol}`, and `/market/ingestion/status` surfaces with explicit degraded and missing-data states
- data quality: mETH pricing can use direct or derived Pyth inputs without inventing values, and USDY remains explicitly unavailable until the locked Ondo oracle path is implemented

Assumptions / unresolved verification items:

- the Hermes endpoint shape is implemented defensively, but still needs live verification against the configured feed IDs
- PostgreSQL-backed persistence, Ondo USDY oracle integration, and DEX quote sampling are not implemented in this slice yet
- tests were added but not executed in this turn

Commands the user still needs to run:

- run the new unit and integration tests for freshness and market endpoints
- verify the configured Hermes feed IDs and observe `/market/prices/latest` against your environment

### 2026-05-21

Type:
Feature

Summary:

- initialized the Phase 0 service scaffold with modular FastAPI routers, typed schemas, centralized status-code enums, and environment-driven runtime configuration
- added logging configuration with global and per-subsystem controls plus locked freshness thresholds and PostgreSQL settings placeholders
- created repository, risk, strategy, simulation, and integration-test skeletons to support Phase 1 without reopening the app structure

Affected scope:

- services/agent/app/main.py
- services/agent/app/api/*
- services/agent/app/core/settings.py
- services/agent/app/core/logging.py
- services/agent/app/core/status_codes.py
- services/agent/app/schemas/*
- services/agent/repositories/*
- services/agent/risk/__init__.py
- services/agent/strategies/__init__.py
- services/agent/simulations/__init__.py
- services/agent/tests/integration/test_health.py
- services/agent/tests/unit/test_settings.py
- services/agent/.env.example
- services/agent/pyproject.toml

Impact:

- smart contracts: contract-read endpoints now sit behind a cleaner app boundary that can absorb proposal and execution status vocabulary later
- frontend: `/health` and `/status` now have a stable Phase 0 contract with `status_code`, runtime mode, logging, contract configuration, and freshness metadata
- data quality: locked freshness thresholds and status enums are now represented in code instead of only in planning docs

Assumptions / unresolved verification items:

- placeholder repository modules do not yet implement PostgreSQL models or sessions; Phase 1 still needs concrete storage code
- baseline tests were added but not executed in this turn

Commands the user still needs to run:

- run the agent unit and integration tests after confirming the local Python environment is ready
- start the FastAPI service and verify `/health`, `/status`, `/contracts`, and `/chain/status` against your configured environment

### 2026-05-21

Type:
Docs

Summary:

- locked the final Phase 0 decisions for pricing strategy, freshness thresholds, status codes, database layout, and logging behavior
- expanded `recommendation_model.md` into the authoritative runtime and recommendation contract for coding work
- updated `Phase0.md` so bootstrap implementation explicitly depends on the locked pricing, freshness, and status-code rules

Affected scope:

- docs/ai-data-analytics/recommendation_model.md
- docs/ai-data-analytics/Phase0.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: aligns backend proposal and execution vocabulary with a fixed shared `status_code` catalog before deeper integration
- frontend: locks machine-readable statuses and human-facing status metadata early enough for UI contracts
- data quality: prevents Phase 1 pricing and freshness logic from drifting away from the agreed oracle-plus-market model

Assumptions / unresolved verification items:

- the decisions are now locked, but exact live integration values such as final addresses and feed identifiers still need primary-source verification during implementation
- PostgreSQL is the chosen storage direction, but the concrete migration or ORM layer still needs to be implemented in code

Commands the user still needs to run:

- none for this documentation-only update unless you want to start the Phase 0 code implementation next

### 2026-05-21

Type:
Docs

Summary:

- added `recommendation_model.md` as the canonical Phase 0 decision contract for runtime mode, status shape, error format, logging policy, and recommendation output fields
- recorded the user's locked Phase 0 decisions and separated them from the remaining pricing and freshness research items
- updated the AI docs index to include the recommendation model document

Affected scope:

- docs/ai-data-analytics/recommendation_model.md
- docs/ai-data-analytics/README.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: clarifies the runtime and status vocabulary the backend should expose before proposal-generation flows expand
- frontend: gives a stable baseline for status, error, and recommendation payload expectations
- data quality: keeps pricing-source selection and freshness tuning explicitly open for research instead of hardcoding weak assumptions

Assumptions / unresolved verification items:

- pricing-source selection still requires primary-source-backed research before being treated as final
- exact freshness thresholds and the final error-code catalog still need to be locked during implementation

Commands the user still needs to run:

- none for this documentation-only update unless you want to start implementing the Phase 0 code changes next

### 2026-05-21

Type:
Docs

Summary:

- added `Phase1.md` as the detailed execution guide for market and oracle ingestion
- defined concrete Phase 1 workstreams for configuration, schemas, oracle parsing, quote sampling, persistence, jobs, APIs, and testing
- updated the AI docs index to include the new Phase 1 document

Affected scope:

- docs/ai-data-analytics/Phase1.md
- docs/ai-data-analytics/README.md
- docs/ai-data-analytics/Changes.md

Impact:

- smart contracts: clarifies which off-chain quote and oracle surfaces must exist before proposal or execution payload work can be trusted
- frontend: defines the minimum market-data and ingestion-status read surfaces later screens can depend on
- data quality: makes freshness, verification, persistence, and failure-state requirements explicit before portfolio and risk logic begin

Assumptions / unresolved verification items:

- final Pyth feed IDs and several Sepolia asset addresses remain verification-sensitive and are intentionally left config-driven or `TODO_VERIFY`
- persistence may begin behind a repository abstraction even if the first concrete adapter is file-backed before PostgreSQL is fully wired

Commands the user still needs to run:

- none for this documentation-only update unless you want to break Phase 1 into implementation tickets

### 2026-05-21

Type:
Docs

Summary:

- replaced the misnamed AI implementation plan file with `ImplementationPlan.md`
- expanded the AI implementation plan into a fuller phase-by-phase delivery document
- added a dedicated `Phase0.md` execution plan covering bootstrap scope, workstreams, acceptance, and sequencing
- updated the AI docs index to include the new Phase 0 document

Affected scope:

- docs/ai-data-analytics/ImplementationPlan.md
- docs/ai-data-analytics/Phase0.md
- docs/ai-data-analytics/README.md

Impact:

- smart contracts: clarifies the contract-facing dependencies and payload vocabulary the AI service expects during bootstrap
- frontend: makes the expected API, schema, freshness, and degraded-state planning more explicit before screen integration
- data quality: defines provenance, freshness, and safe-failure expectations earlier in the build plan

Assumptions / unresolved verification items:

- the repo should standardize on `ImplementationPlan.md` as the canonical AI planning filename going forward
- service code has not yet been fully scaffolded to match the target Phase 0 structure and still needs implementation work

Commands the user still needs to run:

- none for this documentation-only update unless you want to review or link these docs elsewhere

### 2026-05-21

Type:
Feature

Summary:

- connected the Python backend to all core contract Foundry ABIs through a reusable registry
- added backend contract metadata endpoints and read-only state snapshots for configured core contracts
- expanded unit coverage for ABI loading helpers beyond the single PauseGuardian case

Affected scope:

- services/agent/modules/contracts/project_contracts.py
- services/agent/modules/contracts/reader.py
- services/agent/app/main.py
- services/agent/tests/unit/test_foundry_artifacts.py

Impact:

- smart contracts: Python now consumes the existing compiled ABIs for `PauseGuardian`, `TradeApprovalManager`, and `ExecutorVault` without duplicating interface definitions
- frontend: backend can now serve contract metadata and configured-address state through `/contracts` and `/contracts/{contract_key}`
- data quality: contract reads stay tied to Foundry artifacts and configured addresses instead of hardcoded Python-side ABIs

Assumptions / unresolved verification items:

- contract artifacts under `contracts/out` are current for the deployed contracts configured in the service environment
- `TradeApprovalManager` currently exposes no stable zero-argument state getter beyond address-level metadata, so its snapshot is intentionally minimal

Commands the user still needs to run:

- run the Python unit tests for `services/agent/tests/unit/test_foundry_artifacts.py`
- start the FastAPI service and verify `/contracts`, `/contracts/pause_guardian`, and `/chain/status` against your configured Mantle RPC and deployed addresses

### 2026-05-11

Type:
Documentation bootstrap

Summary:

- created AI + Data Analytics service documentation set
- added `setup.md`
- added `ImplementationPlan.md`
- added `Changes.md`

Affected scope:

- docs only

Impact:

- establishes the working documentation baseline for the AI + Data Analytics owner

## Future Entry Template

```text
### YYYY-MM-DD

Type:
Feature | Refactor | Data model | Risk model | Docs | Breaking change

Summary:

- item 1
- item 2

Affected scope:

- services/agent/...
- data/...

Impact:

- smart contracts:
- frontend:
- data quality:
```

### 2026-06-06

Type:
Feature

Summary:

- changed the dashboard and trade flow to deploy the connected wallet balance instead of seeding a fixed `100` amount
- blocked AI auto-launch until a positive wallet balance is known, so the UI no longer acts on stale scope data
- switched the default allocation profile on Sepolia to `Sepolia Test` and made Sepolia scoped planners strip `USDC` from risk-profile baskets before renormalizing

Affected scope:

- frontend/src/pages/Index.tsx
- frontend/src/pages/Trade.tsx
- services/agent/app/core/settings.py
- services/agent/app/api/allocation.py
- services/agent/app/api/decisions.py
- services/agent/app/api/investment_scope.py
- services/agent/modules/proposals/investment_planner.py
- services/agent/strategies/allocation/profiles.py
- services/agent/tests/unit/test_settings.py
- services/agent/tests/unit/test_allocation.py
- frontend/src/pages/Index.test.tsx

Impact:

- frontend: the amount fields now resolve from the wallet/portfolio snapshot instead of prompting for more MNT
- allocation: the default target basket on Sepolia is USDY/mETH only, and scoped risk profiles on Sepolia are renormalized to remove USDC entirely
- data quality: the AI scope stays empty until the wallet balance is known, which prevents stale 100-sized scopes from being used

Assumptions / unresolved verification items:

- I did not run the frontend or Python test suites in this turn
- if you want a different Sepolia allocation basket, change `allocation_profile_name` explicitly in the environment instead of relying on the new default

Commands the user still needs to run:

- run the frontend test file for the dashboard flow
- run the Python unit tests for the settings and allocation paths
