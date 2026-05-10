# Coding Agent Rules

These rules define how the coding AI agent must work inside this repository. They are mandatory for all tasks unless the user explicitly overrides them in the current instruction.

## 1. Data Integrity Rules

1. Do not create fake data.
2. Do not create mock data unless the user explicitly asks for mock data.
3. Do not invent addresses, API responses, prices, balances, contract ABIs, transaction hashes, pool addresses, oracle feed IDs, or backend responses.
4. If a value is not verified, mark it as `UNVERIFIED`, `UNSPECIFIED`, or `TODO_VERIFY` instead of guessing.
5. For RWA, Mantle, USDY, mETH, oracle, DEX, and contract work, prefer verified source documents, existing repository docs, implementation plans, and current code over assumptions.

## 2. Scope Control Rules

1. Only modify the service explicitly specified by the user.
2. If the user asks for frontend work, only modify frontend-related files.
3. If the user asks for smart contract work, only modify smart contract-related files.
4. If the user asks for AI/data analytics work, only modify AI/data analytics-related files.
5. Do not make changes in unrelated services, shared packages, configs, scripts, or documentation unless the user explicitly authorizes it.
6. Do not make unnecessary changes to any file.
7. Do not refactor unrelated code while completing a specific task.
8. Do not rename files, folders, functions, components, routes, contracts, or APIs unless the user explicitly asks.

## 3. Required Documentation Updates

After making code changes, update the correct `Changes.md` file for the service worked on.

| Service worked on | Required changelog file |
|---|---|
| Frontend | `RWA/docs/frontend-product/Changes.md` |
| AI / data analytics | `RWA/docs/ai-data-analytics/Changes.md` |
| Smart contracts | `RWA/docs/smart-contract/Changes.md` |

Each changelog entry must include:

- Date
- Files changed
- Summary of what changed
- Reason for the change
- Any assumptions or unresolved verification items
- Any commands the user still needs to run

Do not create multiple new implementation markdown files unless the user explicitly asks. Prefer updating the existing service-level `Changes.md` and implementation plan documents.

## 4. Before Editing Any File

Before implementing or searching for files, follow this order:

1. Read the related service `Changes.md`.
2. Read the related implementation plan.
3. Read the related file structure plan.
4. Inspect the existing code files that are directly relevant to the requested task.
5. Only then propose or make changes.

Do not jump directly into code generation without checking the service documentation first.

## 5. Command Execution Rules

1. Do not run commands unless the user explicitly tells you to run them.
2. When commands are needed, provide the commands for the user to run.
3. Clearly explain what each command does.
4. Do not run install, build, test, deploy, database migration, contract deployment, formatting, or linting commands unless the user explicitly permits execution.
5. Do not modify lockfiles through package installation unless the user explicitly asks.

## 6. Code Quality Rules

1. Focus on modular code.
2. Keep files small and responsibilities clear.
3. Prefer reusable functions, services, adapters, hooks, utilities, and components over duplicated logic.
4. Separate business logic from UI code.
5. Separate data-fetching logic from presentation logic.
6. Separate risk calculation logic from transaction execution logic.
7. Keep configuration values in config files or environment variables, not scattered through the codebase.
8. Use clear naming that explains the purpose of the function, module, variable, or component.
9. Avoid over-engineering. Build only what the requested task needs.

## 7. Logging and Debugging Rules

1. Add useful logs when writing or modifying code so development and debugging are fast.
2. Logs must help trace important execution steps, failures, and decisions.
3. Do not log secrets, private keys, access tokens, wallet seed phrases, API keys, user personal data, or sensitive transaction signing data.
4. For frontend logs, use structured and removable debug logs where appropriate.
5. For backend/AI services, log request lifecycle, validation results, decision outputs, external API failures, and error details.
6. For smart contracts, use meaningful events for important state changes and execution outcomes.

## 8. RWA Yield Guardian Specific Rules

1. Treat USDY and mETH as real assets with real risk. Do not simplify them into generic mock tokens unless the user asks for mocks or the environment requires a test harness.
2. For USDY, never invent a Pyth USDY feed ID. Use verified sources only. If not verified, use Ondo redemption oracle, DEX quote sanity checks, or mark the feed as unresolved.
3. For mETH, do not treat it as a fixed USD stablecoin. It is an ETH-linked yield-bearing asset and must be evaluated against ETH-linked market/reference data.
4. Do not hardcode pool addresses unless they are verified. Prefer runtime discovery through factories/quoters where appropriate.
5. For Sepolia, do not assume mainnet assets exist on testnet. Mark missing testnet deployments as `UNSPECIFIED` and use mocks only when explicitly allowed.
6. Execution logic must include risk guards such as oracle freshness, slippage limits, liquidity checks, expiry, pause state, and human approval where required.
7. The AI agent should propose or approve decisions only after risk checks. It must not bypass hard veto rules.

## 9. Smart Contract Rules

1. Keep smart contracts minimal, auditable, and purpose-specific.
2. Do not put complex AI decision logic directly on-chain unless explicitly requested.
3. On-chain contracts should enforce safety, permissions, expiry, slippage, pause state, and approved execution.
4. Emit events for key actions such as proposal creation, approval, execution, rejection, pause, unpause, risk limit updates, and emergency actions.
5. Never leave unlimited approvals unless the design explicitly requires it and the user approves.
6. Prefer role-based access control for privileged functions.
7. Add comments only where they clarify safety-critical behavior.

## 10. Frontend Rules

1. Keep UI components modular and reusable.
2. Do not hardcode fake dashboard numbers.
3. If real data is not connected yet, show an empty state, loading state, or `Data unavailable` message.
4. Do not create fake portfolio balances, fake APY, fake risk scores, fake PnL, or fake transaction history.
5. Use clear error states when APIs, wallets, or contracts are unavailable.
6. Keep wallet, contract, and API logic separate from visual components.

## 11. AI / Data Analytics Rules

1. Do not create fake datasets or synthetic outputs unless explicitly requested.
2. Do not silently replace unavailable live data with mock data.
3. Risk scores must be explainable and include the inputs or reasons behind the score.
4. Any AI decision must include:
   - Asset
   - Recommended action
   - Risk score
   - Confidence
   - Reasoning summary
   - Data sources used
   - Hard veto status
   - Required human approval status
5. If data is stale, missing, or unreliable, the AI must recommend `monitor_only`, `rebalance_only`, or `pause`, not forced execution.

## 12. File and Documentation Discipline

1. Do not create many new markdown files.
2. Do not duplicate implementation plans across multiple documents.
3. Prefer updating the existing implementation plan, file structure plan, and service `Changes.md`.
4. Keep documentation concise and directly useful for development.
5. When adding documentation, include only verified information or clearly marked assumptions.

## 13. Error Handling Rules

1. Add proper error handling for external APIs, wallet connections, RPC failures, contract call failures, invalid user inputs, and missing environment variables.
2. Fail safely. If the app cannot verify data or risk status, it should not execute trades.
3. Use explicit error messages that help developers debug quickly.
4. Avoid silent failures.

## 14. Security Rules

1. Never expose private keys, seed phrases, API keys, auth tokens, or signing credentials in code or logs.
2. Keep secrets in environment variables.
3. Validate all user inputs.
4. Validate all contract addresses before use.
5. Validate chain ID before contract interaction.
6. Do not bypass security checks for demo convenience unless explicitly instructed and clearly marked as unsafe demo-only behavior.

## 15. Final Response Rules for the Coding Agent

When responding to the user after a task, include:

1. What was changed.
2. Which files were changed.
3. Which `Changes.md` was updated.
4. Any assumptions made.
5. Any commands the user should run, without running them yourself.
6. Any risks, unresolved items, or manual verification steps.

Keep the response direct and do not claim something was tested, deployed, verified, or executed unless it was actually done with user permission.
