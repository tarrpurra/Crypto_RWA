from __future__ import annotations

from collections.abc import Mapping


def normalize_swap_symbol(symbol: str | None) -> str | None:
    if symbol is None:
        return None
    if symbol.upper() == "MNT":
        return "WMNT"
    return symbol


def _lookup_weight(weights: Mapping[str, float], symbol: str) -> float:
    upper = symbol.upper()
    for key, value in weights.items():
        if key.upper() == upper:
            return float(value)
    return 0.0


def _select_overweight_source(
    current_weights: Mapping[str, float],
    target_weights: Mapping[str, float],
    *,
    exclude_symbol: str | None = None,
) -> str | None:
    exclude_upper = exclude_symbol.upper() if exclude_symbol else None
    overweight_candidates: list[tuple[float, float, str]] = []
    fallback_candidates: list[tuple[float, str]] = []

    for asset_symbol, current_weight in current_weights.items():
        if exclude_upper and asset_symbol.upper() == exclude_upper:
            continue
        target_weight = _lookup_weight(target_weights, asset_symbol)
        drift = float(current_weight) - target_weight
        if drift > 0:
            overweight_candidates.append((drift, float(current_weight), asset_symbol))
        fallback_candidates.append((float(current_weight), asset_symbol))

    if overweight_candidates:
        return max(overweight_candidates, key=lambda item: (item[0], item[1]))[2]
    if fallback_candidates:
        return max(fallback_candidates, key=lambda item: (item[0], item[1]))[1]
    return None


def _select_underweight_target(
    current_weights: Mapping[str, float],
    target_weights: Mapping[str, float],
    *,
    exclude_symbol: str | None = None,
) -> str | None:
    exclude_upper = exclude_symbol.upper() if exclude_symbol else None
    underweight_candidates: list[tuple[float, float, str]] = []
    fallback_candidates: list[tuple[float, str]] = []

    for asset_symbol, target_weight in target_weights.items():
        if exclude_upper and asset_symbol.upper() == exclude_upper:
            continue
        current_weight = _lookup_weight(current_weights, asset_symbol)
        drift = float(target_weight) - current_weight
        if drift > 0:
            underweight_candidates.append((drift, float(target_weight), asset_symbol))
        fallback_candidates.append((float(target_weight), asset_symbol))

    if underweight_candidates:
        return max(underweight_candidates, key=lambda item: (item[0], item[1]))[2]
    if fallback_candidates:
        return max(fallback_candidates, key=lambda item: (item[0], item[1]))[1]
    return None


def build_rebalance_swap_pair(
    action: str,
    asset_symbol: str,
    current_weights: Mapping[str, float] | None = None,
    target_weights: Mapping[str, float] | None = None,
    *,
    preferred_source_symbol: str | None = None,
    preferred_target_symbol: str | None = None,
) -> tuple[str | None, str | None]:
    normalized_asset = normalize_swap_symbol(asset_symbol)
    if normalized_asset is None:
        return None, None

    action_upper = action.upper()
    if action_upper == "HOLD":
        return normalized_asset, normalized_asset

    current_weights = current_weights or {}
    target_weights = target_weights or {}

    if action_upper == "BUY":
        source_symbol = normalize_swap_symbol(preferred_source_symbol)
        if source_symbol is None:
            source_symbol = _select_overweight_source(current_weights, target_weights, exclude_symbol=asset_symbol)
        if source_symbol is None:
            source_symbol = _select_overweight_source(current_weights, target_weights) or normalized_asset
        return source_symbol, normalized_asset

    if action_upper == "SELL":
        target_symbol = normalize_swap_symbol(preferred_target_symbol)
        if target_symbol is None:
            target_symbol = _select_underweight_target(current_weights, target_weights, exclude_symbol=asset_symbol)
        if target_symbol is None:
            target_symbol = _select_underweight_target(current_weights, target_weights) or normalized_asset
        return normalized_asset, target_symbol

    return normalized_asset, normalized_asset


def build_swap_pair_label(token_in_symbol: str | None, token_out_symbol: str | None) -> str | None:
    if not token_in_symbol or not token_out_symbol:
        return None
    return f"{token_in_symbol} -> {token_out_symbol}"
