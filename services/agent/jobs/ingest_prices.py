from __future__ import annotations

import asyncio
import json
import logging

from services.agent.modules.market_data import PRICE_SNAPSHOT_STORE, get_price_service


logger = logging.getLogger("services.agent.market_data.ingest_prices")


async def run_once() -> None:
    service = get_price_service()
    bundle = await service.fetch_latest_prices()
    PRICE_SNAPSHOT_STORE.write(bundle)
    logger.info(
        "Fetched %s normalized price snapshots and %s raw price snapshots.",
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


def main() -> None:
    asyncio.run(run_once())


if __name__ == "__main__":
    main()
