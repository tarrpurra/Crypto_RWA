from __future__ import annotations

from typing import Any


_CANONICAL_SYMBOL_MAP = {
    "METH": "mETH",
    "METH_MAINNET": "mETH",
    "SEPOLIA_METH": "mETH",
    "USDY": "USDY",
    "SEPOLIA_USDY": "USDY",
    "WMNT": "WMNT",
    "MNT": "WMNT",
    "SEPOLIA_WMNT": "WMNT",
    "WMNT_MAINNET": "WMNT",
    "TOKEN_A": "MockTokenA",
    "MOCK_TOKEN_A": "MockTokenA",
    "MOCKTOKENA": "MockTokenA",
    "TOKEN_B": "MockTokenB",
    "MOCK_TOKEN_B": "MockTokenB",
    "MOCKTOKENB": "MockTokenB",
}


def normalize_asset_symbol(symbol: str | None) -> str | None:
    if symbol is None:
        return None
    cleaned = str(symbol).strip()
    if not cleaned:
        return cleaned
    return _CANONICAL_SYMBOL_MAP.get(cleaned.upper(), cleaned)


def normalize_json_symbols(payload: Any) -> Any:
    if isinstance(payload, list):
        return [normalize_json_symbols(item) for item in payload]
    if isinstance(payload, dict):
        normalized: dict[str, Any] = {}
        for key, value in payload.items():
            if key in {"asset_symbol", "token_in_symbol", "token_out_symbol", "deposit_asset_symbol"}:
                normalized[key] = normalize_asset_symbol(value)
            else:
                normalized[key] = normalize_json_symbols(value)
        return normalized
    return payload
