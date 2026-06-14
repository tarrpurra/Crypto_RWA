from __future__ import annotations

import logging
from services.agent.app.core.status_codes import RiskStatusCode
from services.agent.app.schemas.portfolio import PortfolioSnapshot
from services.agent.app.schemas.risk import RiskSnapshot
from services.agent.app.schemas.allocation import AllocationDecision, RebalanceAction
from services.agent.strategies.allocation.profiles import get_allocation_profile
from services.agent.strategies.allocation.clip_sizing import clip_trade_amount
from services.agent.strategies.allocation.swap_pairs import build_rebalance_swap_pair, build_swap_pair_label
from services.agent.modules.oracle.freshness import utc_now

logger = logging.getLogger("services.agent.strategies.rebalance")


def compute_rebalance(
    portfolio: PortfolioSnapshot,
    risk: RiskSnapshot,
    profile_name: str,
    target_weights_override: dict[str, float] | None = None,
) -> tuple[AllocationDecision, list[RebalanceAction]]:
    now = utc_now()
    resolved_profile_name = profile_name
    if target_weights_override:
        target_profile = {
            asset_symbol: float(weight)
            for asset_symbol, weight in target_weights_override.items()
            if float(weight) > 0
        }
        if not target_profile:
            raise ValueError("target_weights_override must contain at least one positive weight.")
        resolved_profile_name = profile_name.strip() or "Custom Strategy"
    else:
        resolved_profile_name, target_profile = get_allocation_profile(profile_name)

    if portfolio.status_code != "DATA_FRESH" or portfolio.total_value_usd <= 0 or not portfolio.balances:
        target_weights = {asset: weight for asset, weight in target_profile.items()}
        decision = AllocationDecision(
            decision_id=f"dec_{int(now.timestamp())}",
            wallet_or_vault=portfolio.wallet_or_vault,
            profile_name=resolved_profile_name,
            current_weights=portfolio.weights,
            target_weights=target_weights,
            recommended_action="PAUSE",
            confidence=0.99,
            reasoning=f"Allocation is paused because portfolio data is not usable: {portfolio.status_reason}",
            risk_snapshot_id=risk.snapshot_id,
            status_code="RISK_VETO",
            created_at=now,
        )
        return decision, []

    current_weights = {b.asset_symbol: b.weight for b in portfolio.balances}
    
    # Fill in weights for missing assets in portfolio
    for asset in target_profile.keys():
        if asset not in current_weights:
            current_weights[asset] = 0.0

    target_weights = {asset: weight for asset, weight in target_profile.items()}
    
    # Calculate drift
    drifts = {asset: current_weights[asset] - target_weights[asset] for asset in target_weights}
    
    decision_id = f"dec_{int(now.timestamp())}"
    recommended_action = "HOLD"
    confidence = 0.90
    reasoning = ""
    rebalance_actions: list[RebalanceAction] = []
    
    # Risk-based rebalance constraints
    # - If RISK_VETO or RISK_PAUSE_REQUIRED: recommended_action = "PAUSE", no trades
    # - If RISK_REDUCE_ONLY: can only reduce risk (sell mETH, buy USDY)
    # - If RISK_REBALANCE_ONLY: can only trade to reduce drift
    
    if risk.risk_band in ("RISK_VETO", "RISK_PAUSE_REQUIRED"):
        recommended_action = "PAUSE"
        reasoning = f"Rebalancing is blocked due to active risk state: {risk.risk_band}."
        if risk.notes:
            reasoning += " Reason: " + "; ".join(risk.notes)
            
        decision = AllocationDecision(
            decision_id=decision_id,
            wallet_or_vault=portfolio.wallet_or_vault,
            profile_name=resolved_profile_name,
            current_weights=current_weights,
            target_weights=target_weights,
            recommended_action=recommended_action,
            confidence=0.95,
            reasoning=reasoning,
            risk_snapshot_id=risk.snapshot_id,
            status_code=risk.status_code,
            created_at=now,
        )
        return decision, rebalance_actions

    # Cooldown and Drift Tolerance Settings
    from services.agent.app.core.settings import get_settings
    settings = get_settings()
    
    # Check cooldown against last recorded trade proposal
    try:
        from services.agent.repositories.db.session import create_session
        from services.agent.repositories.db.models import TradeProposalRecord
        from sqlalchemy import select
        with create_session() as session:
            stmt = select(TradeProposalRecord).order_by(TradeProposalRecord.created_at.desc()).limit(1)
            last_proposal = session.scalar(stmt)
            if last_proposal:
                cooldown_sec = settings.rebalance_cooldown_seconds
                time_since = (now - last_proposal.created_at).total_seconds()
                if time_since < cooldown_sec:
                    logger.info("Rebalance blocked by cooldown. Last proposal was created %.1f seconds ago (cooldown limit: %d seconds).", time_since, cooldown_sec)
                    decision = AllocationDecision(
                        decision_id=decision_id,
                        wallet_or_vault=portfolio.wallet_or_vault,
                        profile_name=resolved_profile_name,
                        current_weights=current_weights,
                        target_weights=target_weights,
                        recommended_action="HOLD",
                        confidence=0.98,
                        reasoning=f"No portfolio adjustments are made at this time because a rebalance cooldown is active. The last proposal was created {int(time_since // 60)} minutes ago (cooldown is {int(cooldown_sec // 60)} minutes).",
                        risk_snapshot_id=risk.snapshot_id,
                        status_code="RISK_NORMAL",
                        created_at=now,
                    )
                    return decision, []
    except Exception as exc:
        logger.warning("Failed to check rebalance cooldown in database: %s", exc)

    # Evaluate drift rebalance needs
    significant_drifts: list[tuple[str, float]] = []
    drift_tolerance = settings.rebalance_drift_tolerance
    
    for asset, drift in drifts.items():
        if abs(drift) > drift_tolerance:
            significant_drifts.append((asset, drift))
            
    if not significant_drifts:
        recommended_action = "HOLD"
        reasoning = f"All exposures are within {drift_tolerance*100:.1f}% tolerance of the {resolved_profile_name} profile targets."
    else:
        # We need to rebalance
        recommended_action = "REBALANCE"
        rebalance_notes: list[str] = []
        blocked_by_pricing = False
        blocked_by_risk = False
        
        # Sort drifts so we execute sales (negative drift we buy, positive drift we sell)
        # It's usually safer to execute sales first to free up capital, but in our backend recommendation
        # we output individual asset buy/sell actions.
        for asset, drift in significant_drifts:
            entry = next((b for b in portfolio.balances if b.asset_symbol == asset), None)
            current_val = entry.value_usd if entry else 0.0
            current_bal = entry.balance if entry else 0.0
            price = entry.price_usd if entry and entry.price_usd > 0 else (
                current_val / current_bal if current_bal > 0 else 0.0
            )
            
            if price == 0.0:
                logger.warning("Skipping %s rebalance action because the position price is unavailable.", asset)
                blocked_by_pricing = True
                continue
                
            delta_val_usd = -drift * portfolio.total_value_usd  # Positive means we need to buy, negative means sell
            
            # Apply risk filters
            if risk.risk_band == "RISK_REDUCE_ONLY" and delta_val_usd > 0 and asset in ("mETH", "USDY"):
                # Cannot buy mETH or USDY in reduce-only
                logger.info("Blocking buy action for %s due to RISK_REDUCE_ONLY", asset)
                blocked_by_risk = True
                continue
                
            if risk.risk_band == "RISK_REBALANCE_ONLY" and delta_val_usd > 0 and asset == "mETH":
                # Cannot buy volatile assets in rebalance-only
                logger.info("Blocking buy action for mETH due to RISK_REBALANCE_ONLY")
                blocked_by_risk = True
                continue

            # Clip trade sizes
            clipped_val_usd = clip_trade_amount(asset, abs(delta_val_usd), portfolio.total_value_usd)
            clipped_amount = clipped_val_usd / price
            
            if clipped_amount <= 0:
                continue

            action_type = "BUY" if delta_val_usd > 0 else "SELL"
            token_in_symbol, token_out_symbol = build_rebalance_swap_pair(
                action_type,
                asset,
                current_weights,
                target_weights,
            )
            rebalance_actions.append(
                RebalanceAction(
                    asset_symbol=asset,
                    action=action_type,
                    amount=clipped_amount,
                    route_id=f"route_{asset.lower()}_{action_type.lower()}",
                    token_in_symbol=token_in_symbol,
                    token_out_symbol=token_out_symbol,
                    swap_pair_label=build_swap_pair_label(token_in_symbol, token_out_symbol),
                )
            )
            pair_label = build_swap_pair_label(token_in_symbol, token_out_symbol) or asset
            rebalance_notes.append(f"{pair_label}: {action_type} {clipped_amount:.4f} {asset} (~${clipped_val_usd:.2f})")
            
        if rebalance_actions:
            reasoning = f"Proposed rebalance actions for {resolved_profile_name} profile: " + ", ".join(rebalance_notes)
        else:
            recommended_action = "HOLD"
            if blocked_by_pricing and blocked_by_risk:
                reasoning = (
                    f"Significant drifts detected, but rebalance actions were blocked by missing pricing and risk engine rules ({risk.risk_band})."
                )
            elif blocked_by_pricing:
                reasoning = "Significant drifts detected, but rebalance actions could not be sized because one or more position prices are unavailable."
            else:
                reasoning = f"Significant drifts detected, but rebalance actions were filtered out by risk engine rules ({risk.risk_band})."

    if rebalance_actions:
        status_code = RiskStatusCode.RISK_NORMAL.value
    elif significant_drifts:
        status_code = risk.status_code if risk.status_code != RiskStatusCode.RISK_NORMAL.value else RiskStatusCode.RISK_REBALANCE_ONLY.value
    else:
        status_code = RiskStatusCode.RISK_NORMAL.value

    decision = AllocationDecision(
        decision_id=decision_id,
        wallet_or_vault=portfolio.wallet_or_vault,
        profile_name=resolved_profile_name,
        current_weights=current_weights,
        target_weights=target_weights,
        recommended_action=recommended_action,
        confidence=confidence,
        reasoning=reasoning,
        risk_snapshot_id=risk.snapshot_id,
        status_code=status_code,
        created_at=now,
    )
    return decision, rebalance_actions
