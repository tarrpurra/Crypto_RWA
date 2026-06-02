# AIxRWA Investment Flow Implementation Plan

## Overview
This document outlines the implementation of the corrected user flow for AIxRWA, focusing on a risk-managed RWA allocation guardian with wallet connection, deposit, AI recommendation, human approval, and guarded execution.

## Core Principles
1. **No auto-swapping**: Swaps should never start immediately after deposit or amount entry
2. **User approval required**: Users must see and approve the investment plan before execution
3. **Risk-first architecture**: Off-chain risk engine validates before any on-chain execution
4. **MNT as utility only**: MNT is primarily for gas/routing, not direct investment
5. **Guarded execution**: Swaps only occur when hard guards pass (fresh oracle, acceptable deviation, liquidity, etc.)

## User Flow Implementation

### 1. Wallet Connection & Network Check
- [ ] Implement wallet connection using Wagmi/Viem
- [ ] Add Mantle network validation (check chain ID)
- [ ] Display error if user is not on Mantle network
- [ ] Read and display wallet balances for supported assets (USDC, USDY, mETH, MNT)

### 2. Investment Configuration Form
Create a multi-step form that collects:
- [ ] Asset selection dropdown: USDC, USDY, mETH, MNT
- [ ] Amount input field with asset-specific formatting
- [ ] Risk profile selector: Defensive / Balanced / Yield-Seeking
- [ ] Allocation mode toggle: "AI Suggested" vs "Manual"
- [ ] Real-time wallet balance validation (disable form if insufficient balance)
- [ ] Form submission triggers AI + risk calculation (no execution yet)

### 3. AI Allocation Engine
- [ ] Create allocation service that takes:
  - Deposit asset type and amount
  - Selected risk profile
  - Current market prices (from oracles)
  - Portfolio state (if any existing holdings)
- [ ] Implement allocation logic per risk profile:
  - Defensive: Higher stable reserve, lower volatility assets
  - Balanced: Moderate allocation across all three sleeves
  - Yield-Seeking: Higher allocation to USDY/mETH, lower stable reserve
- [ ] Return target allocation as percentages and USD equivalents
- [ ] Cache results temporarily for display in proposal

### 4. Risk Engine Validation
- [ ] Create risk validation service that checks:
  - USDY depeg risk (price deviation from NAV)
  - mETH volatility assessment
  - Oracle data freshness (timestamp thresholds)
  - DEX liquidity sufficiency for swap amounts
  - Slippage estimation vs limits
  - Concentration risk (max allocation per asset)
- [ ] Return risk score and pass/fail status with detailed reasoning
- [ ] Only proceed if all risk checks pass

### 5. Investment Proposal Display
- [ ] Show detailed proposal before any execution:
  - Deposit asset and amount
  - AI-suggested allocation breakdown (USDY/mETH/stable reserve)
  - USD equivalent values for each allocation
  - Risk validation results (pass/fail with explanations)
  - Estimated gas costs
  - Expected transaction sequence
- [ ] Require explicit user approval via "Approve Investment Plan" button
- [ ] Disable approval button if risk validation fails
- [ ] Show warning if manual allocation doesn't match AI suggestion (if using AI mode)

### 6. Deposit & Approval Transaction
- [ ] After user approval, initiate token approval/deposit:
  - If depositing USDC/USDY/mETH: Execute ERC20 approve transaction
  - If depositing MNT: Optional conversion to stable reserve (user-configurable)
  - Show transaction status and hash
- [ ] Wait for confirmation before proceeding to swaps
- [ ] Handle transaction failures gracefully with user feedback

### 7. Guarded Execution via AGNI/Merchant Moe
- [ ] Execute swaps only after deposit confirmation:
  - Use AGNI/Merchant Moe for protected swaps
  - Implement slippage protection and transaction reverts on failure
  - Swap into target allocations: USDY, mETH, stable reserve
- [ ] Validate hard guards before execution:
  - Fresh oracle data (timestamp < threshold)
  - Acceptable price deviation from expected
  - Sufficient liquidity on DEX
  - Approval freshness (recent allowance)
  - No active pause/veto signals
- [ ] Execute swaps sequentially or via batch where possible
- [ ] Show real-time swap progress and transaction hashes

### 8. Dashboard Update
- [ ] After successful execution, update dashboard with:
  - New portfolio balances (USDY, mETH, stable reserve)
  - Updated risk score
  - Transaction hash links to block explorer
  - Decision log showing AI recommendation, risk checks, user approval
  - Timestamp of last rebalance
- [ ] Show success confirmation with option to view detailed report

## Technical Implementation Details

### Frontend Components
- `InvestmentForm.tsx`: Multi-step form for asset, amount, risk profile, allocation mode
- `AllocationProposal.tsx`: Displays AI recommendation and risk validation results
- `TransactionStatus.tsx`: Shows deposit approval and swap transaction status
- `PortfolioDashboard.tsx`: Updated to show post-execution portfolio state
- `RiskDetailsModal.tsx`: Expandable view of risk engine validation results
- `AIDecisionFeed.tsx`: Shows AI thinking/decision process (reasoning, confidence, risk score) WITHOUT pipeline details
- `AISidePanel.tsx`: AI panel that displays decision feed/reasoning/output (final AI thinking) but HIDES internal pipeline visualization layers (Data Ingestion, AI Brain, Risk Engine, Allocation, Execution) per user requirements - only shows the final AI decision output, not the internal processing steps

### Backend Services (if needed)
- `allocation-service.js`: AI allocation logic
- `risk-validation-service.js`: Off-chain risk checking
- `price-oracle-service.js`: Aggregates price data from multiple sources
- `transaction-builder.js`: Constructs swap transactions with guards

### Smart Contract Interactions
- ERC20 approve/deposit for user assets (USDC, USDY, mETH, MNT)
- Mocktoken contract for testnet simulation (tracks pricing of mETH and USDY)
- AGNI/Merchant Moe swap interface calls
- Event listening for transaction confirmations
- Integration with existing Vault/Executor contracts

### Environment Configuration
- Configure Sepolia testnet endpoints for all external services (RPC, oracles, price feeds)
- Ensure complete data visibility: all required market data, oracle updates, and chain events are fully indexed and available
- Prevent partial data transmission to AI engine: implement data completeness checks before AI allocation/risk calculations
- Use redundant data sources (multiple oracles, price aggregators) to ensure data availability and accuracy
- Implement fallback mechanisms for data feeds to maintain decision integrity during temporary outages

## Risk Guard Specifications

### Pre-Execution Guards (Must Pass)
1. **Oracle Freshness**: Price data timestamp < 5 minutes old
2. **Price Deviation**: Current price within 1% of expected from AI calculation
3. **Liquidity Check**: DEX has sufficient liquidity for 2x swap amount (slippage buffer)
4. **Slippage Limit**: Estimated slippage < 0.5% for stable pairs, < 1% for volatile pairs
5. **Approval Freshness**: Token allowance created within last 20 blocks
6. **Pause Status**: No active pause on Vault or swap contracts
7. **Veto Check**: No active veto from governance/multisig

### Post-Execution Validation
- [ ] Verify final holdings match target allocation within tolerance
- [ ] Log any deviations for audit trail
- [ ] Trigger rebalancing suggestion if drift > threshold

## Error Handling & User Feedback
- [ ] Clear error messages for failed transactions (insufficient funds, slippage too high, etc.)
- [ ] Recovery suggestions (reduce amount, adjust slippage tolerance, etc.)
- [ ] Transaction status indicators (pending, confirmed, failed)
- [ ] Rollback guidance for failed mid-execution scenarios
- [ ] Email/webhook notifications for critical events (optional)

## Testing Strategy
- [ ] Unit tests for allocation algorithms per risk profile
- [ ] Unit tests for risk validation edge cases
- [ ] Integration tests for full flow simulation
- [ ] End-to-end tests using testnet contracts (including Mocktoken)
- [ ] Mocktoken contract deployment and testing (tracks pricing of mETH and USDY)
- [ ] User acceptance testing with hackathon demo scenarios
- [ ] Gas optimization testing for swap transactions

## Full Test Flow Verification
To ensure the corrected flow is properly implemented, the following end-to-end test scenarios must be verified:

### Test Scenario 1: Stable Asset Deposit Flow
1. User connects wallet on Sepolia testnet
2. User selects USDC as deposit asset, enters amount (e.g., 100 USDC)
3. User selects Balanced risk profile, chooses AI-suggested allocation
4. System displays AI proposal: 45% USDY, 30% mETH, 25% stable reserve
5. Risk engine validates: all guards pass (fresh oracle, sufficient liquidity, etc.)
6. User approves investment plan
7. System executes USDC approve transaction
8. System performs guarded swaps via AGNI/Merchant Moe:
   - 45 USDC → USDY
   - 30 USDC → mETH
   - 25 USDC → stable reserve (remains as USDC or converted to another stable)
9. Dashboard updates showing new portfolio balances and risk score
10. Transaction hashes and decision log are displayed

### Test Scenario 2: MNT Deposit Flow
1. User connects wallet on Sepolia testnet
2. User selects MNT as deposit asset, enters amount (e.g., 50 MNT)
3. User selects Defensive risk profile, chooses AI-suggested allocation
4. System displays AI proposal: converts portion of MNT to stable reserve, then allocates
5. Risk engine validates: all guards pass
6. User approves investment plan
7. System executes MNT approve transaction
8. System performs conversion: portion of MNT → stable reserve (via swap)
9. System performs guarded swaps for allocation:
   - Remaining MNT → stable reserve → allocated per AI suggestion
10. Dashboard updates showing final portfolio (stable reserve, USDY, mETH)
11. Transaction hashes and decision log are displayed

### Test Scenario 3: USDY/mETH Direct Deposit Flow
1. User connects wallet on Sepolia testnet
2. User selects USDY as deposit asset, enters amount (e.g., 0.1 USDY)
3. User selects Yield-Seeking risk profile, chooses manual allocation
4. User specifies custom allocation: 70% USDY, 30% mETH
5. System displays proposal with user-specified allocation
6. Risk engine validates: all guards pass
7. User approves investment plan
8. System executes USDY approve transaction
9. System performs guarded swaps only if rebalancing needed:
   - If current portfolio differs from target, swap to achieve 70/30 allocation
   - If already aligned, no swaps executed (monitor and rebalance later)
10. Dashboard updates showing portfolio and confirmation of no swaps if not needed
11. Transaction hashes (if any) and decision log are displayed

### Test Scenario 4: Risk Engine Failure Flow
1. User connects wallet on Sepolia testnet
2. User selects USDC as deposit asset, enters amount
3. User selects any risk profile
4. System calculates AI proposal
5. Risk engine intentionally fails one guard (e.g., oracle data stale)
6. System displays proposal with risk validation failure
7. Approve Investment Plan button is disabled
8. User cannot proceed without addressing risk issues
9. System shows specific risk failure reason and suggested remediation

### Test Scenario 5: Mocktoken Testnet Simulation
1. Deploy Mocktoken contract on Sepolia testnet (tracks mETH/USDY pricing)
2. User connects wallet on Sepolia testnet
3. User selects Mocktoken as deposit asset, enters amount
4. System treats Mocktoken like other assets for approval/deposit
5. AI allocation engine processes Mocktoken deposit normally
6. Risk engine validates using Mocktoken price data (which follows mETH/USDY)
7. User approves investment plan
8. System performs guarded swaps converting Mocktoken to target assets (USDY/mETH/stable)
9. Dashboard updates showing final portfolio
10. Verify Mocktoken price tracking accuracy during test

### Test Scenario 6: Multiple Iteration Flow
1. User completes full investment flow (any asset)
2. Wait for price changes or time passage
3. User initiates new investment or rebalance
4. System calculates new AI proposal based on updated portfolio state
5. Risk engine validates new proposal
6. User approves new plan
7. System executes incremental swaps to reach new target allocation
8. Dashboard shows progression from previous to new allocation
9. Decision log shows history of all recommendations and executions

Each test scenario validates:
- No auto-swapping occurs before user approval
- All risk checks are performed and displayed
- User must explicitly approve before any execution
- Guarded execution via AGNI/Merchant Moe
- Proper dashboard updates with transaction hashes and logs
- Mocktoken behavior in testnet simulating mainnet conditions
- Data completeness for AI decision making on Sepolia testnet

## Milestones for Hackathon MVP
1. **Day 1**: Wallet connection, network check, basic form UI
2. **Day 2**: AI allocation engine, risk validation service, proposal display
3. **Day 3**: Deposit approval flow, guarded swap execution via AGNI
4. **Day 4**: Dashboard updates, transaction logging, error handling
5. **Day 5**: Polish, testing, demo preparation

## Success Criteria
- User can complete full investment flow without confusion
- No assets are swapped without explicit user approval
- All risk checks are visibly displayed and validated
- Transaction hashes are provided for all on-chain actions
- Final portfolio matches proposed allocation within reasonable tolerance
- Clear audit trail of AI recommendation → risk check → user approval → execution
- Mocktoken contract successfully deployed and tested on testnet (tracks pricing of mETH and USDY)

## References
- MasterPlan.md: Initial asset scope definition
- Product.md: Brand personality and design principles
- docs/research/Hackathon-grade RWA Yield Guardian on Mantlet.pdf: Architecture guidelines
- AGNI/Merchant Moe documentation: Protected swap interface
- Mocktoken contract specifications: Testnet simulation tracking mETH and USDY pricing