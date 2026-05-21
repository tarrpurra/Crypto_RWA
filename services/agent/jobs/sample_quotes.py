from __future__ import annotations

import json
import logging

from services.agent.modules.market_data import QUOTE_SNAPSHOT_STORE
from services.agent.modules.quotes import get_quote_service
from services.agent.repositories.db.market_repository import MarketDataRepository


logger = logging.getLogger("services.agent.quotes.sample_quotes")


def main() -> None:
    service = get_quote_service()
    repository = MarketDataRepository()
    bundle = service.sample_latest_quotes()
    QUOTE_SNAPSHOT_STORE.write(bundle)
    repository.save_quote_bundle(bundle)
    logger.info(
        "Sampled %s normalized quote snapshots and %s raw quote snapshots.",
        len(bundle.normalized_snapshots),
        len(bundle.raw_snapshots),
    )
    print(
        json.dumps(
            {
                "normalized_snapshots": [snapshot.model_dump(mode="json") for snapshot in bundle.normalized_snapshots],
                "raw_snapshots": [snapshot.model_dump(mode="json") for snapshot in bundle.raw_snapshots],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
