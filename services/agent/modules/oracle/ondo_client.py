from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from web3 import HTTPProvider, Web3


@dataclass(frozen=True)
class OndoOracleObservation:
    publish_time: datetime
    price: Decimal


class OndoOracleClient:
    def __init__(self, rpc_url: str) -> None:
        self.web3 = Web3(HTTPProvider(rpc_url))

    def fetch_redemption_price(self, oracle_address: str, method_selector: str, decimals: int) -> OndoOracleObservation:
        selector = method_selector.removeprefix("0x")
        if len(selector) != 8:
            raise ValueError("Ondo oracle method selector must be a 4-byte hex string.")

        call_result = self.web3.eth.call(
            {
                "to": self.web3.to_checksum_address(oracle_address),
                "data": f"0x{selector}",
            }
        )
        if not call_result:
            raise RuntimeError("Ondo oracle call returned no data.")

        raw_value = int.from_bytes(call_result, byteorder="big", signed=False)
        scaled_value = Decimal(raw_value) / (Decimal(10) ** decimals)
        return OndoOracleObservation(
            publish_time=datetime.now(UTC),
            price=scaled_value,
        )
