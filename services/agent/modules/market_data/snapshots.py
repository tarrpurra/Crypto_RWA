from __future__ import annotations

from dataclasses import dataclass, field

from services.agent.app.schemas.market_data import NormalizedPriceSnapshot, RawPriceSnapshot
from services.agent.app.schemas.quotes import NormalizedQuoteSnapshot, RawQuoteSnapshot


@dataclass
class PriceIngestionBundle:
    raw_snapshots: list[RawPriceSnapshot] = field(default_factory=list)
    normalized_snapshots: list[NormalizedPriceSnapshot] = field(default_factory=list)


@dataclass
class QuoteIngestionBundle:
    raw_snapshots: list[RawQuoteSnapshot] = field(default_factory=list)
    normalized_snapshots: list[NormalizedQuoteSnapshot] = field(default_factory=list)


class TransientPriceSnapshotStore:
    def __init__(self) -> None:
        self._latest_bundle = PriceIngestionBundle()

    def write(self, bundle: PriceIngestionBundle) -> None:
        self._latest_bundle = bundle

    def latest(self) -> PriceIngestionBundle:
        return self._latest_bundle


class TransientQuoteSnapshotStore:
    def __init__(self) -> None:
        self._latest_bundle = QuoteIngestionBundle()

    def write(self, bundle: QuoteIngestionBundle) -> None:
        self._latest_bundle = bundle

    def latest(self) -> QuoteIngestionBundle:
        return self._latest_bundle


PRICE_SNAPSHOT_STORE = TransientPriceSnapshotStore()
QUOTE_SNAPSHOT_STORE = TransientQuoteSnapshotStore()
