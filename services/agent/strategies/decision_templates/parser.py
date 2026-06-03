from __future__ import annotations

import json
import logging
import httpx
from services.agent.app.core.settings import get_settings
from services.agent.app.core.runtime_config import AI_DECISION_MAKER_ENABLED
from services.agent.app.schemas.portfolio import PortfolioSnapshot
from services.agent.app.schemas.risk import RiskSnapshot
from services.agent.app.schemas.allocation import AllocationDecision, RebalanceAction
from services.agent.app.schemas.recommendations import RecommendationResponse
from services.agent.strategies.decision_templates.prompt_builder import build_reasoning_prompt
from services.agent.strategies.decision_templates.fallback_rules import generate_deterministic_explanation

logger = logging.getLogger("services.agent.strategies.ai_parser")


def _override_with_ai_decision(
    decision: AllocationDecision,
    ai_output: dict,
) -> AllocationDecision:
    """Override the deterministic decision with the AI's recommended action."""
    from datetime import datetime
    ai_action = ai_output.get("recommended_action", decision.recommended_action)
    if ai_action not in ("HOLD", "REBALANCE", "PAUSE"):
        ai_action = decision.recommended_action
    return AllocationDecision(
        decision_id=decision.decision_id,
        wallet_or_vault=decision.wallet_or_vault,
        profile_name=decision.profile_name,
        current_weights=decision.current_weights,
        target_weights=decision.target_weights,
        recommended_action=ai_action,
        confidence=float(ai_output.get("confidence", decision.confidence)),
        reasoning=str(ai_output.get("reasoning_summary", decision.reasoning)),
        risk_snapshot_id=decision.risk_snapshot_id,
        status_code=decision.status_code,
        created_at=decision.created_at,
    )


async def generate_recommendation_reasoning(
    portfolio: PortfolioSnapshot,
    risk: RiskSnapshot,
    decision: AllocationDecision,
    rebalance_actions: list[RebalanceAction]
) -> RecommendationResponse:
    settings = get_settings()
    ai_decision_maker = AI_DECISION_MAKER_ENABLED
    prompt = build_reasoning_prompt(portfolio, risk, decision, rebalance_actions, ai_decision_maker=ai_decision_maker)

    explanation = None
    ai_disabled = True
    effective_decision = decision
    raw_response_text: str | None = None
    parsed_response: dict = {}
    fallback_reason: str | None = None

    ollama_url = settings.ollama_url

    try:
        if settings.ai_reasoning_enabled and settings.ai_reasoning_provider == "ollama":
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(f"{ollama_url}/api/tags")
                if response.status_code == 200:
                    ai_disabled = False
    except Exception:
        logger.debug("Ollama is not reachable at %s. Falling back to deterministic reasoning.", ollama_url)

    if not ai_disabled:
        try:
            payload = {
                "model": settings.ai_reasoning_model,
                "prompt": prompt,
                "stream": False,
                "format": "json",
            }
            logger.info("Sending prompt to Ollama at %s/api/generate", ollama_url)
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(f"{ollama_url}/api/generate", json=payload)
                if res.status_code == 200:
                    result_json = res.json()
                    raw_response_text = result_json.get("response", "").strip()
                    logger.debug("Ollama raw response: %s", raw_response_text)

                    parsed = json.loads(raw_response_text)
                    parsed_response = parsed if isinstance(parsed, dict) else {}
                    if ai_decision_maker:
                        if "recommended_action" in parsed:
                            effective_decision = _override_with_ai_decision(decision, parsed)
                            explanation = {
                                "reasoning_summary": parsed.get("reasoning_summary", effective_decision.reasoning),
                                "confidence": float(parsed.get("confidence", 0.90)),
                                "notes": list(parsed.get("notes", [])),
                            }
                    else:
                        if "reasoning_summary" in parsed:
                            explanation = {
                                "reasoning_summary": parsed["reasoning_summary"],
                                "confidence": float(parsed.get("confidence", 0.90)),
                                "notes": list(parsed.get("notes", [])),
                            }
                    if explanation is None:
                        fallback_reason = "AI response did not contain the expected reasoning fields."
        except Exception as exc:
            logger.warning("AI model query failed or output was invalid: %s. Falling back.", exc)
            fallback_reason = str(exc)

    if explanation is None:
        explanation = generate_deterministic_explanation(portfolio, risk, decision, rebalance_actions)
        parsed_response = explanation if not parsed_response else parsed_response
        metadata = {"ai_reasoning_enabled": False, "mode": "fallback_deterministic"}
        ai_debug_mode = "fallback_deterministic"
        used_fallback = True
    else:
        metadata = {
            "ai_reasoning_enabled": True,
            "mode": f"ollama:{settings.ai_reasoning_model}",
            "ai_decision_maker": ai_decision_maker,
            "ai_overrode_deterministic": ai_decision_maker and effective_decision.recommended_action != decision.recommended_action,
        }
        ai_debug_mode = f"ollama:{settings.ai_reasoning_model}"
        used_fallback = False

    asset_focus = "PORTFOLIO"
    if rebalance_actions:
        asset_focus = ", ".join(set(a.asset_symbol for a in rebalance_actions))

    required_human_approval = "NOT_REQUIRED"
    if effective_decision.recommended_action == "REBALANCE" and (risk.total_score > 65.0 or risk.risk_band == "RISK_REDUCE_ONLY"):
        required_human_approval = "REQUIRED"
    elif risk.risk_band in ("RISK_PAUSE_REQUIRED", "RISK_VETO"):
        required_human_approval = "BLOCKED"

    return RecommendationResponse(
        asset=asset_focus,
        recommended_action=effective_decision.recommended_action,
        risk_score=risk.total_score,
        confidence=float(explanation["confidence"]),
        reasoning_summary=str(explanation["reasoning_summary"]),
        data_sources_used=["portfolio_snapshot", "risk_snapshot", "allocation_decision"],
        hard_veto_status=risk.risk_band if risk.risk_band in ("RISK_VETO", "RISK_PAUSE_REQUIRED") else "NONE",
        required_human_approval_status=required_human_approval,
        status="ok" if risk.risk_band != "RISK_VETO" else "degraded",
        status_code=effective_decision.status_code,
        status_label=effective_decision.status_code,
        status_reason=effective_decision.reasoning,
        runtime_mode=settings.runtime_mode.value,
        target_chain=settings.target_chain.value,
        freshness_status=portfolio.status_code,
        constraints_applied=list(explanation.get("notes", [])),
        notes=risk.notes,
        ai_debug={
            "prompt": prompt,
            "raw_response": raw_response_text,
            "parsed_response": parsed_response,
            "mode": ai_debug_mode,
            "used_fallback": used_fallback,
            "ai_overrode_deterministic": ai_decision_maker and effective_decision.recommended_action != decision.recommended_action,
            "fallback_reason": fallback_reason,
        },
        metadata=metadata,
    )
