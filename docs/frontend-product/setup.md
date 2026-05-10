# Frontend + Product Service Setup

## Purpose

This document explains how to set up the Frontend + Product service for AIxRWA.

This service owns:

- landing page
- dashboard
- wallet UX
- allocation studio
- risk center
- approval center
- charts, alerts, and observability screens
- responsive behavior and demo polish

## Target Workspace

The frontend service should primarily live in:

```text
/apps/web
|-- app/
|-- components/
|-- features/
|-- hooks/
|-- lib/
|-- styles/
`-- public/
```

Optional shared workspace:

```text
/packages
|-- sdk/
|-- shared-types/
`-- ui/
```

## Recommended Tooling

- Next.js
- TypeScript
- React
- Tailwind CSS or minimal custom design system
- `wagmi` and `viem` for wallet and chain interaction
- TanStack Query for API state
- charting library such as Recharts or ECharts

## Prerequisites

Install the following:

- Node.js 20+
- npm, pnpm, or yarn
- access to the backend API
- access to Mantle wallet test environment

## Install Dependencies

If the web app has not been initialized yet:

```powershell
npx create-next-app@latest apps/web --ts --app --eslint --src-dir false
```

From the repo root or `apps/web`:

```powershell
npm install next react react-dom
npm install wagmi viem @tanstack/react-query
npm install recharts
npm install clsx tailwind-merge
npm install -D tailwindcss postcss autoprefixer typescript @types/node @types/react @types/react-dom
```

## Environment Variables

Create a `.env.local` for frontend development.

Suggested variables:

```env
NEXT_PUBLIC_APP_ENV=local
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_CHAIN_ID=5003
NEXT_PUBLIC_MANTLE_MAINNET_CHAIN_ID=5000
NEXT_PUBLIC_MANTLE_SEPOLIA_CHAIN_ID=5003
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=replace_if_used
NEXT_PUBLIC_PYTH_MAINNET_CONTRACT=0xA2aa501b19aff244D90cc15a4Cf739D2725B5729
NEXT_PUBLIC_PYTH_SEPOLIA_CONTRACT=0x98046Bd286715D3B0BC227Dd7a956b83D8978603
```

Rules:

- all frontend-exposed values must be intentionally public
- private keys and sensitive secrets never belong in frontend env files
- label live vs simulated environments clearly in the UI

## Suggested Service Layout

```text
/apps/web
|-- app/
|   |-- layout.tsx
|   |-- page.tsx
|   |-- dashboard/
|   |-- allocation/
|   |-- risk/
|   |-- approvals/
|   `-- strategy-lab/
|-- components/
|   |-- layout/
|   |-- charts/
|   |-- status/
|   |-- wallet/
|   `-- shared/
|-- features/
|   |-- landing/
|   |-- portfolio/
|   |-- allocation/
|   |-- risk/
|   |-- approvals/
|   `-- alerts/
|-- hooks/
|   |-- usePortfolio.ts
|   |-- useRisk.ts
|   |-- useAllocation.ts
|   `-- useWalletState.ts
|-- lib/
|   |-- api/
|   |-- chains/
|   |-- format/
|   `-- constants/
|-- styles/
|   |-- globals.css
|   `-- tokens.css
`-- public/
```

## First Local Commands

Install dependencies:

```powershell
npm install
```

Run local development server:

```powershell
npm run dev
```

Build test:

```powershell
npm run build
```

## Local Development Flow

1. Set up app shell and routing.
2. Add design tokens and layout system.
3. Integrate API client and wallet layer.
4. Build dashboard and risk views with mock data first.
5. Replace mock data with live backend APIs.
6. Add approval flow and strategy lab.
7. Polish mobile and demo paths last.

## Setup Acceptance Checklist

- app boots locally
- env vars load correctly
- wallet connection can initialize
- backend API base URL is configured
- build passes
- Mantle network config is available in the client

## Notes

- Desktop is the primary surface.
- Mobile should support viewing and basic approvals.
- The UI must make automation status and risk state obvious at all times.
