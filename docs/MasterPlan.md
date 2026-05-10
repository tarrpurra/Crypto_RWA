# Master Plan: AIxRWA

## 1. Project Definition

### Product Name
AIxRWA

### Product Goal
Build a web platform on Mantle that helps users and operators manage RWA-focused portfolios with:

- AI-assisted asset allocation
- Explainable risk scoring
- Guarded trade execution
- Human approval for high-risk actions
- Real-time monitoring, alerts, and audit trails

### Core MVP Thesis
The strongest MVP is not a fully autonomous "black box" trader. It is a transparent allocation and risk management system that:

- monitors USDY, mETH, and stable reserves continuously
- computes risk before every action
- recommends or executes only guarded rebalances
- pauses quickly when data, liquidity, or market conditions degrade

### Initial Asset Scope

- USDY as the primary RWA yield asset
- mETH as the ETH yield / growth asset
- USDC or a stable reserve as the liquidity buffer
- Native MNT / WMNT only when required for routing, gas, or test flows

### Environment Scope

- Mantle mainnet for live market data, verified contracts, and guarded real execution
- Mantle Sepolia for contract deployment, approval flow testing, and demo-safe execution
- Local mocks / forked environments for depeg, stale oracle, and low-liquidity simulations

### Non-Goals For MVP

- Issuer-side mint / redeem flows
- Full autonomous execution without human override
- Support for many RWAs on day one
- Hardcoded pool addresses for USDY/mETH routes
- Production assumption that Sepolia mirrors all mainnet assets

## 2. Source Summary From `docs/`

This plan is based on the research in:

- `docs/research/deep-research-report.md`
- `docs/research/aix_rwa_difficulty_assessment.html`
- the PDF research packet in `docs/research/`

Key conclusions carried into this plan:

- use a hybrid architecture: off-chain decision logic plus guarded on-chain executor
- treat risk management as the main product, not a secondary feature
- use runtime pool discovery from AGNI and Merchant Moe factories / quoters
- use mainnet for verified market data and Sepolia for safe deployment testing
- keep human approval for emergency or non-routine actions
- use Pyth / Hermes for price freshness, confidence, and depeg monitoring

## 3. Product Strategy

### Positioning
AIxRWA should present itself as an institutional-style RWA allocation and risk terminal, not a meme trading app. The website should feel like a portfolio operations console for tokenized yield assets.

### Primary User Types

1. Visitor
Learns what AIxRWA does and why risk-managed RWA allocation matters.

2. Investor / User
Connects wallet, views current portfolio state, reviews AI allocation recommendations, and approves or rejects actions.

3. Operator / Team Member
Monitors system health, reviews alerts, manages policies, and handles emergency actions.

4. Judge / Demo Reviewer
Needs a clear, short path to understand the product, see live data, and trust the controls.

### Core User Flows

1. User lands on website and understands the strategy in under 60 seconds.
2. User connects wallet and sees current portfolio, risk score, and target allocation.
3. AI generates a recommendation with explanation, confidence, and constraints.
4. Risk engine validates the recommendation and may reduce, reject, or pause it.
5. User or operator approves the action.
6. Executor performs a guarded rebalance on Sepolia or mainnet.
7. Website shows logs, alerts, and before/after portfolio impact.

## 4. Recommended Build Approach

### Chosen Architecture
Use the hybrid approach:

- web frontend for UX, visualization, approvals, and monitoring
- Python decision service for AI reasoning, allocation logic, simulation, and risk checks
- Solidity contracts for execution, role checks, pause controls, and audit events

### Why This Approach

- It matches the strongest recommendation from the research.
- It keeps smart contracts minimal and safer.
- It makes AI output explainable and easy to log.
- It supports a stronger demo than a pure backend bot.
- It keeps the "website" as the main product surface.

### Decision Model
AI may recommend actions, but only the policy engine and risk engine can authorize them for execution.

### Execution Policy

- Low risk: auto-propose and optionally auto-execute within strict limits
- Medium risk: smaller clip sizes and explicit confirmation
- High risk: human approval required
- Critical risk: pause and shift to simulation-only mode

## 5. Functional Scope

### MVP Features

#### A. Website

- landing page
- live portfolio dashboard
- allocation studio
- risk center
- decision log
- trade approval panel
- strategy backtest / replay screen
- admin / operations panel

#### B. Data and Analytics

- live balances and exposures
- Pyth / Hermes price ingestion
- DEX quote sampling
- liquidity depth estimates
- historical snapshots
- explainable risk scoring
- performance and benchmark views

#### C. Execution

- propose rebalance
- simulate route and slippage
- approve or reject trade
- execute through whitelisted routers
- pause / unpause flows
- emergency withdrawal path

#### D. Safety

- stale data protection
- concentration limits
- slippage and cost guards
- role-based access
- alerting and audit trail
- simulation-only fallback mode

### Phase 2 Features

- ERC-8004 agent identity, with ERC-721 fallback if needed
- multi-strategy profiles
- more RWAs beyond USDY
- user-configurable risk profiles
- delegated approvals / multisig integrations
- self-hosted indexing and richer backtests

## 6. Website Information Architecture

### 6.1 Landing Page

Purpose:
Explain the product, trust model, asset universe, and demo CTA.

Sections:

- hero: AI-assisted RWA allocation with controlled risk
- why this matters: yield, liquidity, risk transparency
- how it works: data -> risk -> recommendation -> approval -> execution
- supported assets: USDY, mETH, stable reserve
- safety architecture: guarded execution and human override
- demo CTA: open dashboard / run simulation

### 6.2 Dashboard

Purpose:
Single-screen view of portfolio state and current system condition.

Widgets:

- total portfolio value
- current allocation vs target allocation
- current risk score
- top risk contributors
- latest AI recommendation
- route depth / liquidity status
- pending approvals
- recent alerts

### 6.3 Allocation Studio

Purpose:
Show the current and proposed asset allocation and why the AI wants to change it.

Features:

- target allocation cards for USDY, mETH, stable buffer
- rationale summary from AI
- confidence score
- risk-adjusted expected outcome
- clip size and rebalance schedule
- scenario comparison: current vs proposed
- manual override inputs for operators

### 6.4 Risk Center

Purpose:
Expose the full risk model and current alert state.

Views:

- total risk score and band
- bucket-level risk breakdown
- depeg monitor
- liquidity monitor
- oracle freshness and confidence
- concentration exposure
- contract / policy status
- system health and RPC status

### 6.5 Trade Approval Center

Purpose:
Review, approve, reject, or pause trade plans.

Features:

- proposal queue
- route and router details
- min amount out and slippage controls
- policy precheck results
- approval status timeline
- execution result and tx hashes

### 6.6 Strategy Lab

Purpose:
Let users and judges explore how the system behaves under different conditions.

Features:

- replay past decisions
- compare AI vs manual allocation
- simulate depeg, low-liquidity, and stale-oracle events
- benchmark against hold USDY and static basket strategies

### 6.7 Operations Console

Purpose:
Internal operator panel for system health and emergency controls.

Features:

- pause / unpause
- switch live mode vs simulation-only mode
- update limits and whitelists
- inspect queue and failed jobs
- alert history

## 7. UX and Visual Direction

### Design Direction
Use a high-trust, capital-markets style visual language:

- clean grids
- strong typography
- muted dark-neutral or slate palette with one accent color
- charts and status colors used sparingly and intentionally
- clear distinction between "recommendation", "approved", and "executed"

### UX Principles

- every important action must have an explanation
- every risk state must be visible before a user clicks approve
- live vs simulated data must always be labeled
- no hidden automation
- mobile can support viewing and approvals, but desktop is the primary experience

## 8. Technical Architecture

### 8.1 High-Level Architecture

1. Frontend displays portfolio, risk, allocation, and approvals.
2. Backend ingests market, oracle, and chain data.
3. Allocation engine generates target weights and trade proposals.
4. Risk engine validates or blocks the proposal.
5. Approval workflow records operator / user consent.
6. Executor contract performs whitelisted on-chain actions.
7. Indexer and monitoring services feed history, alerts, and system health.

### 8.2 Frontend Stack

- Next.js
- TypeScript
- React
- Tailwind CSS or a minimal custom design system
- `wagmi` + `viem` for wallet and chain interactions
- charting library such as Recharts or ECharts
- TanStack Query for data fetching

### 8.3 Backend Stack

- Python
- FastAPI
- Pydantic
- `pandas` or `polars` for historical and simulation logic
- async job scheduler for quote sampling, oracle ingestion, and alerts
- Redis optional for queues and caching

### 8.4 Smart Contract Stack

- Solidity
- Foundry for testing and contract development
- OpenZeppelin for roles, pausing, and safety primitives
- optional Hardhat tasks for deployment scripts and verification if preferred by the team

### 8.5 Data Stack

- PostgreSQL for application state
- time-series tables for prices, quotes, decisions, and portfolio snapshots
- object storage or local file store for backtest outputs and exported reports

### 8.6 Monitoring Stack

- Prometheus
- Grafana
- Telegram or Discord alert bot
- structured logs for backend and contract events

### 8.7 Network and Protocol Config Baseline

Hardcode only verified constants in config packages. Discover volatile routing data at runtime.

Mainnet baseline:

- chain id: `5000`
- RPC: `https://rpc.mantle.xyz`
- explorers: `https://explorer.mantle.xyz`, `https://mantlescan.xyz`
- USDY: `0x5be26527e817998a7206475496fde1e68957c5a6`
- mETH: `0xcDA86A272531e8640cD7F1a92c01839911B90bb0`
- Pyth contract: `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729`
- Merchant Moe router: `0xeaEE7EE68874218c3558b40063c42B82D3E7232a`
- Merchant Moe LB router: `0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a`
- Merchant Moe aggregator router: `0x45A62B090DF48243F12A21897e7ed91863E2c86b`
- Merchant Moe factory: `0x5bef015ca9424a7c07b68490616a4c1f094bedec`
- Merchant Moe LB factory: `0xa6630671775c4EA2743840F9A5016dCf2A104054`
- AGNI factory: `0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035`
- AGNI swap router: `0x319B69888b0d11cEC22caA5034e25FfFBDc88421`
- AGNI quoter: `0x9488C05a7b75a6FefdcAE4f11a33467bcBA60177`
- AGNI quoterV2: `0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb`

Sepolia baseline:

- chain id: `5003`
- RPC: `https://rpc.sepolia.mantle.xyz`
- explorer: `https://explorer.sepolia.mantle.xyz`
- faucet: `https://faucet.sepolia.mantle.xyz/`
- bridge: `https://bridge.sepolia.mantle.xyz/`
- mETH: `0x9EF60874d4c5d57E7361F564b9cA86056fDf5B89`
- Pyth contract: `0x98046Bd286715D3B0BC227Dd7a956b83D8978603`
- AGNI factory: `0xA9AcD50B042A72c33d05fDcC8ad209d3aD361762`
- AGNI swap router: `0xe38cfa32cCd918d94E2e20230dFaD1A4Fd8aEF16`
- AGNI quoter: `0xA82F8dC4704d3512b120de70480219761F24B6Eb`
- AGNI quoterV2: `0x9Da17239a4170f50A5A2c11813BD0C601b5c9693`

Config rules:

- do not hardcode USDY Sepolia, WMNT Sepolia, WETH Sepolia, or USDC Sepolia until verified
- do not hardcode direct USDY/mETH pool addresses
- verify final Pyth feed IDs for USDY and mETH before live deployment

## 9. On-Chain Architecture

### Core Contracts

#### `ExecutorVault`
Holds approved funds, approvals, and execution permissions.

Responsibilities:

- execute router calls to whitelisted protocols
- enforce `minAmountOut`, deadlines, and roles
- emit execution events

#### `TradeApprovalManager`
Stores trade proposals and approval state.

Responsibilities:

- register proposal hash
- record approvals
- validate expiration
- block reused or modified calldata

#### `PauseGuardian`
Provides emergency stop control.

Responsibilities:

- pause execution immediately
- separate fast emergency powers from normal operations

#### `AgentIdentity`
Optional identity NFT for the agent.

Plan:

- MVP fallback: simple ERC-721
- stretch goal: ERC-8004 if documentation and implementation are stable enough

### Supported Protocol Integrations

- AGNI for V3-style routing and quoting
- Merchant Moe for classic AMM, LB, and aggregator routing
- Pyth for on-chain price validation

### On-Chain Design Rules

- keep routing intelligence off-chain
- only execute whitelisted routers
- never hardcode pool addresses when runtime discovery is required
- keep upgrade and admin powers minimal
- use events for every material state change

## 10. Off-Chain Service Architecture

### Service Modules

#### `market_data_service`

- load balances
- sample DEX quotes
- fetch pool metadata
- maintain portfolio snapshots

#### `pool_discovery_service`

- discover AGNI pools by fee tiers
- discover Merchant Moe classic and LB routes
- cache valid routes
- rank candidate routes by depth and cost

#### `oracle_service`

- fetch Hermes update data
- validate Pyth feed freshness
- compute derived prices such as mETH/USD when needed

#### `risk_engine`

- compute bucket scores
- apply thresholds
- decide risk band
- generate explainable output

#### `allocation_engine`

- compute target portfolio weights
- choose whether to hold, rebalance, reduce risk, or pause
- split large actions into smaller clips

#### `proposal_service`

- convert approved allocation changes into executable proposals
- attach route, slippage, deadline, and approvals metadata

#### `execution_orchestrator`

- submit proposals
- watch confirmations
- retry safely when allowed
- downgrade to simulation-only mode on repeated failures

#### `simulation_service`

- backtest strategy against historical snapshots
- run deterministic stress scenarios
- generate benchmark comparison reports

#### `alerting_service`

- emit alerts for risk, data, contract, or ops failures
- notify Telegram / Discord

## 11. Risk Management Framework

### Core Principle
Risk management is the center of the product. Allocation only matters if the system can explain why it is safe to move capital.

### Risk Buckets

- depeg risk
- liquidity risk
- counterparty / custodian risk
- regulatory / policy risk
- smart-contract risk
- oracle / data risk
- market volatility risk
- basis risk
- operational / settlement risk
- concentration risk
- slippage risk
- gas / funding risk

### Recommended Action Bands

- `0-25`: normal monitoring and guarded execution
- `25-45`: execution allowed with smaller clips
- `45-65`: rebalance only, no fresh risk
- `65-80`: reduce exposure, human approval required
- `>80`: pause, alert, and prepare emergency unwind

### Required Risk UI Outputs

- total score
- per-bucket score contribution
- confidence score
- precheck results
- action band
- recommended action
- rejection or pause reasons

### Key Default Rules

- reject stale oracle data
- reject trades with insufficient route depth
- reject trades above concentration caps
- reject execution cost above allowed basis points
- require human approval after protocol upgrades or admin changes

## 12. Asset Allocation Framework

### Initial Portfolio Model
The MVP should manage three sleeves:

- stable reserve sleeve
- USDY income sleeve
- mETH growth / yield sleeve

### Default Allocation Profiles

#### Defensive

- stable reserve: 40-50%
- USDY: 35-45%
- mETH: 10-20%

#### Balanced

- stable reserve: 20-30%
- USDY: 35-50%
- mETH: 20-35%

#### Yield-Seeking

- stable reserve: 10-20%
- USDY: 40-55%
- mETH: 25-40%

These are operator-configurable ranges, not hardcoded promises.

### Allocation Inputs

- current portfolio weights
- price and yield signals
- risk score and band
- route liquidity and expected slippage
- gas cost
- policy limits
- recent market volatility
- user-selected profile

### Allocation Output

- target weights
- reasoned recommendation
- clip schedule
- rebalance urgency
- execution constraints

### Allocation Rules For MVP

- do not increase exposure when total risk is above 45
- force cash / stable build-up when risk is above 65
- prefer smaller clips when liquidity headroom is narrow
- treat basis divergence as risk until exit liquidity is proven
- never treat depeg as free alpha without confirmation from liquidity and oracle health

## 13. Data Model

### Core Entities

#### `assets`

- symbol
- address
- chain
- decimals
- category
- active

#### `pools`

- protocol
- pool address
- token pair
- fee tier or bin step
- route type
- last checked timestamp

#### `price_snapshots`

- asset
- source
- price
- confidence
- publish time
- ingest time

#### `quote_snapshots`

- protocol
- route
- amount in
- quoted amount out
- estimated slippage
- route depth
- timestamp

#### `portfolio_snapshots`

- wallet / vault
- total value
- per-asset balance
- per-asset weight
- timestamp

#### `risk_snapshots`

- total score
- per-bucket scores
- confidence
- action band
- notes
- timestamp

#### `allocation_decisions`

- current allocation
- target allocation
- reasoning
- confidence
- recommended action
- created by
- timestamp

#### `trade_proposals`

- proposal id
- plan hash
- router
- calldata hash
- expected min out
- expiry
- status

#### `trade_executions`

- proposal id
- tx hash
- quoted out
- actual out
- gas used
- status
- timestamp

#### `alerts`

- alert type
- severity
- message
- source module
- status
- timestamp

## 14. Suggested Repository Structure

```text
/
|-- MasterPlan.md
|-- docs/
|   `-- research/
|-- apps/
|   `-- web/
|       |-- app/
|       |-- components/
|       |-- features/
|       |-- lib/
|       |-- hooks/
|       |-- styles/
|       `-- public/
|-- services/
|   |-- agent/
|   |   |-- app/
|   |   |-- modules/
|   |   |-- strategies/
|   |   |-- risk/
|   |   |-- simulations/
|   |   |-- repositories/
|   |   `-- tests/
|   `-- indexer/
|       |-- app/
|       |-- jobs/
|       `-- tests/
|-- contracts/
|   |-- src/
|   |-- script/
|   |-- test/
|   `-- lib/
|-- packages/
|   |-- abis/
|   |-- config/
|   |-- sdk/
|   |-- shared-types/
|   `-- ui/
|-- infra/
|   |-- docker/
|   |-- grafana/
|   |-- prometheus/
|   `-- scripts/
|-- data/
|   |-- seeds/
|   `-- scenarios/
`-- .github/
    `-- workflows/
```

### Directory Responsibilities

- `apps/web`: public website and authenticated dashboard
- `services/agent`: AI, risk, allocation, and proposal logic
- `services/indexer`: on-chain event ingestion and cache refresh
- `contracts`: executor and approval contracts
- `packages/abis`: shared contract ABIs
- `packages/config`: addresses, chain constants, risk defaults
- `packages/sdk`: client wrappers used by web and backend
- `packages/shared-types`: shared DTOs / schemas
- `infra`: local dev and monitoring setup

## 15. API Surface

### Public / Dashboard APIs

- `GET /api/portfolio/current`
- `GET /api/risk/current`
- `GET /api/allocation/current`
- `GET /api/decisions`
- `GET /api/alerts`
- `GET /api/market/overview`
- `GET /api/backtests/:id`

### Operator APIs

- `POST /api/proposals/create`
- `POST /api/proposals/:id/approve`
- `POST /api/proposals/:id/reject`
- `POST /api/execution/run`
- `POST /api/system/pause`
- `POST /api/system/unpause`
- `POST /api/system/mode`
- `POST /api/policies/update`

### WebSocket / Streaming Events

- portfolio updates
- price updates
- quote updates
- risk score updates
- proposal status updates
- execution status updates
- alert stream

## 16. Milestone Plan

### Phase 0: Foundation

Deliverables:

- initialize monorepo
- configure Mantle mainnet and Sepolia constants
- add shared ABI and address package
- create design references and website wireframes
- decide ERC-721 fallback path for identity

Acceptance criteria:

- repo boots locally
- environments are defined
- team can run web, agent, and contract tests independently

### Phase 1: Website Shell

Deliverables:

- landing page
- dashboard layout
- wallet connection
- global navigation
- data state skeletons

Acceptance criteria:

- website deploys
- responsive layout works
- mock data can render all major screens

### Phase 2: Market and Oracle Integration

Deliverables:

- Pyth / Hermes ingestion
- AGNI quoting
- Merchant Moe route discovery
- portfolio snapshot service

Acceptance criteria:

- system can show live prices and route candidates
- stale-data detection works
- pool discovery is cached and repeatable

### Phase 3: Risk Engine

Deliverables:

- risk buckets
- weighted score
- action bands
- alert generation
- risk center UI

Acceptance criteria:

- each proposal has a full risk output
- threshold crossings generate alerts
- high-risk states block fresh allocation increases

### Phase 4: Allocation Engine

Deliverables:

- profile-based target allocation logic
- AI reasoning prompt / template
- deterministic fallback rules
- explanation generator

Acceptance criteria:

- system generates target weights and reasons
- risk engine can veto the recommendation
- recommendations are visible in the UI

### Phase 5: Contracts and Approvals

Deliverables:

- executor contract
- trade approval manager
- pause controls
- proposal hashing
- approval center UI

Acceptance criteria:

- Sepolia proposal can be created, approved, and executed
- executor rejects invalid router or modified calldata
- pause blocks execution immediately

### Phase 6: Simulation and Monitoring

Deliverables:

- backtest replay
- AI vs manual comparison
- Prometheus metrics
- Grafana dashboards
- alert bot

Acceptance criteria:

- at least three demo scenarios are replayable
- portfolio, risk, and execution metrics are visible
- operator receives alerts for critical failures

### Phase 7: Demo Hardening

Deliverables:

- final visual polish
- copy and docs refinement
- live demo script
- fallback replay mode
- deployment checklist

Acceptance criteria:

- demo can run end-to-end without manual code edits
- live and replay flows both work
- critical paths have test coverage

## 17. Four-Week Execution Plan

### Week 1

- lock MVP scope
- set up monorepo and environments
- configure Mantle mainnet and Sepolia
- integrate wallet connection and basic website shell
- read token ABIs and DEX interfaces
- deploy a minimal contract to Sepolia

Outcome:
working shell of website, repo, and contract toolchain

### Week 2

- implement Pyth / Hermes ingestion
- implement AGNI and Merchant Moe discovery and quoting
- build backend portfolio and market endpoints
- build dashboard and risk center with real data
- create initial executor contract and tests

Outcome:
website shows real market and portfolio state, contracts compile and test

### Week 3

- implement risk engine
- implement allocation engine and AI explanation flow
- add proposal lifecycle and approval center
- run depeg, liquidity, and stale-oracle simulations
- integrate alerts and operator controls

Outcome:
system can generate, validate, approve, and simulate guarded rebalances

### Week 4

- finalize execution on Sepolia
- add strategy lab and AI vs manual comparison
- polish visual design and copy
- record demo flows and fallback replay
- deploy website and finalize submission materials

Outcome:
demo-ready product with clear story, visible controls, and repeatable scenarios

## 18. Team Split

### Developer 1: Smart Contract Ownership

Owns all on-chain implementation and execution safety.

- executor and approval contracts
- pause, whitelist, and role-control logic
- AGNI and Merchant Moe contract-side integration points
- Foundry tests and deployment scripts
- Sepolia deployment, verification, and contract event quality

### Developer 2: AI + Data Analytics Ownership

Owns the decision brain, data pipelines, and strategy intelligence.

- allocation engine
- AI prompt / reasoning layer
- Pyth / Hermes ingestion and market data normalization
- quote sampling, simulation, benchmarking, and backtest outputs
- risk scoring logic and portfolio analytics APIs

### Developer 3: Frontend + Product Ownership

Owns the full user-facing product and operator experience.

- landing page and dashboard implementation
- wallet UX and connected portfolio views
- allocation studio, risk center, and approval center
- charts, decision logs, alerts UI, and observability screens
- design system, responsive behavior, and demo polish

### Shared Ownership

- architecture decisions
- risk thresholds
- demo scenarios
- release checklist

## 19. Testing Strategy

### Unit Tests

- risk bucket calculators
- allocation profile logic
- API serializers
- route ranking logic

### Contract Tests

- role restrictions
- pause behavior
- proposal hash validation
- slippage / min out enforcement
- router whitelist checks

### Integration Tests

- market data -> risk score -> proposal generation
- approval -> execution -> UI update
- failed tx -> retry / degrade behavior

### Scenario Tests

- USDY depeg
- mETH volatility shock
- low-liquidity route
- stale oracle data
- RPC degradation
- contract pause / emergency stop

### Demo Validation

- live Sepolia rebalance
- simulation-only mode fallback
- replay of precomputed AI decisions

## 20. Security and Control Requirements

- no private keys in frontend
- executor should be controlled by multisig or operator-safe ownership
- all sensitive config in env or secrets manager
- strict allowlist for routers and contracts
- enforce deadline and `minAmountOut` on every trade
- log every recommendation, approval, rejection, and execution
- maintain kill switch that is faster than normal governance flow

## 21. Key Open Issues To Resolve Early

1. Confirm the exact Pyth feed IDs for USDY and mETH before any production deployment.
2. Confirm the final stable reserve asset and whether it is real USDC or a mock on Sepolia.
3. Confirm whether ERC-8004 is worth the week-3 time cost or if ERC-721 should remain the final identity layer.
4. Decide whether to support real mainnet execution in the MVP or keep mainnet as read-only plus simulated execution.
5. Decide whether indexer infrastructure will be self-hosted from the start or deferred until after MVP.

## 22. Definition of Done For MVP

The MVP is done when all of the following are true:

- the website explains the product clearly and loads a real dashboard
- a user can connect wallet and inspect current allocation and risk
- live or near-live market data is visible for USDY, mETH, and reserve assets
- the system can produce a target allocation recommendation with explanation
- the risk engine can reduce, reject, or pause actions based on thresholds
- a proposal can be approved and executed on Mantle Sepolia
- the website shows proposal history, execution status, and alerts
- three demo scenarios are ready: normal rebalance, depeg response, and emergency pause

## 23. Final Build Recommendation

Build AIxRWA first as a risk-managed website with a strong backend decision engine and a minimal, hardened execution contract. Keep the story focused:

- real market data
- explainable AI allocation
- strict risk controls
- human approval where it matters
- visible proof that the system knows when not to trade

That is the version of this project most likely to be credible, shippable, and impressive within the current scope.
