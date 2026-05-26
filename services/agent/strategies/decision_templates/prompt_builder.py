from __future__ import annotations

import json
from services.agent.app.schemas.portfolio import PortfolioSnapshot
from services.agent.app.schemas.risk import RiskSnapshot
from services.agent.app.schemas.allocation import AllocationDecision, RebalanceAction


def build_reasoning_prompt(
    portfolio: PortfolioSnapshot,
    risk: RiskSnapshot,
    decision: AllocationDecision,
    rebalance_actions: list[RebalanceAction]
) -> str:
    """
    Constructs the prompt for the AI reasoning layer, feeding it the exact state
    and requesting a structured explanation.
    """
    portfolio_data = {
        "total_value_usd": portfolio.total_value_usd,
        "balances": [
            {
                "asset": b.asset_symbol,
                "balance": b.balance,
                "value_usd": b.value_usd,
                "current_weight": b.weight,
            }
            for b in portfolio.balances
        ]
    }

    risk_data = {
        "total_score": risk.total_score,
        "risk_band": risk.risk_band,
        "bucket_scores": risk.bucket_scores,
        "prechecks": risk.prechecks,
        "notes": risk.notes
    }

    rebalance_data = [
        {
            "asset": a.asset_symbol,
            "action": a.action,
            "amount": a.amount
        }
        for a in rebalance_actions
    ]

    context = {
        "portfolio": portfolio_data,
        "risk": risk_data,
        "rebalance_target_profile": decision.profile_name,
        "proposed_rebalance_actions": rebalance_data,
        "recommended_decision": decision.recommended_action
    }

    prompt = f"""You are the AI Reasoning Layer of AIxRWA, a risk-managed portfolio allocator on Mantle.
Your job is to analyze the following structured portfolio, risk, and rebalance state, and provide a clear, professional reasoning narrative.

Context:
{json.dumps(context, indent=2)}

Please generate a JSON object matching this schema:
{{
  "reasoning_summary": "A concise paragraph explaining why this rebalance action (or HOLD/PAUSE) is recommended, discussing the active profile, current drifts, and how active risk conditions (like depeg, oracle freshness, or slippage) were taken into account.",
  "confidence": 0.0, // float between 0.0 and 1.0 representing your confidence in this decision
  "notes": [
    "Note 1: e.g., concentration cap constraint details",
    "Note 2: e.g., warning about slippage or oracle age",
    "Note 3: e.g., target weight alignments achieved"
  ]
}}

Make sure to respond with ONLY a valid, parseable JSON object, and no other conversational text.
"""
    return prompt
