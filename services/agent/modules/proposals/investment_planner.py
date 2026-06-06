from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from decimal import Decimal

from eth_abi import encode
from eth_hash.auto import keccak
from fastapi import HTTPException
from web3 import Web3

from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import DataStatusCode, ExecutionStatusCode, ProposalStatusCode, RuntimeMode
from services.agent.app.schemas.portfolio import PortfolioSnapshotResponse
from services.agent.app.schemas.proposals import (
    AllocationTargetItem,
    ExecutionPayloadSchema,
    InvestmentPlanRequest,
    InvestmentPlanResponse,
    LinkedProposalSummary,
    RiskValidationCheck,
    TradeProposal,
    TransactionStep,
)
from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot
from services.agent.app.schemas.risk import RiskAssessmentResponse
from services.agent.modules.contracts.reader import get_pause_guardian_state
from services.agent.modules.oracle import get_ondo_usdy_oracle_adapter
from services.agent.modules.oracle.freshness import utc_now
from services.agent.modules.quotes import get_quote_service
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.strategies.allocation.profiles import get_allocation_profile, normalize_profile_name


PROPOSAL_DETAIL_CACHE: dict[str, InvestmentPlanResponse] = {}


@dataclass(frozen=True)
class PlannedSwap:
    target_asset_symbol: str
    amount_in: Decimal
    token_in_symbol: str
    token_out_symbol: str
    quote: NormalizedQuoteSnapshot | None
    gas_estimate: Decimal | None = None
    uses_native_value: bool = False


def _execution_input_symbol(deposit_asset_symbol: str) -> str:
    return "WMNT" if deposit_asset_symbol.upper() == "MNT" else deposit_asset_symbol


def _normalize_weights(request: InvestmentPlanRequest, settings: Settings) -> tuple[dict[str, float], dict[str, float], list[str]]:
    profile_name, ai_weights = get_allocation_profile(request.risk_profile)
    warnings: list[str] = []
    if request.allocation_mode.lower().startswith("manual"):
        if not request.manual_target_weights:
            raise HTTPException(status_code=400, detail="Manual allocation mode requires manual_target_weights.")
        total = sum(max(weight, 0.0) for weight in request.manual_target_weights.values())
        if total <= 0:
            raise HTTPException(status_code=400, detail="Manual allocation weights must sum to a positive value.")
        selected_weights = {
            asset: max(weight, 0.0) / total
            for asset, weight in request.manual_target_weights.items()
            if max(weight, 0.0) > 0
        }
    else:
        selected_weights = dict(ai_weights)
        if profile_name != request.risk_profile:
            warnings.append(f"Risk profile alias normalized to {profile_name}.")
    return ai_weights, selected_weights, warnings


def _asset_config_by_symbol(settings: Settings) -> dict[str, dict[str, object]]:
    assets: dict[str, dict[str, object]] = {}
    for asset in settings.asset_registry.values():
        if int(asset["chain_id"]) != settings.effective_chain_id:
            continue
        assets[str(asset["symbol"]).upper()] = asset
    return assets


def _decimal_or_zero(value: str | None) -> Decimal:
    try:
        return Decimal(value or "0")
    except Exception:
        return Decimal("0")


def _latest_price_map() -> dict[str, Decimal]:
    repo = MarketDataRepository()
    prices: dict[str, Decimal] = {}
    for snapshot in repo.latest_normalized_prices():
        if snapshot.price_usd:
            prices[snapshot.asset_symbol.upper()] = Decimal(snapshot.price_usd)
    return prices


def _quote_derived_price(symbol: str, prices: dict[str, Decimal]) -> Decimal | None:
    quote_service = get_quote_service()
    for stable_symbol in ("USDC", "USDY"):
        stable_price = prices.get(stable_symbol.upper())
        if stable_price is None:
            continue
        quote = quote_service.best_quote_for_pair(symbol, stable_symbol)
        if quote is None or quote.amount_out is None:
            continue
        try:
            amount_in = Decimal(quote.amount_in)
            amount_out = Decimal(quote.amount_out)
        except Exception:
            continue
        if amount_in <= 0 or amount_out <= 0:
            continue
        return (amount_out * stable_price) / amount_in
    return None


def _build_target_allocations(
    *,
    deposit_amount: Decimal,
    deposit_asset_symbol: str,
    deposit_price_usd: Decimal,
    target_weights: dict[str, float],
    source: str,
    prices: dict[str, Decimal],
) -> list[AllocationTargetItem]:
    deposit_value_usd = deposit_amount * deposit_price_usd if deposit_price_usd > 0 else None
    allocations: list[AllocationTargetItem] = []
    for asset_symbol, weight in target_weights.items():
        allocation_value_usd = deposit_value_usd * Decimal(str(weight)) if deposit_value_usd is not None else None
        target_price = prices.get(asset_symbol.upper())
        if asset_symbol.upper() == deposit_asset_symbol.upper():
            amount = deposit_amount * Decimal(str(weight))
        elif allocation_value_usd is not None and target_price and target_price > 0:
            amount = allocation_value_usd / target_price
        else:
            amount = Decimal("0")
        allocations.append(
            AllocationTargetItem(
                asset_symbol=asset_symbol,
                percentage=round(weight, 6),
                amount=float(round(amount, 8)),
                value_usd=float(round(allocation_value_usd, 8)) if allocation_value_usd is not None else 0.0,
                source=source,
            )
        )
    return allocations


def _build_planned_swaps(
    *,
    deposit_asset_symbol: str,
    deposit_amount: Decimal,
    target_weights: dict[str, float],
) -> list[PlannedSwap]:
    quote_service = get_quote_service()
    execution_symbol = _execution_input_symbol(deposit_asset_symbol)
    swaps: list[PlannedSwap] = []
    for asset_symbol, weight in target_weights.items():
        if asset_symbol.upper() == execution_symbol.upper():
            continue
        amount_in = deposit_amount * Decimal(str(weight))
        if amount_in <= 0:
            continue
        attempt = quote_service.best_quote_attempt_for_pair(execution_symbol, asset_symbol)
        raw_gas_estimate = None
        if attempt is not None:
            gas_value = attempt.raw_snapshot.raw_payload_json.get("gas_estimate")
            if gas_value is not None:
                try:
                    raw_gas_estimate = Decimal(str(gas_value))
                except Exception:
                    raw_gas_estimate = None
        swaps.append(
            PlannedSwap(
                target_asset_symbol=asset_symbol,
                amount_in=amount_in,
                token_in_symbol=execution_symbol,
                token_out_symbol=asset_symbol,
                quote=attempt.normalized_snapshot if attempt is not None else quote_service.best_quote_for_pair(execution_symbol, asset_symbol),
                gas_estimate=raw_gas_estimate,
                uses_native_value=False,
            )
        )
    return swaps


def _build_guard_checks(
    *,
    settings: Settings,
    deposit_asset_symbol: str,
    selected_weights: dict[str, float],
    prices: dict[str, Decimal],
    swaps: list[PlannedSwap],
    risk: RiskAssessmentResponse,
) -> tuple[list[RiskValidationCheck], list[str]]:
    blockers: list[str] = []
    fresh_price_symbols = {deposit_asset_symbol.upper(), *[symbol.upper() for symbol in selected_weights.keys()]}
    usdy_oracle = get_ondo_usdy_oracle_adapter().read().status

    oracle_ok = usdy_oracle.status in {"ok", "live", "live_reference"} if "USDY" in fresh_price_symbols else True
    quote_ok = all(swap.quote and swap.quote.status_code == DataStatusCode.QUOTE_FRESH.value for swap in swaps) if swaps else True

    deviation_pass = True
    deviation_message = "No swap quotes require deviation checks."
    for swap in swaps:
        if not swap.quote or not swap.quote.amount_out:
            deviation_pass = False
            deviation_message = f"Missing live quote for {swap.token_in_symbol}->{swap.token_out_symbol}."
            break
        price_in = prices.get(swap.token_in_symbol.upper())
        price_out = prices.get(swap.token_out_symbol.upper())
        if not price_in or not price_out:
            deviation_pass = False
            deviation_message = f"Missing spot prices for {swap.token_in_symbol}/{swap.token_out_symbol}."
            break
        quote_ratio = swap.amount_in / Decimal(swap.quote.amount_out)
        expected_ratio = price_out / price_in
        deviation = abs((quote_ratio - expected_ratio) / expected_ratio) if expected_ratio > 0 else Decimal("1")
        if deviation > Decimal("0.01"):
            deviation_pass = False
            deviation_message = f"Quote deviation for {swap.token_in_symbol}->{swap.token_out_symbol} exceeds 1%."
            break
        deviation_message = "Quote prices remain within 1% of current spot-derived expectations."

    slippage_pass = True
    slippage_message = "No swap quotes require slippage checks."
    for swap in swaps:
        if not swap.quote or not swap.quote.estimated_slippage_bps:
            slippage_pass = False
            slippage_message = f"Missing slippage estimate for {swap.token_in_symbol}->{swap.token_out_symbol}."
            break
        slippage_bps = Decimal(swap.quote.estimated_slippage_bps)
        threshold = Decimal("100") if "METH" in {swap.token_in_symbol.upper(), swap.token_out_symbol.upper()} else Decimal("50")
        if slippage_bps > threshold:
            slippage_pass = False
            slippage_message = f"Estimated slippage for {swap.token_in_symbol}->{swap.token_out_symbol} exceeds the configured threshold."
            break
        slippage_message = "Estimated slippage remains within configured thresholds."

    concentration_pass = max(selected_weights.values()) <= 0.70 if selected_weights else True
    if not concentration_pass:
        blockers.append("One target allocation exceeds the 70% concentration cap.")

    pause_ok = True
    pause_message = "Pause guardian is not configured; runtime remains advisory."
    if settings.pause_guardian_address:
        try:
            pause_state = get_pause_guardian_state(
                rpc_url=settings.effective_http_rpc_url,
                foundry_out_dir=settings.foundry_out_dir,
                address=settings.pause_guardian_address,
            )
            pause_ok = not bool(pause_state.get("paused"))
            pause_message = "Pause guardian is clear." if pause_ok else "Pause guardian is active."
        except Exception as exc:
            pause_ok = settings.runtime_mode != RuntimeMode.LIVE
            pause_message = f"Pause guardian read failed: {exc}"

    veto_ok = settings.runtime_mode != RuntimeMode.LIVE or bool(settings.trade_approval_manager_address)
    veto_message = (
        "Trade approval manager address is configured; operator approval is still required."
        if settings.trade_approval_manager_address
        else "Trade approval manager address is not configured; live execution remains blocked."
    )

    approval_freshness_ok = False
    approval_message = "Approval freshness is evaluated after the wallet submits the ERC-20 approval transaction."

    checks = [
        RiskValidationCheck(
            code="oracle_freshness",
            label="Oracle freshness",
            passed=oracle_ok,
            blocking=True,
            message="USDY oracle is fresh enough for guarded execution." if oracle_ok else "USDY oracle freshness check failed.",
            observed_value=usdy_oracle.status if "USDY" in fresh_price_symbols else "not_required",
            threshold_value="status=ok",
            data_sources_used=["ondo_redemption_oracle"] if "USDY" in fresh_price_symbols else [],
        ),
        RiskValidationCheck(
            code="price_deviation",
            label="Price deviation",
            passed=deviation_pass,
            blocking=True,
            message=deviation_message,
            threshold_value="<=1%",
            data_sources_used=["quotes", "normalized_prices"],
        ),
        RiskValidationCheck(
            code="liquidity_check",
            label="Liquidity check",
            passed=quote_ok,
            blocking=True,
            message="Liquidity inferred from successful live quote responses." if quote_ok else "Live quote liquidity inference failed for one or more swaps.",
            threshold_value="live_quote_required",
            data_sources_used=["quotes"],
        ),
        RiskValidationCheck(
            code="slippage_limit",
            label="Slippage limit",
            passed=slippage_pass,
            blocking=True,
            message=slippage_message,
            data_sources_used=["quotes"],
        ),
        RiskValidationCheck(
            code="concentration_risk",
            label="Concentration risk",
            passed=concentration_pass,
            blocking=True,
            message="Target allocations stay within the 70% concentration cap." if concentration_pass else "One target allocation exceeds the 70% concentration cap.",
            threshold_value="<=70%",
            data_sources_used=["allocation_profile"],
        ),
        RiskValidationCheck(
            code="approval_freshness",
            label="Approval freshness",
            passed=approval_freshness_ok,
            blocking=False,
            message=approval_message,
            threshold_value="<20 blocks",
            data_sources_used=["wallet_approval"],
        ),
        RiskValidationCheck(
            code="pause_status",
            label="Pause status",
            passed=pause_ok,
            blocking=True,
            message=pause_message,
            data_sources_used=["pause_guardian"] if settings.pause_guardian_address else [],
        ),
        RiskValidationCheck(
            code="veto_check",
            label="Veto check",
            passed=veto_ok,
            blocking=settings.runtime_mode == RuntimeMode.LIVE,
            message=veto_message,
            data_sources_used=["trade_approval_manager"] if settings.trade_approval_manager_address else [],
        ),
    ]

    for check in checks:
        if check.blocking and not check.passed:
            blockers.append(check.message)
    if risk.hard_veto_status == "active":
        blockers.append("Risk engine returned a hard veto for the current portfolio state.")
    return checks, blockers


def _encode_agni_trade_proposal(
    *,
    settings: Settings,
    wallet_address: str | None,
    swap: PlannedSwap,
) -> tuple[TradeProposal, LinkedProposalSummary, str]:
    if swap.quote is None or swap.quote.protocol != "AGNI" or swap.quote.amount_out is None:
        raise HTTPException(status_code=400, detail=f"AGNI execution route is unavailable for {swap.token_in_symbol}->{swap.token_out_symbol}.")

    assets = _asset_config_by_symbol(settings)
    token_in_asset = assets.get(swap.token_in_symbol.upper())
    token_out_asset = assets.get(swap.token_out_symbol.upper())
    if not token_in_asset or not token_out_asset:
        raise HTTPException(status_code=400, detail=f"Asset configuration missing for {swap.token_in_symbol}->{swap.token_out_symbol}.")

    token_in = str(token_in_asset["address"])
    token_out = str(token_out_asset["address"])
    decimals_in = int(token_in_asset.get("decimals") or 18)
    decimals_out = int(token_out_asset.get("decimals") or 18)
    max_amount_in = int(swap.amount_in * Decimal(10 ** decimals_in))
    quoted_amount_out = Decimal(swap.quote.amount_out)
    min_amount_out = int((quoted_amount_out * Decimal("0.99")) * Decimal(10 ** decimals_out))

    router_address = settings.effective_agni_swap_router_address
    if not router_address:
        raise HTTPException(status_code=400, detail="AGNI swap router address is not configured.")

    selector = "0x414bf389"
    recipient = wallet_address or settings.executor_vault_address
    if not recipient:
        raise HTTPException(status_code=400, detail="No wallet address or executor vault address is configured for trade recipient.")

    now = int(time.time())
    deadline = now + 900
    proposal_expiry = now + 7200
    nonce = int(uuid.uuid4().int & 0xFFFFFFFF)
    fee_tier = int(swap.quote.route_id.split(":")[-1]) if ":" in swap.quote.route_id and swap.quote.route_id.split(":")[-1].isdigit() else 500
    params = (
        Web3.to_checksum_address(token_in),
        Web3.to_checksum_address(token_out),
        fee_tier,
        Web3.to_checksum_address(recipient),
        deadline,
        max_amount_in,
        min_amount_out,
        0,
    )
    encoded_struct = encode(["(address,address,uint24,address,uint256,uint256,uint256,uint160)"], [params])
    calldata = Web3.to_bytes(hexstr=selector) + encoded_struct
    calldata_hash = Web3.to_hex(keccak(calldata))

    proposal_id = Web3.to_hex(keccak(f"proposal_{uuid.uuid4()}_{now}".encode("utf-8")))
    plan_hash = Web3.to_hex(keccak(f"plan_{swap.token_in_symbol}_{swap.token_out_symbol}_{swap.amount_in}".encode("utf-8")))
    payload = ExecutionPayloadSchema(
        proposalId=proposal_id,
        planHash=plan_hash,
        router=Web3.to_checksum_address(router_address),
        selector=selector,
        calldataHash=calldata_hash,
        tokenIn=Web3.to_checksum_address(token_in),
        tokenOut=Web3.to_checksum_address(token_out),
        recipient=Web3.to_checksum_address(recipient),
        maxAmountIn=max_amount_in,
        minAmountOut=min_amount_out,
        nativeValue=max_amount_in if swap.uses_native_value else 0,
        deadline=deadline,
        proposalExpiry=proposal_expiry,
        nonce=nonce,
    )
    t_now = utc_now()
    proposal = TradeProposal(
        proposal_id=proposal_id,
        plan_hash=plan_hash,
        wallet_or_vault=recipient,
        payload=payload,
        status_code=ProposalStatusCode.PROPOSAL_PENDING_APPROVAL.value,
        risk_snapshot_id=None,
        created_at=t_now,
        updated_at=t_now,
    )
    summary = LinkedProposalSummary(
        proposal_id=proposal_id,
        asset_symbol=swap.target_asset_symbol,
        action="BUY",
        token_in_symbol=swap.token_in_symbol,
        token_out_symbol=swap.token_out_symbol,
        amount=float(round(swap.amount_in, 8)),
        status_code=proposal.status_code,
    )
    return proposal, summary, Web3.to_hex(calldata)


def build_investment_plan(
    *,
    settings: Settings,
    request: InvestmentPlanRequest,
    portfolio: PortfolioSnapshotResponse,
    risk: RiskAssessmentResponse,
) -> tuple[InvestmentPlanResponse, list[tuple[TradeProposal, str]]]:
    normalized_profile = normalize_profile_name(request.risk_profile)
    deposit_amount = Decimal(str(request.deposit_amount))
    if deposit_amount <= 0:
        raise HTTPException(status_code=400, detail="Deposit amount must be greater than zero.")

    assets = _asset_config_by_symbol(settings)
    execution_deposit_symbol = _execution_input_symbol(request.deposit_asset_symbol)
    deposit_asset = assets.get(execution_deposit_symbol.upper())
    if request.deposit_asset_symbol.upper() == "MNT" and not settings.native_mnt_enabled:
        raise HTTPException(
            status_code=400,
            detail="Native MNT deposit flow is disabled. Set NATIVE_MNT_ENABLED=true and configure SEPOLIA_WMNT_ADDRESS.",
        )
    if deposit_asset is None or not deposit_asset.get("address"):
        raise HTTPException(
            status_code=400,
            detail=f"Deposit asset {request.deposit_asset_symbol} is not configured on {settings.target_chain.value}.",
        )

    prices = _latest_price_map()
    deposit_price = prices.get(request.deposit_asset_symbol.upper()) or prices.get(execution_deposit_symbol.upper())
    if deposit_price is None and execution_deposit_symbol.upper() == "WMNT":
        deposit_price = _quote_derived_price("WMNT", prices)
        if deposit_price is not None:
            prices["WMNT"] = deposit_price
            prices["MNT"] = deposit_price

    ai_weights, selected_weights, warnings = _normalize_weights(request, settings)
    if deposit_price is None:
        warnings.append(
            f"Deposit valuation for {request.deposit_asset_symbol} is unavailable, so only fetchable allocation data will be returned."
        )
    ai_allocations = _build_target_allocations(
        deposit_amount=deposit_amount,
        deposit_asset_symbol=request.deposit_asset_symbol,
        deposit_price_usd=deposit_price or Decimal("0"),
        target_weights=ai_weights,
        source="ai",
        prices=prices,
    )
    selected_allocations = _build_target_allocations(
        deposit_amount=deposit_amount,
        deposit_asset_symbol=request.deposit_asset_symbol,
        deposit_price_usd=deposit_price or Decimal("0"),
        target_weights=selected_weights,
        source="selected",
        prices=prices,
    )
    ai_allocations = [
        item
        for item in ai_allocations
        if item.asset_symbol.upper() == request.deposit_asset_symbol.upper() or item.value_usd > 0
    ]
    selected_allocations = [
        item
        for item in selected_allocations
        if item.asset_symbol.upper() == request.deposit_asset_symbol.upper() or item.value_usd > 0
    ]

    missing_assets = [
        allocation.asset_symbol
        for allocation in selected_allocations
        if allocation.asset_symbol.upper() != request.deposit_asset_symbol.upper()
        and allocation.percentage > 0
        and allocation.asset_symbol.upper() not in assets
    ]
    blockers: list[str] = []
    if missing_assets:
        blockers.append(f"Target assets are not configured on {settings.target_chain.value}: {', '.join(missing_assets)}.")

    swaps = _build_planned_swaps(
        deposit_asset_symbol=request.deposit_asset_symbol,
        deposit_amount=deposit_amount,
        target_weights=selected_weights,
    )
    checks, guard_blockers = _build_guard_checks(
        settings=settings,
        deposit_asset_symbol=request.deposit_asset_symbol,
        selected_weights=selected_weights,
        prices=prices,
        swaps=swaps,
        risk=risk,
    )
    blockers.extend(guard_blockers)

    proposal_pairs: list[tuple[TradeProposal, str]] = []
    linked_proposals: list[LinkedProposalSummary] = []
    estimated_gas = Decimal("0")
    for swap in swaps:
        if swap.quote is None or swap.quote.amount_out is None:
            continue
        proposal, summary, calldata = _encode_agni_trade_proposal(
            settings=settings,
            wallet_address=request.wallet_address,
            swap=swap,
        )
        proposal_pairs.append((proposal, calldata))
        linked_proposals.append(summary)
        if swap.gas_estimate is not None:
            estimated_gas += swap.gas_estimate

    transaction_steps: list[TransactionStep] = []
    step_index = 1
    if request.deposit_asset_symbol.upper() == "MNT":
        transaction_steps.append(
            TransactionStep(
                step_index=step_index,
                step_type="wrap",
                description="Wrap native MNT into WMNT in the connected wallet before approvals and swaps.",
                asset_symbol="WMNT",
                amount=str(round(request.deposit_amount, 8)),
                requires_user_action=True,
            )
        )
        step_index += 1
    for swap in swaps:
        transaction_steps.append(
            TransactionStep(
                step_index=step_index,
                step_type="approve",
                description=f"Approve {swap.token_in_symbol} for router spend before executing {swap.token_in_symbol}->{swap.token_out_symbol}.",
                asset_symbol=swap.token_in_symbol,
                amount=str(round(swap.amount_in, 8)),
                requires_user_action=True,
            )
        )
        step_index += 1
        matching_link = next((proposal for proposal in linked_proposals if proposal.token_out_symbol == swap.token_out_symbol), None)
        transaction_steps.append(
            TransactionStep(
                step_index=step_index,
                step_type="swap",
                description=f"Swap {swap.token_in_symbol} into {swap.token_out_symbol} through the guarded AGNI route.",
                asset_symbol=swap.token_out_symbol,
                amount=str(round(swap.amount_in, 8)),
                proposal_id=matching_link.proposal_id if matching_link else None,
                requires_user_action=True,
            )
        )
        step_index += 1
    for allocation in selected_allocations:
        if allocation.asset_symbol.upper() == request.deposit_asset_symbol.upper() and allocation.amount > 0:
            transaction_steps.append(
                TransactionStep(
                    step_index=step_index,
                    step_type="hold",
                    description=f"Retain {allocation.amount:.4f} {allocation.asset_symbol} as the reserve or already-aligned sleeve.",
                    asset_symbol=allocation.asset_symbol,
                    amount=str(allocation.amount),
                    requires_user_action=False,
                )
            )
            step_index += 1

    execution_required = bool(linked_proposals)
    approval_enabled = not blockers and execution_required and deposit_price is not None
    if blockers:
        response_status = "degraded"
        response_status_code = ProposalStatusCode.PROPOSAL_RISK_REJECTED.value
        response_status_reason = "Investment plan is blocked until the listed issues are resolved."
    elif execution_required and deposit_price is not None:
        response_status = "ok"
        response_status_code = ProposalStatusCode.PROPOSAL_PENDING_APPROVAL.value
        response_status_reason = "Investment plan is ready for human approval."
    else:
        response_status = "ok"
        response_status_code = ExecutionStatusCode.EXECUTION_SKIPPED.value
        response_status_reason = (
            "No swaps are required because the requested allocation is already aligned."
            if not execution_required
            else "Allocation is available, but execution is deferred until a normalized deposit price is available."
        )

    response = InvestmentPlanResponse(
        status=response_status,
        status_code=response_status_code,
        status_label=response_status_code,
        status_reason=response_status_reason,
        generated_at=utc_now(),
        plan_id=Web3.to_hex(keccak(f"investment_plan_{uuid.uuid4()}".encode("utf-8"))),
        deposit_asset_symbol=request.deposit_asset_symbol,
        deposit_amount=request.deposit_amount,
        risk_profile=normalized_profile,
        allocation_mode=request.allocation_mode,
        ai_target_allocations=ai_allocations,
        selected_target_allocations=selected_allocations,
        warning_messages=warnings,
        approval_enabled=approval_enabled,
        approval_blockers=blockers,
        guard_checks=checks,
        estimated_gas_native=str(estimated_gas) if estimated_gas > 0 else None,
        transaction_steps=transaction_steps,
        linked_proposals=linked_proposals,
        risk_assessment=risk.model_dump(mode="json"),
        metadata={
            "portfolio_snapshot_id": portfolio.snapshot_id,
            "portfolio_address": portfolio.portfolio_address,
            "total_portfolio_value_usd": portfolio.total_value_usd,
            "runtime_mode": settings.runtime_mode.value,
            "target_chain": settings.target_chain.value,
            "execution_required": execution_required,
        },
    )
    for proposal in linked_proposals:
        PROPOSAL_DETAIL_CACHE[proposal.proposal_id] = response
    return response, proposal_pairs


def get_cached_plan_for_proposal(proposal_id: str) -> InvestmentPlanResponse | None:
    return PROPOSAL_DETAIL_CACHE.get(proposal_id)
