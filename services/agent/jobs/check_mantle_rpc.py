from __future__ import annotations

import argparse
import asyncio
import json

from services.agent.app.core.settings import get_settings
from services.agent.modules.chain.quicknode import QuickNodeRpcClient, status_to_dict
from services.agent.modules.contracts.reader import get_pause_guardian_state


async def async_main(watch_heads: int) -> None:
    settings = get_settings()
    rpc_client = QuickNodeRpcClient(
        http_url=settings.effective_http_rpc_url,
        ws_url=settings.effective_wss_rpc_url,
    )

    status = await rpc_client.status()
    print(json.dumps(status_to_dict(status), indent=2))

    if settings.pause_guardian_address:
        pause_guardian_state = get_pause_guardian_state(
            rpc_url=settings.effective_http_rpc_url,
            foundry_out_dir=settings.foundry_out_dir,
            address=settings.pause_guardian_address,
        )
        print(json.dumps({"pause_guardian": pause_guardian_state}, indent=2))

    if watch_heads > 0:
        heads = await rpc_client.watch_new_heads(limit=watch_heads)
        print(json.dumps({"new_heads": heads}, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Check Mantle Sepolia RPC and Foundry contract wiring.")
    parser.add_argument(
        "--watch-heads",
        type=int,
        default=0,
        help="Number of newHeads websocket events to capture after the HTTP status check.",
    )
    args = parser.parse_args()
    asyncio.run(async_main(watch_heads=args.watch_heads))


if __name__ == "__main__":
    main()
