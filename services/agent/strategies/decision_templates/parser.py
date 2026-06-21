from __future__ import annotations

import json
import logging
import httpx
from services.agent.app.core.settings import get_settings
from services.agent.app.core import runtime_config
from services.agent.app.schemas.portfolio import PortfolioSnapshot
from services.agent.app.schemas.risk import RiskAssessmentResponse, RiskSnapshot
from services.agent.app.schemas.allocation import AllocationDecision, RebalanceAction
from services.agent.app.schemas.recommendations import RecommendationResponse
from services.agent.strategies.decision_templates.prompt_builder import build_allocation_prompt, build_reasoning_prompt
from services.agent.strategies.decision_templates.fallback_rules import generate_deterministic_explanation
from services.agent.strategies.allocation.swap_pairs import build_rebalance_swap_pair, build_swap_pair_label

logger = logging.getLogger("services.agent.ai")


def _serialize_portfolio_balances(portfolio: PortfolioSnapshot | None) -> list[dict[str, object]]:
    if portfolio is None:
        return []
    return [
        {
            "asset_symbol": balance.asset_symbol,
            "balance": balance.balance,
            "value_usd": balance.value_usd,
            "weight": balance.weight,
        }
        for balance in portfolio.balances
    ]


def _extract_json_payload(text: str) -> dict:
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = candidate.strip("`")
        candidate = candidate.removeprefix("json").strip()
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start >= 0 and end > start:
        candidate = candidate[start : end + 1]
    parsed = json.loads(candidate)
    if not isinstance(parsed, dict):
        raise ValueError("AI response JSON was not an object.")
    return parsed


def _log_ai_prompt(prompt_kind: str, prompt: str) -> None:
    logger.info("%s system prompt (%d chars):\n%s", prompt_kind, len(prompt), prompt)


def _normalized_provider_name(provider: str | None) -> str:
    return (provider or "").strip().lower() or "gemini"


def _extract_gemini_text(payload: dict) -> str:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        return ""

    parts: list[str] = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content")
        if not isinstance(content, dict):
            continue
        content_parts = content.get("parts")
        if not isinstance(content_parts, list):
            continue
        for part in content_parts:
            if isinstance(part, dict):
                text = part.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
    return "\n".join(parts).strip()


async def _call_ollama_json(prompt: str, settings, prompt_kind: str) -> tuple[dict, str, str]:
    ollama_url = settings.ollama_url.rstrip("/")
    model = settings.effective_ai_reasoning_model
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
    }
    _log_ai_prompt(prompt_kind, prompt)
    logger.info("Sending prompt to Ollama at %s/api/generate", ollama_url)
    async with httpx.AsyncClient(timeout=settings.effective_ai_reasoning_timeout_seconds) as client:
        res = await client.post(f"{ollama_url}/api/generate", json=payload)
    if res.status_code != 200:
        raise RuntimeError(f"Ollama returned HTTP {res.status_code}.")
    result_json = res.json()
    raw_response_text = result_json.get("response", "").strip()
    if not raw_response_text:
        raise RuntimeError("Ollama returned an empty response.")
    parsed = _extract_json_payload(raw_response_text)
    return parsed, raw_response_text, f"ollama:{model}"


async def _call_gemini_json(prompt: str, settings, prompt_kind: str) -> tuple[dict, str, str]:
    api_key = settings.effective_ai_reasoning_api_key
    if not api_key:
        raise RuntimeError("Gemini API key is not configured.")

    base_url = settings.effective_ai_reasoning_base_url
    model = settings.effective_ai_reasoning_model
    url = f"{base_url}/models/{model}:generateContent"
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }
    _log_ai_prompt(prompt_kind, prompt)
    logger.info("Sending prompt to Gemini at %s", url)
    async with httpx.AsyncClient(timeout=settings.effective_ai_reasoning_timeout_seconds) as client:
        res = await client.post(url, params={"key": api_key}, json=payload)
    if res.status_code != 200:
        raise RuntimeError(f"Gemini returned HTTP {res.status_code}.")
    result_json = res.json()
    raw_response_text = _extract_gemini_text(result_json)
    if not raw_response_text:
        raise RuntimeError("Gemini returned an empty response.")
    parsed = _extract_json_payload(raw_response_text)
    return parsed, raw_response_text, f"gemini:{model}"


async def _call_ai_json(prompt: str, settings, prompt_kind: str) -> tuple[dict, str, str]:
    provider = _normalized_provider_name(settings.ai_reasoning_provider)
    if provider == "gemini":
        return await _call_gemini_json(prompt, settings, prompt_kind)
    if provider == "ollama":
        return await _call_ollama_json(prompt, settings, prompt_kind)
    raise RuntimeError(f"Unsupported AI reasoning provider: {settings.ai_reasoning_provider}")


def _override_with_ai_decision(
    decision: AllocationDecision,
    ai_output: dict,
) -> AllocationDecision:
    """Return the deterministic decision while preserving AI suggestions in metadata elsewhere."""
    return AllocationDecision(
        decision_id=decision.decision_id,
        wallet_or_vault=decision.wallet_or_vault,
        profile_name=decision.profile_name,
        current_weights=decision.current_weights,
        target_weights=decision.target_weights,
        recommended_action=decision.recommended_action,
        confidence=decision.confidence,
        reasoning=decision.reasoning,
        risk_snapshot_id=decision.risk_snapshot_id,
        status_code=decision.status_code,
        created_at=decision.created_at,
    )


def _apply_allocation_guardrails(
    ai_response: dict,
    deposit_amount: float,
    deposit_asset_symbol: str,
    target_weights: dict[str, float],
    risk_assessment: RiskAssessmentResponse | None,
    profile_name: str,
) -> tuple[AllocationDecision, list[RebalanceAction]]:
    from services.agent.app.core.status_codes import RiskStatusCode, DataStatusCode
    from services.agent.modules.oracle.freshness import utc_now
    from services.agent.strategies.allocation.clip_sizing import clip_trade_amount

    now = utc_now()
    recommended_action = ai_response.get("recommended_action", "HOLD")
    confidence = float(ai_response.get("confidence", 0.85))
    reasoning = ai_response.get("reasoning_summary", "AI-generated allocation plan.")
    notes = list(ai_response.get("notes", []))
    raw_allocations = ai_response.get("allocations", [])

    risk_code = risk_assessment.status_code if risk_assessment else RiskStatusCode.RISK_NORMAL.value
    hard_veto_active = (risk_assessment and risk_assessment.hard_veto_status == "active") or risk_code in (RiskStatusCode.RISK_VETO.value, RiskStatusCode.RISK_PAUSE_REQUIRED.value)

    if hard_veto_active:
        recommended_action = "PAUSE"
        reasoning = f"Allocation blocked by active risk: {risk_code}. {risk_assessment.status_reason if risk_assessment else ''}"
        confidence = 0.99
        decision = AllocationDecision(
            decision_id=f"ai_allocation_{int(now.timestamp())}",
            wallet_or_vault="investment_scope",
            profile_name=profile_name,
            current_weights={deposit_asset_symbol: 1.0},
            target_weights=dict(target_weights),
            recommended_action="PAUSE",
            confidence=confidence,
            reasoning=reasoning,
            risk_snapshot_id=str(risk_assessment.metadata.get("risk_snapshot_id") or "") if risk_assessment else None,
            status_code=risk_code,
            created_at=now,
        )
        return decision, []

    actions: list[RebalanceAction] = []
    for alloc in raw_allocations:
        asset = alloc.get("asset", "")
        action = alloc.get("action", "HOLD")
        amount = float(alloc.get("amount", 0))
        if amount <= 0:
            continue
        token_in_symbol, token_out_symbol = build_rebalance_swap_pair(
            action,
            asset,
            preferred_source_symbol=deposit_asset_symbol,
        )
        if action == "HOLD":
            actions.append(
                RebalanceAction(
                    asset_symbol=asset,
                    action="HOLD",
                    amount=amount,
                    route_id=None,
                    token_in_symbol=token_in_symbol,
                    token_out_symbol=token_out_symbol,
                    swap_pair_label=build_swap_pair_label(token_in_symbol, token_out_symbol),
                )
            )
        elif action == "BUY":
            clipped = clip_trade_amount(asset, amount * 1.0, deposit_amount)
            actions.append(
                RebalanceAction(
                    asset_symbol=asset,
                    action="BUY",
                    amount=clipped,
                    route_id=f"ai_route_{asset.lower()}",
                    token_in_symbol=token_in_symbol,
                    token_out_symbol=token_out_symbol,
                    swap_pair_label=build_swap_pair_label(token_in_symbol, token_out_symbol),
                )
            )

    if not actions:
        recommended_action = "HOLD"
        reasoning = "AI generated no actionable allocations."

    status_code = DataStatusCode.DATA_FRESH.value if not hard_veto_active else risk_code

    decision = AllocationDecision(
        decision_id=f"ai_allocation_{int(now.timestamp())}",
        wallet_or_vault="investment_scope",
        profile_name=profile_name,
        current_weights={deposit_asset_symbol: 1.0},
        target_weights=dict(target_weights),
        recommended_action=recommended_action,
        confidence=confidence,
        reasoning=reasoning,
        risk_snapshot_id=str(risk_assessment.metadata.get("risk_snapshot_id") or "") if risk_assessment else None,
        status_code=status_code,
        created_at=now,
    )
    return decision, actions


async def generate_ai_allocation(
    portfolio_value_usd: float,
    deposit_asset_symbol: str,
    deposit_amount: float,
    target_weights: dict[str, float],
    risk_assessment: RiskAssessmentResponse | None,
    profile_name: str,
    portfolio: PortfolioSnapshot | None = None,
) -> tuple[AllocationDecision, list[RebalanceAction]]:
    settings = get_settings()
    from services.agent.app.core.status_codes import RiskStatusCode

    risk_status = risk_assessment.status_code if risk_assessment else RiskStatusCode.RISK_NORMAL.value
    risk_score = risk_assessment.risk_score if risk_assessment else 0.0
    risk_notes = list(risk_assessment.notes) if risk_assessment else []

    prompt = build_allocation_prompt(
        portfolio_value_usd=portfolio_value_usd,
        deposit_asset_symbol=deposit_asset_symbol,
        deposit_amount=deposit_amount,
        target_weights=target_weights,
        risk_status=risk_status,
        risk_score=risk_score,
        risk_notes=risk_notes,
        profile_name=profile_name,
        portfolio_balances=_serialize_portfolio_balances(portfolio),
    )

    ai_response_text: str | None = None
    parsed: dict = {}
    fallback_reason: str | None = None
    provider_label = settings.ai_reasoning_model_label

    if not settings.ai_reasoning_enabled:
        fallback_reason = "AI reasoning is disabled by settings."
    else:
        try:
            parsed, ai_response_text, provider_label = await _call_ai_json(prompt, settings, "Allocation AI")
            logger.info("%s allocation raw response: %s", settings.normalized_ai_reasoning_provider.capitalize(), ai_response_text)
            logger.info("%s allocation parsed response: %s", settings.normalized_ai_reasoning_provider.capitalize(), parsed)
        except Exception as exc:
            fallback_reason = f"{settings.normalized_ai_reasoning_provider.capitalize()} allocation query failed: {exc}"
            logger.warning("AI allocation query failed: %s. Using deterministic fallback.", exc)

    if not parsed:
        logger.info("AI allocation unavailable or failed; using deterministic allocation. reason=%s", fallback_reason)
        return _deterministic_allocation(
            deposit_asset_symbol=deposit_asset_symbol,
            deposit_amount=deposit_amount,
            target_weights=target_weights,
            risk_assessment=risk_assessment,
            profile_name=profile_name,
        )

    return _apply_allocation_guardrails(
        ai_response=parsed,
        deposit_amount=deposit_amount,
        deposit_asset_symbol=deposit_asset_symbol,
        target_weights=target_weights,
        risk_assessment=risk_assessment,
        profile_name=profile_name,
    )


def _deterministic_allocation(
    deposit_asset_symbol: str,
    deposit_amount: float,
    target_weights: dict[str, float],
    risk_assessment: RiskAssessmentResponse | None,
    profile_name: str,
) -> tuple[AllocationDecision, list[RebalanceAction]]:
    from services.agent.app.core.status_codes import RiskStatusCode, DataStatusCode
    from services.agent.modules.oracle.freshness import utc_now
    from services.agent.strategies.allocation.clip_sizing import clip_trade_amount

    now = utc_now()
    risk_code = risk_assessment.status_code if risk_assessment else RiskStatusCode.RISK_NORMAL.value
    hard_veto_active = (risk_assessment and risk_assessment.hard_veto_status == "active") or risk_code in (RiskStatusCode.RISK_VETO.value, RiskStatusCode.RISK_PAUSE_REQUIRED.value)

    if hard_veto_active:
        decision = AllocationDecision(
            decision_id=f"det_allocation_{int(now.timestamp())}",
            wallet_or_vault="investment_scope",
            profile_name=profile_name,
            current_weights={deposit_asset_symbol: 1.0},
            target_weights=dict(target_weights),
            recommended_action="PAUSE",
            confidence=0.99,
            reasoning=f"Allocation blocked by active risk: {risk_code}. {risk_assessment.status_reason if risk_assessment else ''}",
            risk_snapshot_id=str(risk_assessment.metadata.get("risk_snapshot_id") or "") if risk_assessment else None,
            status_code=risk_code,
            created_at=now,
        )
        return decision, []

    retained_weight = target_weights.get(deposit_asset_symbol, 0.0)
    retained_amount = deposit_amount * retained_weight
    actions: list[RebalanceAction] = []
    if retained_amount > 0:
        token_in_symbol, token_out_symbol = build_rebalance_swap_pair(
            "HOLD",
            deposit_asset_symbol,
            preferred_source_symbol=deposit_asset_symbol,
        )
        actions.append(
            RebalanceAction(
                asset_symbol=deposit_asset_symbol,
                action="HOLD",
                amount=round(retained_amount, 8),
                route_id=None,
                token_in_symbol=token_in_symbol,
                token_out_symbol=token_out_symbol,
                swap_pair_label=build_swap_pair_label(token_in_symbol, token_out_symbol),
            )
        )

    for asset, weight in target_weights.items():
        if asset.upper() == deposit_asset_symbol.upper():
            continue
        amount_in = deposit_amount * weight
        if amount_in <= 0:
            continue
        clipped = clip_trade_amount(asset, amount_in, deposit_amount)
        if clipped > 0:
            token_in_symbol, token_out_symbol = build_rebalance_swap_pair(
                "BUY",
                asset,
                preferred_source_symbol=deposit_asset_symbol,
            )
            actions.append(
                RebalanceAction(
                    asset_symbol=asset,
                    action="BUY",
                    amount=round(clipped, 8),
                    route_id=f"det_route_{asset.lower()}",
                    token_in_symbol=token_in_symbol,
                    token_out_symbol=token_out_symbol,
                    swap_pair_label=build_swap_pair_label(token_in_symbol, token_out_symbol),
                )
            )

    has_buys = any(a.action == "BUY" for a in actions)
    recommended_action = "REBALANCE" if has_buys else "HOLD"
    reasoning = f"Deterministic allocation using {profile_name} profile."
    if risk_code in (RiskStatusCode.RISK_REBALANCE_ONLY.value, RiskStatusCode.RISK_CAUTION.value):
        reasoning += f" Risk: {risk_code}. Trades constrained accordingly."

    decision = AllocationDecision(
        decision_id=f"det_allocation_{int(now.timestamp())}",
        wallet_or_vault="investment_scope",
        profile_name=profile_name,
        current_weights={deposit_asset_symbol: 1.0},
        target_weights=dict(target_weights),
        recommended_action=recommended_action,
        confidence=0.90,
        reasoning=reasoning,
        risk_snapshot_id=str(risk_assessment.metadata.get("risk_snapshot_id") or "") if risk_assessment else None,
        status_code=DataStatusCode.DATA_FRESH.value,
        created_at=now,
    )
    return decision, actions


async def generate_recommendation_reasoning(
    portfolio: PortfolioSnapshot,
    risk: RiskSnapshot,
    decision: AllocationDecision,
    rebalance_actions: list[RebalanceAction]
) -> RecommendationResponse:
    settings = get_settings()
    ai_decision_maker = runtime_config.get_ai_decision_maker_enabled()
    prompt = build_reasoning_prompt(
        portfolio,
        risk,
        decision,
        rebalance_actions,
        drift_tolerance_pct=settings.rebalance_drift_tolerance,
        ai_decision_maker=ai_decision_maker,
    )

    explanation = None
    effective_decision = decision
    raw_response_text: str | None = None
    parsed_response: dict = {}
    fallback_reason: str | None = None
    provider_label = settings.ai_reasoning_model_label

    if settings.ai_reasoning_enabled:
        try:
            parsed, raw_response_text, provider_label = await _call_ai_json(prompt, settings, "Reasoning AI")
            parsed_response = parsed
            logger.info("%s reasoning parsed response: %s", settings.normalized_ai_reasoning_provider.capitalize(), parsed_response)
            if ai_decision_maker:
                if "recommended_action" in parsed:
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
            fallback_reason = f"{settings.normalized_ai_reasoning_provider.capitalize()} reasoning query failed: {exc}"
            raw_response_text = raw_response_text or None

    if explanation is None:
        explanation = generate_deterministic_explanation(
            portfolio,
            risk,
            decision,
            rebalance_actions,
            drift_tolerance_pct=settings.rebalance_drift_tolerance,
        )
        parsed_response = explanation if not parsed_response else parsed_response
        metadata = {"ai_reasoning_enabled": False, "mode": "fallback_deterministic"}
        ai_debug_mode = "fallback_deterministic"
        used_fallback = True
    else:
        metadata = {
            "ai_reasoning_enabled": True,
            "mode": "ai_decision_maker" if ai_decision_maker else "ai_recommender",
            "ai_model": provider_label,
            "ai_decision_maker": ai_decision_maker,
            "ai_overrode_deterministic": False,
            "ai_suggested_action": parsed_response.get("recommended_action") if isinstance(parsed_response, dict) else None,
        }
        ai_debug_mode = provider_label
        used_fallback = False

    asset_focus = "PORTFOLIO"
    actionable_assets = [action.asset_symbol for action in rebalance_actions if action.action != "HOLD" and action.amount > 0]
    if actionable_assets:
        asset_focus = ", ".join(dict.fromkeys(actionable_assets))

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
            "ai_overrode_deterministic": False,
            "fallback_reason": fallback_reason,
        },
        metadata=metadata,
    )
