from __future__ import annotations

from services.agent.app.schemas.portfolio import PortfolioSnapshot
from services.agent.app.schemas.risk import RiskSnapshot
from services.agent.app.schemas.allocation import AllocationDecision, RebalanceAction


def generate_deterministic_explanation(
    portfolio: PortfolioSnapshot,
    risk: RiskSnapshot,
    decision: AllocationDecision,
    rebalance_actions: list[RebalanceAction]
) -> dict[str, object]:
    """
    Generates a high-quality, structured reasoning payload deterministically.
    This acts as the fallback whenever the AI model is disabled or fails.
    """
    notes: list[str] = []
    
    if decision.recommended_action == "PAUSE":
        summary = (
            f"Vault operations are PAUSED due to critical safety controls. "
            f"The risk score is {risk.total_score:.1f} ({risk.risk_band}). "
            f"Veto triggers or stale feeds have blocked execution."
        )
        for n in risk.notes:
            notes.append(f"Risk alert: {n}")
        confidence = 0.99
        
    elif decision.recommended_action == "HOLD":
        summary = (
            f"No portfolio adjustments are recommended at this time. Current exposures "
            f"closely align with the {decision.profile_name} profile targets (USDY: {decision.target_weights.get('USDY', 0)*100:.1f}%, "
            f"mETH: {decision.target_weights.get('mETH', 0)*100:.1f}%). "
            f"Drifts are within the active 1.5% tolerance threshold. Risk levels remain stable at {risk.total_score:.1f} ({risk.risk_band})."
        )
        notes.append("Exposures aligned within tolerance.")
        notes.append(f"Risk checks passed. Score: {risk.total_score:.1f}")
        confidence = 0.95
        
    else:  # REBALANCE
        actions_desc = []
        for a in rebalance_actions:
            actions_desc.append(f"{a.action} {a.amount:.4f} {a.asset_symbol}")
            
        summary = (
            f"A portfolio rebalance is recommended to realign exposures with the {decision.profile_name} profile targets. "
            f"The proposed rebalance includes: {', '.join(actions_desc)}. "
            f"Drifts from target weights exceeded the 1.5% tolerance threshold. "
            f"Active risk score is {risk.total_score:.1f} ({risk.risk_band}), permitting execution under current bounds. "
            f"All trade sizes have been paced and clipped to prevent excessive price slippage or DEX liquidity impact."
        )
        
        # Add specific notes
        notes.append("Drifts exceeded active tolerance threshold of 1.5%.")
        notes.append("Concentration constraints and minimum cash buffer policies applied.")
        notes.append("Trade amounts clipped in accordance with volume pacing rules.")
        confidence = 0.90
        
    return {
        "reasoning_summary": summary,
        "confidence": confidence,
        "notes": notes
    }
