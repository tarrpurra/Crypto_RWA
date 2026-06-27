from __future__ import annotations

AI_DECISION_MAKER_ENABLED: bool = True


def get_ai_decision_maker_enabled() -> bool:
    return AI_DECISION_MAKER_ENABLED


def set_ai_decision_maker_enabled(enabled: bool) -> bool:
    global AI_DECISION_MAKER_ENABLED
    AI_DECISION_MAKER_ENABLED = bool(enabled)
    return AI_DECISION_MAKER_ENABLED
