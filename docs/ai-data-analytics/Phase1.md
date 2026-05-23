# AI + Data Analytics Phase 1 Plan

## Purpose

Phase 1 establishes the live-data ingestion layer for the AI + Data Analytics service.

This phase is not about deciding trades. It is about making sure later portfolio, risk, allocation, and AI modules consume price and quote data that is timestamped, replayable, and explicit about freshness or failure.

## Phase Goal

Build a repeatable ingestion foundation for `services/agent` with:

- Hermes / Pyth-backed price fetches
- deterministic price normalization
- AGNI and Merchant Moe quote sampling
- raw snapshot persistence for audit and replay
- stale-data and upstream-failure visibility

## Locked Integration Baseline

Use this split:

- Mantle mainnet: live Ondo USDY reference pricing, AGNI route discovery and quote sampling, Merchant Moe route discovery and quote sampling
- Mantle Sepolia: plumbing validation only; do not assume Ondo USDY or Merchant Moe deployment exists, and treat AGNI addresses as candidate until independently verified
- local and simulation: use mocks or mainnet forks when RWA or DEX realism is required

Confirmed mainnet baseline values:

- Ondo USDY: `0x5bE26527e817998A7206475496fDE1E68957c5A6`
- Ondo mUSD: `0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3`
- Ondo USDY Redemption Price Oracle: `0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f`
- Merchant Moe classic router: `0xeaEE7EE68874218c3558b40063c42B82D3E7232a`
- Merchant Moe LB router: `0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a`
- Merchant Moe aggregator router: `0x45A62B090DF48243F12A21897e7ed91863E2c86b`
- Merchant Moe factory: `0x5bef015ca9424a7c07b68490616a4c1f094bedec`
- Merchant Moe LB factory: `0xa6630671775c4EA2743840F9A5016dCf2A104054`
- AGNI factory: `0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035`
- AGNI swap router: `0x319B69888b0d11cEC22caA5034e25FfFBDc88421`
- AGNI quoter: `0x9488C05a7b75a6FefdcAE4f11a33467bcBA60177`
- AGNI quoterV2: `0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb`
- Pyth ETH/USD feed: `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace`
- AGNI candidate fees: `100, 500, 3000, 10000`

Still verification-sensitive:

- Ondo oracle selector and decode method
- AGNI QuoterV2 exact quote call and decoding
- Merchant Moe classic, LB, and aggregator live quote call and decoding
- AGNI Sepolia addresses unless independently verified in runtime checks

## Why Phase 1 Matters

If Phase 1 is weak, later phases will end up scoring risk and generating recommendations from inconsistent, stale, or unverifiable market inputs.

This phase should reduce that risk by defining:

- how prices enter the service
- how quotes are discovered and sampled
- how freshness is calculated
- where raw versus normalized records are stored
- how missing, stale, or unverified data is represented

## Current Implementation State

Phase 1 status:

`Phase 1A: Sepolia scaffold complete; Phase 1B: mainnet or mainnet-fork market validation pending.`

The current implementation should not be marked strict-complete yet. Mantle Sepolia is validated as a safe plumbing target where missing or unverified market data returns explicit degraded states instead of fabricated prices or quotes. Strict Phase 1 completion still requires mainnet or mainnet-fork proof for Ondo, Pyth, AGNI, Merchant Moe, PostgreSQL persistence, and the full test suite.

Implemented in code now:

- Pyth Hermes ingestion and freshness evaluation
- explicit Ondo USDY oracle adapter and `/market/oracles/usdy` read surface
- PostgreSQL-backed SQLAlchemy persistence for price and quote snapshots
- AGNI pool discovery by fee tier using factory `getPool`
- Merchant Moe classic pair discovery using factory `getPair`
- route ranking, quote route caching, latest-quote APIs, and pair-specific quote APIs
- versioned Mantle config baseline under `packages/config/src/mantle.ts`
- Docker Compose PostgreSQL service for local persistence validation
- structured `/chain/status` degradation when RPC sampling or contract reads fail

Not complete yet:

- Ondo selector verification and trusted live decode
- AGNI QuoterV2 live amount-out decoding
- Merchant Moe live amount-out decoding for classic, LB, and aggregator routes
- executed tests against configured PostgreSQL and mainnet-read or forked environments

Sepolia validation notes:

- Mantle Sepolia `/chain/status` returns fresh RPC status for chain `5003` using `https://rpc.sepolia.mantle.xyz`.
- Ondo USDY remains mainnet-only and correctly reports `mainnet_only` on Sepolia.
- Merchant Moe remains mainnet-only unless independently verified on Sepolia.
- AGNI Sepolia remains candidate and verification-gated.
- Missing Sepolia market data is represented through `DATA_MISSING`, `DATA_PARTIAL`, or `LIQUIDITY_UNKNOWN` instead of mock values.
- WETH Sepolia may be used for route or executor mechanics only, not as a substitute for mETH or RWA market validation.

## In Scope

- `services/agent/app/core/settings.py` additions for oracle, quote, storage, and freshness config
- `services/agent/app/schemas/*` additions for market-data DTOs
- `services/agent/modules/oracle/*`
- `services/agent/modules/market_data/*`
- `services/agent/modules/quotes/*`
- `services/agent/repositories/*` for snapshot persistence boundaries
- `services/agent/jobs/ingest_prices.py`
- `services/agent/jobs/sample_quotes.py`
- minimal read surfaces for latest prices, latest quotes, routes, and ingestion status
- documentation updates for the phase and change log

## Out Of Scope

- portfolio valuation and exposure logic
- weighted risk scoring and action bands
- allocation targets and rebalance plans
- AI prompt and response handling
- execution proposal generation
- automated trading

## Implementation Principles

- keep FastAPI route handlers thin
- do not fabricate prices, quotes, feed IDs, pool addresses, or liquidity data
- preserve raw upstream payloads for replay and debugging
- treat verification gaps as first-class status, not hidden implementation details
- prefer Mantle Sepolia as the default development chain, but do not pretend its asset surface matches mainnet
- discover volatile routing data at runtime instead of hardcoding pool addresses

## Route And Oracle Rules

- Ondo is the USDY reference source and not an execution venue
- Merchant Moe and AGNI are market-quote and liquidity sources, not the USDY reference source
- if a quote route exists but quote decoding is still unverified, return explicit verification-gated or degraded records instead of fake amounts
- if a route cannot be discovered, return `no_route` behavior rather than placeholder liquidity
- if the Ondo selector is not verified, expose `selector_verification_required` in the oracle status surface and keep price trust degraded

## Acceptance Criteria

Phase 1 is complete when:

- the service can fetch and normalize live or mock-approved price data without manual intervention
- every price snapshot includes publish time, observed time, age, and freshness status
- AGNI and Merchant Moe samplers return normalized quote records or explicit failure records
- route discovery is repeatable and cached
- raw price and quote snapshots are stored persistently
- latest market data can be queried through stable internal modules and minimal HTTP endpoints
- stale, missing, or unverified data is visible instead of silently ignored

## Final Completion Checklist

Ondo:

- [ ] verify ABI or selector for the Redemption Price Oracle
- [ ] read live USDY reference price from Mantle mainnet
- [ ] normalize decimals and scale
- [ ] store price snapshot in PostgreSQL
- [ ] return `source = ondo_redemption_price_oracle`
- [ ] return `selector_verification_required` until selector is confirmed

Merchant Moe:

- [x] verify baseline mainnet addresses in config and settings
- [x] implement classic pair discovery
- [ ] implement LB pair discovery
- [ ] get a live quote for at least one route
- [x] store quote snapshots in PostgreSQL
- [x] return no fake quote amounts when route or decode is missing
- [x] keep Sepolia adapter disabled unless verified

AGNI:

- [x] verify baseline mainnet addresses in config and settings
- [x] discover pools by fee tier
- [ ] get a live quote through QuoterV2
- [x] store quote snapshots in PostgreSQL
- [ ] compare AGNI route vs Merchant Moe route using live amount outputs
- [x] treat Sepolia addresses as candidate until verified

## Definition Of Success

Phase 1 succeeds if later portfolio, risk, and allocation work can consume prices and quotes through stable schemas, stable freshness semantics, and replayable snapshot storage without re-architecting the ingestion layer.
