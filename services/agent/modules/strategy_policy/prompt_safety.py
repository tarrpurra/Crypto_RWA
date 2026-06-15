from __future__ import annotations

import re
from dataclasses import dataclass

INJECTION_PATTERNS = {
    "PROMPT_INJECTION": [
        r"ignore previous instructions",
        r"forget your role",
        r"act as unrestricted ai",
        r"developer mode",
        r"jailbreak",
        r"bypass risk checks",
        r"disable guardrails",
        r"execute without approval",
        r"ignore oracle",
        r"ignore slippage",
        r"trade all funds",
    ],
    "OUT_OF_DOMAIN": [
        r"\bwrite python\b",
        r"\bbuild me a website\b",
        r"\bgenerate malware\b",
        r"\bcreate a smart contract\b",
        r"\bsend private key\b",
        r"\bpretend to be another system\b",
        r"\banswer unrelated questions\b",
        r"\bcreate a new ui\b",
    ],
}


@dataclass(frozen=True)
class SafetyScanResult:
    status: str
    safety_score: int
    blocked_terms: list[str]
    warnings: list[str]
    safe_suggestion: str

    @property
    def is_safe(self) -> bool:
        return self.status == "safe"


def scan_prompt(prompt: str) -> SafetyScanResult:
    normalized = prompt.lower().strip()
    blocked_terms: list[str] = []
    warnings: list[str] = []
    score = 100

    if not normalized:
        return SafetyScanResult(
            status="rejected",
            safety_score=0,
            blocked_terms=["EMPTY_PROMPT"],
            warnings=["Strategy text is empty."],
            safe_suggestion="Describe only portfolio goals, risk preferences, asset limits, and market monitoring rules.",
        )

    for code, patterns in INJECTION_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, normalized, re.IGNORECASE):
                blocked_terms.append(code)
                score -= 30 if code == "PROMPT_INJECTION" else 25
                break

    if re.search(r"\b(private key|seed phrase|mnemonic|wallet password|api key)\b", normalized):
        blocked_terms.append("SECRET_DISCLOSURE")
        score -= 40

    if re.search(r"\b(write code|run code|debug code|shell command|powershell|bash script)\b", normalized):
        blocked_terms.append("AUTOMATION_REQUEST")
        score -= 15

    strategy_keywords = {
        "allocation": r"\ballocation\b",
        "asset": r"\b(asset|assets|USDY|mETH|USDT|DAI|WMNT|MNT)\b",
        "risk": r"\brisk\b",
        "slippage": r"\bslippage\b",
        "oracle": r"\boracle\b",
        "liquidity": r"\bliquidity\b",
        "circuit_breaker": r"\bcircuit breaker\b",
        "approval": r"\bapproval\b",
    }
    hits = [name for name, pattern in strategy_keywords.items() if re.search(pattern, normalized, re.IGNORECASE)]
    if len(hits) < 2:
        warnings.append("The prompt is broad. Add explicit allocation, risk, and limit details.")
        score -= 10

    if "ignore previous instructions" in normalized or "developer mode" in normalized:
        warnings.append("The text attempts to override system instructions.")

    score = max(0, min(100, score))
    if blocked_terms:
        return SafetyScanResult(
            status="rejected",
            safety_score=score,
            blocked_terms=sorted(set(blocked_terms)),
            warnings=warnings or ["Unsafe or out-of-domain strategy text detected."],
            safe_suggestion="Describe only portfolio objectives, allowed assets, hard limits, and monitoring cadence.",
        )

    return SafetyScanResult(
        status="safe",
        safety_score=score,
        blocked_terms=[],
        warnings=warnings,
        safe_suggestion="Describe only portfolio objectives, allowed assets, hard limits, and monitoring cadence.",
    )
