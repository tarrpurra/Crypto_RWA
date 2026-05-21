from __future__ import annotations

from dataclasses import dataclass, field

from services.agent.app.schemas.market_data import NormalizedPriceSnapshot, RawPriceSnapshot


@dataclass
class PriceIngestionBundle:
    raw_snapshots: list[RawPriceSnapshot] = field(default_factory=list)
    normalized_snapshots: list[NormalizedPriceSnapshot] = field(default_factory=list)


class TransientPriceSnapshotStore:
    def __init__(self) -> None:
        self._latest_bundle = PriceIngestionBundle()

    def write(self, bundle: PriceIngestionBundle) -> None:
        self._latest_bundle = bundle

    def latest(self) -> PriceIngestionBundle:
        return self._latest_bundle


PRICE_SNAPSHOT_STORE = TransientPriceSnapshotStore()
