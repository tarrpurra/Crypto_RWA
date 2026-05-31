# AIxRWA Frontend

Vite + React + TypeScript dashboard for the AIxRWA RWA agent.

## Stack

- React 18
- React Router
- TanStack Query
- Tailwind + shadcn/ui

## Environment

Create `frontend/.env.local` or `frontend/.env` with:

```bash
VITE_API_BASE_URL=http://localhost:8000
# Optional when backend auth is enforced
# VITE_API_TOKEN=your_bearer_token
# Optional frontend log level: debug | info | warn | error | silent
# VITE_LOG_LEVEL=debug
```

## Local Run

```bash
npm install
npm run dev
```

Default dev server: `http://localhost:8080`

## Quality Commands

```bash
npm run lint
npm run test
npm run build
```

## Phase 1 Routes

- `/` dashboard
- `/portfolio`
- `/risk`
- `/allocation`
- `/market`
- `/approvals`
- `/settings`

The current phase replaces the previous trading app shell with the RWA agent shell. Phase 2 will replace the remaining legacy API client with typed RWA API modules.
