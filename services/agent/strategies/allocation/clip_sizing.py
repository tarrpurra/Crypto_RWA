from __future__ import annotations

import logging

logger = logging.getLogger("services.agent.strategies.clip_sizing")


def clip_trade_amount(asset_symbol: str, requested_val_usd: float, total_portfolio_val_usd: float) -> float:
    """
    Limits the trade size of a single rebalance step to:
    - mETH: max 10% of portfolio or $30k
    - USDY: max 15% of portfolio or $50k
    - Other assets: max 20% of portfolio or $75k

    On test networks with small portfolios, a minimum floor ensures
    trades are not clipped to unusably small values.
    Returns the clipped USD value of the trade.
    """
    if total_portfolio_val_usd <= 0:
        return 0.0

    MIN_TRADE_USD = 100.0

    if asset_symbol == "mETH":
        pct_limit = 0.10
        abs_limit = 30000.0
    elif asset_symbol == "USDY":
        pct_limit = 0.15
        abs_limit = 50000.0
    else:  # other / stables
        pct_limit = 0.20
        abs_limit = 75000.0

    limit_from_pct = total_portfolio_val_usd * pct_limit
    max_allowed = max(limit_from_pct, MIN_TRADE_USD)
    max_allowed = min(max_allowed, abs_limit)

    if requested_val_usd > max_allowed:
        logger.info(
            "Clipping trade size for %s: requested $%.2f exceeds max allowed $%.2f",
            asset_symbol, requested_val_usd, max_allowed
        )
        return max_allowed

    return requested_val_usd
