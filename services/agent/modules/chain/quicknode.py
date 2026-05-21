from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, asdict
from typing import Any

import httpx
import websockets


@dataclass(frozen=True)
class ChainStatus:
    chain_id: int
    latest_block: int
    rpc_url: str
    websocket_enabled: bool


class QuickNodeRpcClient:
    def __init__(self, http_url: str, ws_url: str | None = None, timeout: float = 10.0) -> None:
        self.http_url = http_url
        self.ws_url = ws_url
        self.timeout = timeout

    async def rpc_call(self, method: str, params: list[Any] | None = None) -> Any:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or [],
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                self.http_url,
                headers={"Content-Type": "application/json"},
                json=payload,
            )
            response.raise_for_status()

        body = response.json()
        if body.get("error"):
            raise RuntimeError(f"RPC error for {method}: {body['error']}")
        return body["result"]

    async def latest_block_number(self) -> int:
        result = await self.rpc_call("eth_blockNumber")
        return int(result, 16)

    async def chain_id(self) -> int:
        result = await self.rpc_call("eth_chainId")
        return int(result, 16)

    async def status(self) -> ChainStatus:
        chain_id, latest_block = await asyncio.gather(
            self.chain_id(),
            self.latest_block_number(),
        )
        return ChainStatus(
            chain_id=chain_id,
            latest_block=latest_block,
            rpc_url=self.http_url,
            websocket_enabled=bool(self.ws_url),
        )

    async def watch_new_heads(self, limit: int = 1) -> list[dict[str, Any]]:
        if not self.ws_url:
            raise ValueError("A QuickNode websocket URL is required for head subscriptions.")
        if limit < 1:
            return []

        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_subscribe",
            "params": ["newHeads"],
        }

        heads: list[dict[str, Any]] = []
        async with websockets.connect(self.ws_url) as websocket:
            await websocket.send(json.dumps(request))
            subscription_response = json.loads(await websocket.recv())
            if subscription_response.get("error"):
                raise RuntimeError(f"Subscription failed: {subscription_response['error']}")

            while len(heads) < limit:
                message = json.loads(await websocket.recv())
                params = message.get("params", {})
                result = params.get("result")
                if result:
                    block_number = result.get("number")
                    heads.append(
                        {
                            "subscription": params.get("subscription"),
                            "number": int(block_number, 16) if block_number else None,
                            "hash": result.get("hash"),
                            "parentHash": result.get("parentHash"),
                        }
                    )

        return heads


def status_to_dict(status: ChainStatus) -> dict[str, Any]:
    return asdict(status)
