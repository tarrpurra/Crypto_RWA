# Smart Contract Service Setup

## Purpose

This document explains how to set up the smart contract service for AIxRWA. The smart contract lane owns:

- executor and approval contracts
- pause and whitelist controls
- protocol-facing execution entry points
- Foundry tests
- Sepolia deployment and verification

## Target Workspace

The contract service should live in:

```text
/contracts
|-- src/
|-- script/
|-- test/
|-- lib/
`-- foundry.toml
```

## Recommended Tooling

- Foundry for contracts, testing, and scripts
- OpenZeppelin contracts for access control and pausing
- `cast` for direct chain interaction
- optional Hardhat only if verification or shared scripts are easier there

## Prerequisites

Install the following before starting:

- Git
- Node.js 20+
- Foundry
- a wallet with Mantle Sepolia gas
- access to Mantle RPC endpoints

## Install Foundry

Windows PowerShell:

```powershell
irm https://foundry.paradigm.xyz | iex
foundryup
```

Verify:

```powershell
forge --version
cast --version
anvil --version
```

## Create the Contract Workspace

If the monorepo has not been scaffolded yet, create the contract workspace:

```powershell
forge init contracts --no-git
```

If the `contracts/` folder already exists, initialize dependencies without overwriting repo settings.

## Install Dependencies

From `contracts/`:

```powershell
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit
```

## Environment Variables

Create a `.env` file for local contract development.

Suggested variables:

```env
MANTLE_MAINNET_RPC_URL=https://rpc.mantle.xyz
MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz
DEPLOYER_PRIVATE_KEY=replace_me
ETHERSCAN_API_KEY=optional_if_verification_is_used
CHAIN_ID_MAINNET=5000
CHAIN_ID_SEPOLIA=5003
```

Security rules:

- never commit private keys
- use a dedicated deployer wallet
- use separate keys for Sepolia and any mainnet execution path

## Suggested `foundry.toml`

```toml
[profile.default]
src = "src"
test = "test"
script = "script"
libs = ["lib"]
solc_version = "0.8.26"
optimizer = true
optimizer_runs = 200

[rpc_endpoints]
mantle = "${MANTLE_MAINNET_RPC_URL}"
mantle_sepolia = "${MANTLE_SEPOLIA_RPC_URL}"
```

## First Local Commands

From `contracts/`:

```powershell
forge build
forge test -vv
```

When scripts exist:

```powershell
forge script script/DeploySepolia.s.sol:DeploySepoliaScript --rpc-url mantle_sepolia --broadcast
```

## Required Config Package Inputs

The smart contract service should not invent chain constants. It must consume shared values from the project config docs / package:

- Mantle mainnet chain id `5000`
- Mantle Sepolia chain id `5003`
- Mantle mainnet RPC `https://rpc.mantle.xyz`
- Mantle Sepolia RPC `https://rpc.sepolia.mantle.xyz`
- verified AGNI and Merchant Moe router/factory addresses
- verified Pyth contract addresses

Do not hardcode:

- unverified Sepolia stable token addresses
- direct USDY/mETH pool addresses
- incomplete Pyth feed IDs

## Local Development Flow

1. Build interfaces and config constants.
2. Write unit tests before writing executor behavior.
3. Implement role controls, pause, and whitelist logic first.
4. Add execution flow only after guardrails pass tests.
5. Deploy to Sepolia.
6. Verify events and execution traces.
7. Only then connect the backend proposal flow.

## Setup Acceptance Checklist

- Foundry installs successfully
- contract workspace builds cleanly
- tests run locally
- `.env` is configured
- Sepolia RPC is reachable
- deployer wallet is funded on Mantle Sepolia
- base dependencies are installed

## Notes

- Keep routing intelligence off-chain.
- Smart contracts should validate approvals and execution safety, not discover routes.
- Use Sepolia as the default execution environment until the end-to-end system is stable.
