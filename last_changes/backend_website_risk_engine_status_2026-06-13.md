# Backend, Website, Risk Engine, and Team Plan - 2026-06-13

## Summary

The current app route decision is now the consolidated control-flow model:

- `/trade` redirects to `/decision-log`
- `/approvals` redirects to `/decision-log`
- `/allocation` redirects to `/strategy-lab`
- `/strategy-lab` renders `StrategyStudio`
- `/ai-command` redirects to `/dashboard`

Backend risk-engine and DB-hardening work is present in the codebase. The focused backend risk/DB unit slice passed in the prior verification run. Frontend build still needs to be rerun after the conflict resolution to verify the new route state end to end.

## Current Worktree Status

Observed from `git status --short`:

- Dirty submodules remain: `contracts/lib/forge-std` and `contracts/lib/openzeppelin-contracts`.
- `last_changes/` is untracked and contains this status report.
- `plan.txt` is untracked and contains the current owner-level task notes.
- Untracked design/planning artifacts remain at the repo root and under `docs/ai-data-analytics`.
- No tracked frontend/backend source file is currently listed as conflicted.

## Website Status

Current `frontend/src/App.tsx` state:

- The merge conflict is resolved.
- The app uses `defaultTheme="light"`.
- Dashboard routes are wrapped with `DashboardLayout`.
- `DecisionLog` is the consolidated place for trade/proposal/approval flow.
- `StrategyStudio` is now the strategy-lab page.

Remaining website risks:

- `frontend/src/lib/wagmi.ts` still hardcodes `projectId = "00000000000000000000000000000000"`. This should be replaced with `VITE_WALLETCONNECT_PROJECT_ID` or explicitly marked as demo-only.
- `useDashboardSummary()` only fetches when an effective wallet address exists, even though the backend can serve `/dashboard/summary` without a wallet address.
- `StrategyStudio` contains mostly hardcoded strategy/backtest metrics and should either be wired to backend data or labeled as demo content.
- The frontend build was not rerun in this update. Required verification command:

```powershell
cd frontend
npm run build
```

## Backend Current Status

Current backend service shape:

- FastAPI entrypoint: `services/agent/app/main.py`
- Active routers include health, chain, contracts, dashboard, market, reports, portfolio, risk, allocation, decisions, settings, and vault.
- Dashboard summary is snapshot-first through `/dashboard/summary`.
- Portfolio and risk current endpoints prefer persisted snapshots unless forced to refresh.
- Persistence is SQLAlchemy-based and still relies on `create_all()` plus startup column sync.
- Non-test DB connection failure does not silently fall back to in-memory SQLite.

Recent backend changes present:

- `investment_plans` has first-class invested-capital fields: `deposit_asset_symbol`, `deposit_amount`, `deposit_value_usd`.
- `portfolio_snapshots` has capital/time-series fields: `invested_amount_usd`, `total_deposits_usd`, `total_withdrawals_usd`, `pnl_usd`, `pnl_percent`.
- Symbol normalization exists for placeholder variants like `TOKEN_A`, `TOKEN_B`, `MOCK_TOKEN_A`, and `MOCK_TOKEN_B`.
- Risk responses expose normalized score/confidence fields and score scale metadata.

Backend shortcomings still open:

- No Alembic migration framework yet.
- New DB columns still need historical backfill.
- Critical data is still heavily stored in JSON blobs.
- There is no canonical asset identity table.
- There is no shared `run_id` or `context_id` linking price, quote, portfolio, risk, allocation, and proposal records.
- Composite indexes for dashboard/history queries are still missing.

## Risk Engine Status

Primary implementation:

- `services/agent/risk/engine.py`
- Compatibility adapter: `services/agent/risk/scoring/score_engine.py`
- API surface: `services/agent/app/api/risk.py`
- Risk schemas: `services/agent/app/schemas/risk.py`

How it works:

- The engine evaluates a portfolio using deterministic buckets.
- Base buckets are `portfolio_valuation`, `quote_availability`, `concentration_drift`, `ops_readiness`, and `data_quality`.
- Market-context buckets are added when available: `oracle_freshness`, `usdy_depeg`, and `liquidity_slippage`.
- Bucket scores are weighted, then the final operational status can be escalated by restrictive bucket status.
- Any hard veto forces risk score `100.0`, `RISK_VETO`, and recommended action `pause`.
- Missing quote validation usually produces `RISK_REBALANCE_ONLY` and recommended action `rebalance_only`.
- Fresh portfolio plus fresh quote validation can produce `RISK_NORMAL`.

Required output fields are preserved:

- `asset`
- `recommended_action`
- `risk_score`
- `confidence`
- `reasoning_summary`
- `data_sources_used`
- `hard_veto_status`
- `required_human_approval_status`

Important nuance:

- `risk_score` is a normalized numeric severity score on a `0..100` scale where higher is worse.
- `risk_band` can be stricter than the numeric band when a bucket status requires operational restriction.
- The UI should explain this as "score severity" versus "operational guard state" to avoid confusion.

Last focused backend verification:

```powershell
.\.venv\Scripts\python.exe -m unittest services.agent.tests.unit.test_risk_engine services.agent.tests.unit.test_db_normalization -v
```

Result from prior run:

- 6 tests passed.
- `pytest` was not installed in `.venv`, so the check used `unittest`.

## Known Risk / Dashboard Consistency Issue

`docs/ai-data-analytics/CurrentGuardrailsStatus.md` records a current mismatch that still needs live re-checking:

- Persisted dashboard summary risk: `RISK_CAUTION`, score `16.25`, hard veto inactive.
- Fresh allocation recommendation: `RISK_VETO`, recommended action `PAUSE`.

Likely cause:

- Dashboard is reading persisted snapshot-first state.
- Allocation is evaluating fresh live state.

Required fix:

- Either refresh stale persisted risk before dashboard display or clearly expose snapshot source/freshness so the UI does not present stale risk as the active guard state.

## Breaking Changes / Current Blockers

1. Frontend build must be rerun after merge resolution.
2. WalletConnect project ID is hardcoded and should not ship as production config.
3. Risk/dashboard/allocation status mismatch needs a live API re-check and then a backend policy fix.
4. DB schema evolution still needs Alembic migrations.
5. Existing rows need backfill for capital, P&L, and invested amount fields.
6. Strategy page needs real backend wiring or explicit demo labeling.
7. Full swap flow needs browser/wallet testing after build passes.
8. Dirty contract submodules need intentional cleanup or confirmation that they are expected.

## Team Task Plan From `plan.txt`

### Garvin

- Clean up code.
- Run the full flow once end to end.
- Confirm swaps are successfully executing.
- Fix portfolio capital-over-time, invested amount, and P&L display after the schema change.
- Add a dummy token or fixture path if needed to validate the portfolio capital/P&L flow.
- Add or polish the new Risk page UI.
- Add or polish the new Decision page UI.

### Anuska

- Complete the Strategic / Strategy page.
- Coordinate with Garvin if implementation help is needed.
- Update the landing page text after Aagam provides the copy.

### Aagam

- Provide the final landing page text/copy.
- Confirm the intended messaging for the landing page before Anuska updates it.

### Unassigned / Engineering Lead

- Decide whether `StrategyStudio` should use live backend data now or remain demo-only for the current milestone.
- Decide whether `useDashboardSummary()` should fetch without a wallet for global/persisted status.
- Own Alembic migration setup and DB backfill plan.
- Own risk-status consistency policy between dashboard, `/risk/current`, and allocation.
- Own final build/test signoff before demo.

## Development Checklist

### Immediate

- [x] Resolve `frontend/src/App.tsx` merge conflict.
- [ ] Run `npm run build` from `frontend`.
- [ ] Fix any build/type errors that appear after route resolution.
- [ ] Replace hardcoded WalletConnect project ID with env-driven config.
- [ ] Confirm `/decision-log` route fully replaces standalone `/trade` and `/approvals` in navigation, tests, and docs.

### Backend / Risk

- [ ] Re-check live `/dashboard/summary`, `/risk/current`, and `/allocation/recommendation` for the same wallet.
- [ ] Fix stale persisted risk display or mark it clearly as stale/snapshot-only.
- [ ] Add tests for score-band versus operational-status escalation.
- [ ] Add explicit UI/API wording for numeric severity versus guard state.
- [ ] Keep proposals blocked when data is stale, missing, or risk state is mismatched.

### Database

- [ ] Add Alembic.
- [ ] Convert startup schema sync into migrations.
- [ ] Backfill `investment_plans` capital columns from `plan_json`.
- [ ] Backfill `portfolio_snapshots` P&L/capital fields where possible.
- [ ] Add canonical `assets` table.
- [ ] Add dashboard/history composite indexes.
- [ ] Add a shared context identifier across market, portfolio, risk, allocation, and proposal records.

### Website / Product

- [ ] Verify dashboard empty state with no wallet.
- [ ] Verify dashboard state with wallet but no persisted snapshots.
- [ ] Verify Decision Log create-plan, approve, wrap MNT, execute, reject, and activity-log flows.
- [ ] Finish StrategyStudio or label placeholder metrics as demo-only.
- [ ] Update landing copy from Aagam.
- [ ] Update tests that reference old route assumptions.

## Commands Run For This Update

```powershell
git status --short
rg --files -g '*plan*' -g '*Plan*' -g '*PLAN*'
rg <conflict-marker-pattern> -n frontend\src services\agent docs last_changes
Get-Content .\plan.txt
Get-Content .\frontend\src\App.tsx
Get-Content .\frontend\src\lib\wagmi.ts
```

Commands not rerun in this update:

- `npm run build`
- Python unit tests
- live backend API checks

These should be run next when command execution for build/test verification is approved.
