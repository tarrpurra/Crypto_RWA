# Frontend + Product Service Changes

## Purpose

Track meaningful changes to the Frontend + Product service.

## Format

For each entry, record:

- date
- author
- type
- summary
- affected files or modules
- impact on AI/data analytics, contracts, or UX

## Change Log

### 2026-05-29

Type:
Feature / UX

Summary:

- added a wallet scope control for local frontend testing without requiring Privy configuration
- wired portfolio, risk, and allocation API calls to pass the selected or connected wallet address through `wallet_address`
- added shared wallet-scope state backed by localStorage and Privy wallet data when available
- aligned active RWA auth token storage with the API client key

Affected scope:

- frontend/src/components/auth/AuthProvider.tsx
- frontend/src/components/auth/LoginButton.tsx
- frontend/src/components/auth/AuthProvider.test.tsx
- frontend/src/components/rwa/WalletScopeControl.tsx
- frontend/src/hooks/usePortfolioWallet.ts
- frontend/src/hooks/usePortfolio.ts
- frontend/src/hooks/useRisk.ts
- frontend/src/hooks/useAllocation.ts
- frontend/src/lib/api/portfolio.ts
- frontend/src/lib/api/risk.ts
- frontend/src/lib/api/allocation.ts
- frontend/src/pages/Index.tsx
- frontend/src/pages/Portfolio.tsx

Impact:

- AI/data analytics: frontend can now exercise wallet-aware backend read paths during end-to-end testing
- contracts: no direct contract writes added; UI remains read/advisory
- UX: local testers can paste a wallet address and see dashboard/portfolio/risk/allocation refresh for that wallet

Verification:

- `npm run build` passed in `frontend`.

### 2026-05-11

Type:
Documentation bootstrap

Summary:

- created Frontend + Product service documentation set
- added `setup.md`
- added `ImplementationPlan.md`
- added `Changes.md`

Affected scope:

- docs only

Impact:

- establishes the working documentation baseline for the Frontend + Product owner

## Future Entry Template

```text
### YYYY-MM-DD

Type:
Feature | Refactor | UX | Docs | Breaking change

Summary:

- item 1
- item 2

Affected scope:

- apps/web/...
- packages/ui/...

Impact:

- AI/data analytics:
- contracts:
- UX:
```
# 2026-05-27 - Phase 1 frontend shell conversion

## Summary

- Repointed the existing `frontend` Vite app from the previous trading dashboard shell to the AIxRWA RWA agent shell.
- Added RWA routes for dashboard, portfolio, risk, allocation, market, approvals, and settings.
- Updated visible app branding, route metadata, browser metadata, logger prefix, and README.
- Left legacy trading modules disconnected but still present for a later cleanup/API migration phase.

## Files Changed

- `frontend/src/App.tsx`
- `frontend/src/components/layout/AppSidebar.tsx`
- `frontend/src/components/layout/TopBar.tsx`
- `frontend/src/components/layout/routeMeta.ts`
- `frontend/src/components/layout/DashboardLayout.tsx`
- `frontend/src/components/rwa/PageScaffold.tsx`
- `frontend/src/pages/Index.tsx`
- `frontend/src/pages/Portfolio.tsx`
- `frontend/src/pages/RiskCenter.tsx`
- `frontend/src/pages/AllocationStudio.tsx`
- `frontend/src/pages/MarketData.tsx`
- `frontend/src/pages/Approvals.tsx`
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/pages/NotFound.tsx`
- `frontend/src/lib/logger.ts`
- `frontend/index.html`
- `frontend/README.md`

## Notes

- This phase intentionally keeps the working Vite app instead of migrating to the planned `apps/web` Next.js layout.
- RWA API wiring is deferred to the next phase.
- Existing legacy tests still reference old trading pages and should be replaced during frontend test cleanup.

# 2026-05-27 - Phase 2 RWA API wiring

## Summary

- Added typed frontend API modules for system, chain, portfolio, risk, allocation, and market endpoints.
- Added TanStack Query hooks for the active RWA backend surfaces.
- Wired dashboard, portfolio, risk center, allocation, market page, and sidebar status cards to live backend responses.
- Preserved explicit `ok`, `degraded`, and blocked UI tones instead of substituting fake values when data is missing.
- Added the frontend service to Docker Compose and added a Node 20 frontend Dockerfile target.

## Files Changed

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `frontend/src/lib/api/client.ts`
- `frontend/src/lib/api/types.ts`
- `frontend/src/lib/api/system.ts`
- `frontend/src/lib/api/portfolio.ts`
- `frontend/src/lib/api/risk.ts`
- `frontend/src/lib/api/allocation.ts`
- `frontend/src/lib/api/market.ts`
- `frontend/src/lib/api/index.ts`
- `frontend/src/hooks/useSystem.ts`
- `frontend/src/hooks/usePortfolio.ts`
- `frontend/src/hooks/useRisk.ts`
- `frontend/src/hooks/useAllocation.ts`
- `frontend/src/hooks/useMarket.ts`
- `frontend/src/components/layout/AppSidebar.tsx`
- `frontend/src/components/rwa/PageScaffold.tsx`
- `frontend/src/pages/Index.tsx`
- `frontend/src/pages/Portfolio.tsx`
- `frontend/src/pages/RiskCenter.tsx`
- `frontend/src/pages/AllocationStudio.tsx`
- `frontend/src/pages/MarketData.tsx`

## Verification

- `npm run build` passed in `frontend`.

## Notes

- Legacy `frontend/src/lib/api.ts` and old trading hooks/pages remain on disk for now, but active RWA routes no longer depend on them.
- Existing tests still target the old trading UI and need replacement before `npm run test` can be used as a reliable signal.

# 2026-05-27 - Phase 3 core dashboard completion

## Summary

- Expanded the dashboard from route placeholders into a live RWA agent operating surface.
- Added readiness checks for API health, chain RPC, portfolio valuation, risk gate, and market ingestion.
- Added decision context for recommendation state and human approval requirements.
- Improved settings diagnostics with live `/status`, `/health`, `/chain/status`, and configured contract visibility.
- Replaced stale Pacifica shell tests with RWA shell/dashboard tests and removed obsolete trading-route tests.

## Files Changed

- `frontend/src/pages/Index.tsx`
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/pages/Index.test.tsx`
- `frontend/src/components/layout/AppSidebar.test.tsx`
- `frontend/src/components/layout/DashboardLayout.test.tsx`
- `frontend/src/components/layout/TopBar.test.tsx`
- removed obsolete tests for disconnected trading pages and hooks

## Verification

- `npm run build` passed in `frontend`.
- `npm run test` passed in `frontend`: 6 test files, 11 tests.

## Notes

- The dashboard intentionally renders missing/degraded states directly from the backend instead of inventing portfolio values or market data.
- Remaining future frontend phases are deeper page polish, wallet/approval actions, and strategy lab/backtest surfaces.
