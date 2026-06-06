from __future__ import annotations

import json
from services.agent.app.schemas.portfolio import PortfolioSnapshot
from services.agent.app.schemas.risk import RiskSnapshot
from services.agent.app.schemas.allocation import AllocationDecision, RebalanceAction


def build_reasoning_prompt(
    portfolio: PortfolioSnapshot,
    risk: RiskSnapshot,
    decision: AllocationDecision,
    rebalance_actions: list[RebalanceAction],
    ai_decision_maker: bool = False,
) -> str:
    """
    Constructs the prompt for the AI reasoning layer.

    When ai_decision_maker is False: AI explains the deterministic decision.
    When ai_decision_maker is True: AI evaluates and makes the final decision.
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

    if ai_decision_maker:
        prompt = f"""You are the AI Decision Maker of AIxRWA, a risk-managed portfolio allocator on Mantle.
Your role is to evaluate the portfolio, risk, and market state below and decide the best action.

Context:
{json.dumps(context, indent=2)}

Decision rules:
- The deterministic engine suggests: {decision.recommended_action}
- You may AGREE with this recommendation or OVERRIDE it with a different action.
- Valid actions: "HOLD" (no trades), "REBALANCE" (execute proposed trades), "PAUSE" (stop all trading).
- Consider all risk factors including oracle freshness, depeg risk, liquidity/slippage, and concentration limits.
- You must still respect hard risk constraints: if risk_band is RISK_VETO or RISK_PAUSE_REQUIRED, you must choose PAUSE.

Please generate a JSON object matching this schema:
{{
  "recommended_action": "HOLD",
  "reasoning_summary": "A concise paragraph explaining your decision, including which factors you weighed most heavily.",
  "confidence": 0.0,
  "notes": [
    "Note 1: key risk observation",
    "Note 2: market condition note",
    "Note 3: adjustment rationale if overriding deterministic recommendation"
  ]
}}

Make sure to respond with ONLY a valid, parseable JSON object, and no other conversational text.
"""
    else:
        prompt = f"""You are the AI Reasoning Layer of AIxRWA, a risk-managed portfolio allocator on Mantle.
Your job is to analyze the following structured portfolio, risk, and rebalance state, and provide a clear, professional reasoning narrative.

Context:
{json.dumps(context, indent=2)}

Please generate a JSON object matching this schema:
{{
  "reasoning_summary": "A concise paragraph explaining why this rebalance action (or HOLD/PAUSE) is recommended, discussing the active profile, current drifts, and how active risk conditions (like depeg, oracle freshness, or slippage) were taken into account.",
  "confidence": 0.0,
  "notes": [
    "Note 1: e.g., concentration cap constraint details",
    "Note 2: e.g., warning about slippage or oracle age",
    "Note 3: e.g., target weight alignments achieved"
  ]
}}

Make sure to respond with ONLY a valid, parseable JSON object, and no other conversational text.
"""
    return prompt
