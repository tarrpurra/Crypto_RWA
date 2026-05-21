# Smart Contract Remaining Work

## Status

For MVP, the Mantle Sepolia smart-contract phase is complete.

Closed:

- core contracts implemented
- AGNI router and selector allowlist configured on-chain
- deterministic AGNI mock pool deployed on Mantle Sepolia
- real proposal lifecycle executed successfully on-chain
- lint warnings fixed
- `forge build` clean
- `forge test` passing
- consolidated Sepolia contract reference written
- ABI handoff package exported to `contracts/out/abis/`

Deferred or out of current MVP scope:

- Merchant Moe classic Sepolia execution remains `TODO_VERIFY`
- Merchant Moe LB and aggregator execution remain out of scope
- mainnet readiness, role ownership, multisig, operator policy, and runbook sign-off remain deferred until the mainnet phase

## Handoff Paths

Primary reference:

- `docs/smart-contract/SepoliaContractReference.md`

ABI package:

- `contracts/out/abis/README.md`
- `contracts/out/abis/manifest.json`

## Next Step

The contract lane is ready to hand off.

The next service can consume:

- deployed addresses from `SepoliaContractReference.md`
- execution payload and event schema from `SepoliaContractReference.md`
- runtime ABIs from `contracts/out/abis/`
