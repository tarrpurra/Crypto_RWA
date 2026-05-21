from __future__ import annotations

from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot


STATUS_PRIORITY = {
    "QUOTE_FRESH": 0,
    "DATA_PARTIAL": 1,
    "LIQUIDITY_UNKNOWN": 2,
    "DATA_MISSING": 3,
}


def rank_quotes(quotes: list[NormalizedQuoteSnapshot]) -> list[NormalizedQuoteSnapshot]:
    ordered = sorted(
        quotes,
        key=lambda quote: (
            STATUS_PRIORITY.get(quote.status_code, 99),
            -(float(quote.amount_out) if quote.amount_out is not None else -1.0),
        ),
    )
    ranked: list[NormalizedQuoteSnapshot] = []
    for index, quote in enumerate(ordered, start=1):
        ranked.append(quote.model_copy(update={"candidate_rank": index}))
    return ranked
