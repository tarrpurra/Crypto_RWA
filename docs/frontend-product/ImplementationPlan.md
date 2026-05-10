# Frontend + Product Service Implementation Plan

## Service Mission

The Frontend + Product service is the user-facing system for AIxRWA.

Its job is to:

- explain the product clearly
- show portfolio and risk state in real time
- present AI recommendations in a trustworthy way
- support approvals and operator actions
- make live vs simulated states obvious

## Owned Deliverables

- landing page
- dashboard
- allocation studio
- risk center
- approvals center
- strategy lab
- alerts and observability screens
- wallet integration

## Product Principles

- clarity before novelty
- every action must show context
- risk must be visible before approval
- status labels must be unambiguous
- no hidden automation
- demo path must be fast and reliable

## Proposed Folder Structure

```text
/apps/web
|-- app/
|   |-- layout.tsx
|   |-- page.tsx
|   |-- dashboard/
|   |   `-- page.tsx
|   |-- allocation/
|   |   `-- page.tsx
|   |-- risk/
|   |   `-- page.tsx
|   |-- approvals/
|   |   `-- page.tsx
|   `-- strategy-lab/
|       `-- page.tsx
|-- components/
|   |-- layout/
|   |   |-- AppShell.tsx
|   |   |-- Sidebar.tsx
|   |   `-- Topbar.tsx
|   |-- charts/
|   |   |-- AllocationChart.tsx
|   |   |-- RiskBreakdownChart.tsx
|   |   `-- PerformanceChart.tsx
|   |-- status/
|   |   |-- RiskBadge.tsx
|   |   |-- AlertBanner.tsx
|   |   `-- HealthPill.tsx
|   |-- wallet/
|   |   |-- ConnectWalletButton.tsx
|   |   `-- NetworkGuard.tsx
|   `-- shared/
|       |-- DataCard.tsx
|       |-- EmptyState.tsx
|       `-- SectionHeader.tsx
|-- features/
|   |-- landing/
|   |-- portfolio/
|   |-- allocation/
|   |-- risk/
|   |-- approvals/
|   |-- strategy-lab/
|   `-- alerts/
|-- hooks/
|   |-- usePortfolio.ts
|   |-- useRisk.ts
|   |-- useAllocation.ts
|   |-- useApprovals.ts
|   `-- useWalletState.ts
|-- lib/
|   |-- api/
|   |   |-- client.ts
|   |   |-- portfolio.ts
|   |   |-- risk.ts
|   |   |-- allocation.ts
|   |   `-- approvals.ts
|   |-- chains/
|   |   `-- mantle.ts
|   |-- constants/
|   `-- format/
|-- styles/
|   |-- globals.css
|   `-- tokens.css
`-- public/
```

## Phase-Wise Implementation

### Phase 0: Product Shell

Goal:
Create the base application shell, routing, and design system foundation.

Tasks:

- initialize Next.js app
- build app shell layout
- define typography, spacing, and color tokens
- add navigation and route structure

Deliverables:

- bootable web app
- shared layout system
- route skeletons for all major screens

Acceptance:

- app runs locally
- all main routes render
- design tokens are centralized

### Phase 1: Landing Page

Goal:
Explain AIxRWA clearly and establish trust fast.

Tasks:

- build hero and product narrative
- show how the strategy works
- add asset and safety sections
- add CTA into dashboard or simulation flow

Deliverables:

- complete landing page
- product messaging for judges and users

Acceptance:

- a new visitor can understand the product in under one minute
- live product links are visible

### Phase 2: Dashboard and Core Data Screens

Goal:
Build the main monitoring surface using mock data first, then live APIs.

Tasks:

- build dashboard cards and charts
- build risk center views
- build allocation overview
- add loading, error, and empty states

Deliverables:

- dashboard
- risk screen
- allocation summary screen

Acceptance:

- data screens work with mock state
- screens remain usable during partial API failures

### Phase 3: Wallet and Approval UX

Goal:
Connect the user to the system and expose approval workflows.

Tasks:

- add wallet connect
- show chain status and wallet context
- build approvals queue
- show proposal details and execution state

Deliverables:

- wallet UX
- approvals center
- transaction status handling

Acceptance:

- user can connect wallet and view context
- proposal details are understandable before approval
- execution results are visible in the UI

### Phase 4: Strategy Lab and Demo Flows

Goal:
Make the product explainable and demo-ready.

Tasks:

- build backtest and replay views
- add AI vs manual comparison
- add scenario switching for depeg and pause events
- label live vs replay mode clearly

Deliverables:

- strategy lab
- benchmark comparison screen
- replay mode

Acceptance:

- at least three demo scenarios are viewable
- judges can understand system behavior without reading raw logs

### Phase 5: Observability and Alerting UI

Goal:
Expose system health and operational confidence.

Tasks:

- add alerts panel
- add system health badges
- add risk event timeline
- add operator-focused status components

Deliverables:

- alerts UI
- observability widgets
- system health indicators

Acceptance:

- critical alerts are visible
- stale or degraded state is obvious
- operator can see whether the system is in live or simulation-only mode

### Phase 6: Visual Polish and Hardening

Goal:
Improve trust, clarity, and demo smoothness.

Tasks:

- polish responsiveness
- refine typography and chart readability
- improve state transitions
- optimize key pages for performance

Deliverables:

- polished product UI
- cleaner chart and card system
- stable demo path

Acceptance:

- build passes
- pages are performant enough for demo use
- major user flows are visually consistent

## Integration Expectations

From AI + Data Analytics:

- stable APIs for portfolio, risk, allocation, and backtests
- clear schema for decision and proposal payloads

From Smart Contracts:

- deployed addresses
- ABI exports
- event names and execution statuses

## Required UI States

Every critical page should support:

- loading
- empty
- partial data
- stale data
- degraded mode
- error
- simulation-only mode

## Definition of Done

The Frontend + Product service is complete for MVP when:

- the landing page explains the product clearly
- the dashboard shows real or near-real portfolio state
- the risk center exposes score, buckets, and alerts
- the approvals center shows proposal lifecycle clearly
- the strategy lab demonstrates normal and stressed scenarios
- wallet UX and responsive behavior are stable
