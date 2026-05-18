# Full File Structure

## Purpose

This document defines the full target repository structure for AIxRWA.

It combines the structure proposed in:

- `docs/MasterPlan.md`
- `docs/smart-contract/ImplementationPlan.md`
- `docs/ai-data-analytics/ImplementationPlan.md`
- `docs/frontend-product/ImplementationPlan.md`

This is the canonical structure to follow when scaffolding the actual codebase.

## Structure Goals

- keep ownership boundaries clear
- separate frontend, AI/data, and smart contract concerns
- centralize shared config, ABIs, and types
- keep infra and documentation explicit
- make the repo easy to scale after MVP

## Ownership Map

- `apps/web`: Frontend + Product ownership
- `services/agent`: AI + Data Analytics ownership
- `contracts`: Smart Contract ownership
- `packages`: shared code used across services
- `infra`: deployment, monitoring, and local environment support
- `docs`: planning, service documentation, and research

## Full Target Repository Tree

```text
/
|-- README.md
|-- .gitignore
|-- .env.example
|-- package.json
|-- docs/
|   |-- MasterPlan.md
|   |-- FileStructure.md
|   |-- research/
|   |   |-- deep-research-report.md
|   |   |-- aix_rwa_difficulty_assessment.html
|   |   |-- Mantle_AIxRWA_Hackathon_Guide.pdf
|   |   |-- Hackathon-grade RWA Yield Guardian on Mantle.pdf
|   |   `-- Hackathon-grade RWA Yield Guardian on Mantle-1.pdf
|   |-- smart-contract/
|   |   |-- README.md
|   |   |-- setup.md
|   |   |-- ImplementationPlan.md
|   |   `-- Changes.md
|   |-- ai-data-analytics/
|   |   |-- README.md
|   |   |-- setup.md
|   |   |-- ImplementationPlan.md
|   |   `-- Changes.md
|   `-- frontend-product/
|       |-- README.md
|       |-- setup.md
|       |-- ImplementationPlan.md
|       `-- Changes.md
|-- apps/
|   `-- web/
|       |-- package.json
|       |-- next.config.ts
|       |-- tsconfig.json
|       |-- postcss.config.js
|       |-- tailwind.config.ts
|       |-- .env.local.example
|       |-- app/
|       |   |-- layout.tsx
|       |   |-- page.tsx
|       |   |-- dashboard/
|       |   |   `-- page.tsx
|       |   |-- allocation/
|       |   |   `-- page.tsx
|       |   |-- risk/
|       |   |   `-- page.tsx
|       |   |-- approvals/
|       |   |   `-- page.tsx
|       |   `-- strategy-lab/
|       |       `-- page.tsx
|       |-- components/
|       |   |-- layout/
|       |   |   |-- AppShell.tsx
|       |   |   |-- Sidebar.tsx
|       |   |   `-- Topbar.tsx
|       |   |-- charts/
|       |   |   |-- AllocationChart.tsx
|       |   |   |-- RiskBreakdownChart.tsx
|       |   |   `-- PerformanceChart.tsx
|       |   |-- status/
|       |   |   |-- RiskBadge.tsx
|       |   |   |-- AlertBanner.tsx
|       |   |   `-- HealthPill.tsx
|       |   |-- wallet/
|       |   |   |-- ConnectWalletButton.tsx
|       |   |   `-- NetworkGuard.tsx
|       |   `-- shared/
|       |       |-- DataCard.tsx
|       |       |-- EmptyState.tsx
|       |       `-- SectionHeader.tsx
|       |-- features/
|       |   |-- landing/
|       |   |-- portfolio/
|       |   |-- allocation/
|       |   |-- risk/
|       |   |-- approvals/
|       |   |-- strategy-lab/
|       |   `-- alerts/
|       |-- hooks/
|       |   |-- usePortfolio.ts
|       |   |-- useRisk.ts
|       |   |-- useAllocation.ts
|       |   |-- useApprovals.ts
|       |   `-- useWalletState.ts
|       |-- lib/
|       |   |-- api/
|       |   |   |-- client.ts
|       |   |   |-- portfolio.ts
|       |   |   |-- risk.ts
|       |   |   |-- allocation.ts
|       |   |   `-- approvals.ts
|       |   |-- chains/
|       |   |   `-- mantle.ts
|       |   |-- constants/
|       |   `-- format/
|       |-- styles/
|       |   |-- globals.css
|       |   `-- tokens.css
|       `-- public/
|-- services/
|   |-- agent/
|   |   |-- pyproject.toml
|   |   |-- requirements.txt
|   |   |-- .env.example
|   |   |-- app/
|   |   |   |-- main.py
|   |   |   |-- api/
|   |   |   |   |-- portfolio.py
|   |   |   |   |-- risk.py
|   |   |   |   |-- allocation.py
|   |   |   |   |-- decisions.py
|   |   |   |   `-- backtests.py
|   |   |   |-- core/
|   |   |   |   |-- config.py
|   |   |   |   |-- logging.py
|   |   |   |   `-- settings.py
|   |   |   `-- schemas/
|   |   |       |-- portfolio.py
|   |   |       |-- risk.py
|   |   |       |-- allocation.py
|   |   |       `-- proposals.py
|   |   |-- modules/
|   |   |   |-- market_data/
|   |   |   |   |-- balances.py
|   |   |   |   |-- prices.py
|   |   |   |   `-- snapshots.py
|   |   |   |-- oracle/
|   |   |   |   |-- hermes_client.py
|   |   |   |   |-- pyth_parser.py
|   |   |   |   `-- freshness.py
|   |   |   |-- quotes/
|   |   |   |   |-- agni_quotes.py
|   |   |   |   |-- merchant_moe_quotes.py
|   |   |   |   `-- route_ranker.py
|   |   |   |-- proposals/
|   |   |   |   |-- builder.py
|   |   |   |   `-- validator.py
|   |   |   `-- alerts/
|   |   |       |-- notifier.py
|   |   |       `-- thresholds.py
|   |   |-- strategies/
|   |   |   |-- allocation/
|   |   |   |   |-- profiles.py
|   |   |   |   |-- rebalance.py
|   |   |   |   `-- clip_sizing.py
|   |   |   `-- decision_templates/
|   |   |       |-- prompt_builder.py
|   |   |       |-- parser.py
|   |   |       `-- fallback_rules.py
|   |   |-- risk/
|   |   |   |-- buckets/
|   |   |   |   |-- depeg.py
|   |   |   |   |-- liquidity.py
|   |   |   |   |-- oracle.py
|   |   |   |   |-- concentration.py
|   |   |   |   `-- ops.py
|   |   |   |-- scoring/
|   |   |   |   |-- weights.py
|   |   |   |   `-- score_engine.py
|   |   |   `-- guards/
|   |   |       |-- trade_guard.py
|   |   |       `-- policy_guard.py
|   |   |-- simulations/
|   |   |   |-- backtests/
|   |   |   |   |-- engine.py
|   |   |   |   `-- metrics.py
|   |   |   |-- stress/
|   |   |   |   |-- depeg_scenario.py
|   |   |   |   |-- stale_oracle_scenario.py
|   |   |   |   `-- liquidity_shock_scenario.py
|   |   |   `-- benchmarks/
|   |   |       |-- hold_usdy.py
|   |   |       |-- static_basket.py
|   |   |       `-- guardian_strategy.py
|   |   |-- repositories/
|   |   |   |-- db/
|   |   |   |   |-- models.py
|   |   |   |   |-- session.py
|   |   |   |   `-- migrations/
|   |   |   `-- cache/
|   |   |       `-- redis_client.py
|   |   |-- jobs/
|   |   |   |-- ingest_prices.py
|   |   |   |-- sample_quotes.py
|   |   |   |-- compute_risk.py
|   |   |   `-- publish_snapshots.py
|   |   `-- tests/
|   |       |-- unit/
|   |       |-- integration/
|   |       `-- scenarios/
|   `-- indexer/
|       |-- README.md
|       |-- app/
|       |-- jobs/
|       `-- tests/
|-- contracts/
|   |-- foundry.toml
|   |-- .env.example
|   |-- src/
|   |   |-- core/
|   |   |   |-- ExecutorVault.sol
|   |   |   |-- TradeApprovalManager.sol
|   |   |   `-- PauseGuardian.sol
|   |   |-- identity/
|   |   |   |-- AgentIdentity721.sol
|   |   |   `-- AgentIdentity8004.sol
|   |   |-- interfaces/
|   |   |   |-- IERC20.sol
|   |   |   |-- IAgniSwapRouter.sol
|   |   |   |-- IAgniQuoterV2.sol
|   |   |   |-- IMerchantMoeRouter.sol
|   |   |   |-- IMerchantMoeLBRouter.sol
|   |   |   |-- IMerchantMoeAggregatorRouter.sol
|   |   |   `-- IPyth.sol
|   |   |-- libraries/
|   |   |   |-- Errors.sol
|   |   |   |-- Events.sol
|   |   |   |-- Roles.sol
|   |   |   |-- ExecutionTypes.sol
|   |   |   `-- ProposalHashLib.sol
|   |   `-- mocks/
|   |       |-- MockERC20.sol
|   |       |-- MockPyth.sol
|   |       `-- MockRouter.sol
|   |-- script/
|   |   |-- DeploySepolia.s.sol
|   |   |-- DeployMainnet.s.sol
|   |   `-- ConfigureRouters.s.sol
|   |-- test/
|   |   |-- unit/
|   |   |   |-- ExecutorVault.t.sol
|   |   |   |-- TradeApprovalManager.t.sol
|   |   |   `-- PauseGuardian.t.sol
|   |   |-- integration/
|   |   |   |-- ProposalExecutionFlow.t.sol
|   |   |   |-- PauseAndRecoveryFlow.t.sol
|   |   |   `-- RouterWhitelistFlow.t.sol
|   |   `-- mocks/
|   |       `-- MockSetup.sol
|   `-- lib/
|-- packages/
|   |-- abis/
|   |   |-- agni/
|   |   |-- merchant-moe/
|   |   |-- pyth/
|   |   `-- aixrwa/
|   |-- config/
|   |   |-- chains/
|   |   |-- addresses/
|   |   |-- risk/
|   |   `-- env/
|   |-- sdk/
|   |   |-- src/
|   |   |   |-- api/
|   |   |   |-- contracts/
|   |   |   |-- portfolio/
|   |   |   `-- risk/
|   |   `-- package.json
|   |-- shared-types/
|   |   |-- src/
|   |   |   |-- portfolio.ts
|   |   |   |-- risk.ts
|   |   |   |-- allocation.ts
|   |   |   `-- proposals.ts
|   |   `-- package.json
|   `-- ui/
|       |-- src/
|       |   |-- cards/
|       |   |-- charts/
|       |   |-- badges/
|       |   `-- layout/
|       `-- package.json
|-- infra/
|   |-- docker/
|   |   |-- web.Dockerfile
|   |   |-- agent.Dockerfile
|   |   `-- docker-compose.yml
|   |-- grafana/
|   |   |-- dashboards/
|   |   `-- datasources/
|   |-- prometheus/
|   |   `-- prometheus.yml
|   `-- scripts/
|       |-- bootstrap.ps1
|       |-- dev-up.ps1
|       `-- deploy-sepolia.ps1
|-- data/
|   |-- seeds/
|   |   |-- assets.json
|   |   |-- chains.json
|   |   `-- risk-defaults.json
|   `-- scenarios/
|       |-- depeg.json
|       |-- stale-oracle.json
|       `-- liquidity-shock.json
`-- .github/
    `-- workflows/
        |-- web-ci.yml
        |-- agent-ci.yml
        `-- contracts-ci.yml
```

## Top-Level Directory Purpose

### `docs/`

Project planning, service ownership docs, and research inputs.

### `apps/web/`

The full web product:

- landing page
- dashboard
- allocation studio
- risk center
- approvals center
- strategy lab

### `services/agent/`

The AI + Data Analytics backend:

- price ingestion
- quote sampling
- portfolio analytics
- risk scoring
- allocation recommendations
- backtests and scenarios

### `services/indexer/`

Optional dedicated ingestion or event indexing service if event volume or UI requirements outgrow the main agent service.

### `contracts/`

On-chain execution and control layer:

- executor
- proposal approval manager
- pause guardian
- optional identity contract

### `packages/`

Shared code used across multiple services:

- ABIs
- chain config
- SDK wrappers
- shared types
- reusable UI primitives

### `infra/`

Operational support:

- local containers
- monitoring configs
- automation scripts

### `data/`

Static seeds and replay scenarios used for testing, local development, and demo preparation.

### `.github/workflows/`

Separate CI pipelines for frontend, backend analytics, and contracts.

## Build Order

Recommended scaffold order:

1. `docs/`
2. `packages/config`, `packages/abis`, `packages/shared-types`
3. `contracts/`
4. `services/agent/`
5. `apps/web/`
6. `infra/`
7. `services/indexer/` if needed after MVP

## Notes

- This is the target implementation structure, not the current physical repo state.
- The repo can be scaffolded incrementally, but new files should follow this layout.
- Avoid mixing frontend-only code into backend or contract directories.
- Keep shared schema and config in `packages/` instead of duplicating them across services.


