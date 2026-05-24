from __future__ import annotations

import json
import logging
import httpx
from services.agent.app.core.settings import get_settings
from services.agent.app.schemas.portfolio import PortfolioSnapshot
from services.agent.app.schemas.risk import RiskSnapshot
from services.agent.app.schemas.allocation import AllocationDecision, RebalanceAction
from services.agent.app.schemas.recommendations import RecommendationResponse
from services.agent.strategies.decision_templates.prompt_builder import build_reasoning_prompt
from services.agent.strategies.decision_templates.fallback_rules import generate_deterministic_explanation

logger = logging.getLogger("services.agent.strategies.ai_parser")


async def generate_recommendation_reasoning(
    portfolio: PortfolioSnapshot,
    risk: RiskSnapshot,
    decision: AllocationDecision,
    rebalance_actions: list[RebalanceAction]
) -> RecommendationResponse:
    settings = get_settings()
    prompt = build_reasoning_prompt(portfolio, risk, decision, rebalance_actions)
    
    explanation = None
    ai_disabled = True
    
    import os
    # We will look for an environment variable OLLAMA_URL or similar to see if we can call it.
    # Note: PYTH_HERMES_URL is configured, but no LLM URL is in settings by default.
    # We can allow settings to be extended or read OLLAMA_URL from environment.
    ollama_url = os.environ.get("OLLAMA_URL", getattr(settings, "ollama_url", "http://host.docker.internal:11434"))
    
    try:
        # Check if Ollama service is reachable
        async with httpx.AsyncClient(timeout=3.0) as client:
            # We check if Ollama is running by hitting its tags endpoint or base
            response = await client.get(f"{ollama_url}/api/tags")
            if response.status_code == 200:
                ai_disabled = False
    except Exception:
        # Ollama not reachable, which is expected since it's not installed on the host yet
        logger.debug("Ollama is not reachable at %s. Falling back to deterministic reasoning.", ollama_url)

    if not ai_disabled:
        try:
            payload = {
                "model": "qwen2.5:3b",  # or gemma:2b
                "prompt": prompt,
                "stream": False,
                "format": "json",
            }
            logger.info("Sending prompt to Ollama at %s/api/generate", ollama_url)
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(f"{ollama_url}/api/generate", json=payload)
                if res.status_code == 200:
                    result_json = res.json()
                    response_text = result_json.get("response", "").strip()
                    logger.debug("Ollama raw response: %s", response_text)
                    
                    parsed = json.loads(response_text)
                    if "reasoning_summary" in parsed:
                        explanation = {
                            "reasoning_summary": parsed["reasoning_summary"],
                            "confidence": float(parsed.get("confidence", 0.90)),
                            "notes": list(parsed.get("notes", [])),
                        }
        except Exception as exc:
            logger.warning("AI model query failed or output was invalid: %s. Falling back.", exc)

    # Fallback to deterministic rules if AI failed or is disabled
    if explanation is None:
        explanation = generate_deterministic_explanation(portfolio, risk, decision, rebalance_actions)
        metadata = {"ai_reasoning_enabled": False, "mode": "fallback_deterministic"}
    else:
        metadata = {"ai_reasoning_enabled": True, "mode": "ollama_qwen_3b"}

    # Map to RecommendationResponse DTO
    # Required fields in RecommendationResponse:
    # - asset
    # - recommended_action
    # - risk_score
    # - confidence
    # - reasoning_summary
    # - data_sources_used
    # - hard_veto_status
    # - required_human_approval_status
    # - status
    # - status_code
    # - status_label
    # - status_reason
    # - runtime_mode
    # - target_chain
    # - freshness_status
    # - constraints_applied
    # - notes
    # - metadata
    
    # Determine the asset in focus (e.g. mETH if rebalancing mETH, or portfolio-wide)
    asset_focus = "PORTFOLIO"
    if rebalance_actions:
        asset_focus = ", ".join(set(a.asset_symbol for a in rebalance_actions))

    # Required human approval status
    # High risk rebalances (e.g. total risk > 65 or portfolio value shift > 20%) require approval
    required_human_approval = "NOT_REQUIRED"
    if decision.recommended_action == "REBALANCE" and (risk.total_score > 65.0 or risk.risk_band == "RISK_REDUCE_ONLY"):
        required_human_approval = "REQUIRED"
    elif risk.risk_band in ("RISK_PAUSE_REQUIRED", "RISK_VETO"):
        required_human_approval = "BLOCKED"

    return RecommendationResponse(
        asset=asset_focus,
        recommended_action=decision.recommended_action,
        risk_score=risk.total_score,
        confidence=float(explanation["confidence"]),
        reasoning_summary=str(explanation["reasoning_summary"]),
        data_sources_used=["ondo_oracle", "pyth_oracle", "agni_quotes", "merchant_moe_quotes"],
        hard_veto_status=risk.risk_band if risk.risk_band in ("RISK_VETO", "RISK_PAUSE_REQUIRED") else "NONE",
        required_human_approval_status=required_human_approval,
        status="ok" if risk.risk_band != "RISK_VETO" else "degraded",
        status_code=decision.status_code,
        status_label=decision.status_code,
        status_reason=decision.reasoning,
        runtime_mode=settings.runtime_mode.value,
        target_chain=settings.target_chain.value,
        freshness_status=portfolio.status_code,
        constraints_applied=list(explanation.get("notes", [])),
        notes=risk.notes,
        metadata=metadata,
    )
