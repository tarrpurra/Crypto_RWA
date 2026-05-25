# AI + Data Analytics Phase 5 Plan

## Purpose

Phase 5 adds an AI reasoning wrapper around deterministic allocation output.

The AI layer explains decisions. It does not override portfolio, risk, allocation, policy, or proposal guards.

## Phase Goal

Build a local-safe reasoning layer with:

- structured prompt context
- strict JSON response expectation for model output
- deterministic fallback explanations
- explicit AI-enabled metadata
- stable `/decisions` API surface
- no secret logging or hidden execution side effects

## Implemented Surfaces

- `GET /decisions`

## Implemented Behavior

- AI reasoning is disabled by default with `AI_REASONING_ENABLED=false`.
- When disabled or unavailable, deterministic fallback explanations are returned.
- Ollama can be enabled through settings with:
  - `AI_REASONING_ENABLED=true`
  - `AI_REASONING_PROVIDER=ollama`
  - `AI_REASONING_MODEL=...`
  - `OLLAMA_URL=...`
- Invalid model output falls back to deterministic explanation.
- Recommendation output preserves:
  - `asset`
  - `recommended_action`
  - `risk_score`
  - `confidence`
  - `reasoning_summary`
  - `data_sources_used`
  - `hard_veto_status`
  - `required_human_approval_status`

## Safety Boundaries

- AI does not create proposals.
- AI does not change deterministic action, risk score, or hard veto status.
- Missing or degraded deterministic inputs must remain visible in the returned recommendation.

## Status

`Phase 5 local-safe coding complete; production model observability and persistence can be expanded later.`
