from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from web3 import HTTPProvider, Web3
from web3.exceptions import ContractLogicError

logger = logging.getLogger("services.agent.oracle.pyth_contract")

GET_PRICE_UNSAFE_SELECTOR = "0x00bdd8c8"


@dataclass(frozen=True)
class PythContractPrice:
    feed_id: str
    price: Decimal
    confidence: Decimal
    exponent: int
    publish_time: datetime


class PythContractReader:
    def __init__(self, rpc_url: str, contract_address: str, chain_name: str = "") -> None:
        self.web3 = Web3(HTTPProvider(rpc_url))
        self.contract_address = self.web3.to_checksum_address(contract_address)
        self.chain_name = chain_name
        self._unavailable_feeds: set[str] = set()

    def read_price(self, feed_id: str) -> PythContractPrice | None:
        if feed_id in self._unavailable_feeds:
            return None

        feed_id_hex = feed_id.removeprefix("0x").lower()
        call_data = GET_PRICE_UNSAFE_SELECTOR + feed_id_hex

        try:
            raw = self.web3.eth.call(
                {
                    "to": self.contract_address,
                    "data": call_data,
                }
            )
        except ContractLogicError:
            logger.debug(
                "Feed %s not found on Pyth contract (%s), will not retry.",
                feed_id,
                self.contract_address,
            )
            self._unavailable_feeds.add(feed_id)
            return None
        except Exception as exc:
            logger.warning(
                "Pyth contract RPC call failed for feed %s: %s: %r",
                feed_id,
                type(exc).__name__,
                exc,
            )
            return None

        if not raw or len(raw) < 128:
            logger.warning("Pyth contract returned short data for feed %s (%d bytes)", feed_id, len(raw or b""))
            return None

        price_i64 = int.from_bytes(raw[0:32], byteorder="big", signed=True)
        conf_i64 = int.from_bytes(raw[32:64], byteorder="big", signed=True)
        expo_i32 = int.from_bytes(raw[64:96], byteorder="big", signed=True)
        publish_i64 = int.from_bytes(raw[96:128], byteorder="big", signed=True)

        if publish_i64 <= 0:
            logger.debug("Pyth contract returned non-positive publish time for feed %s", feed_id)
            self._unavailable_feeds.add(feed_id)
            return None

        return PythContractPrice(
            feed_id=feed_id,
            price=Decimal(price_i64) * (Decimal(10) ** expo_i32),
            confidence=Decimal(conf_i64) * (Decimal(10) ** expo_i32),
            exponent=expo_i32,
            publish_time=datetime.fromtimestamp(publish_i64, tz=UTC),
        )

    def read_prices(self, feed_ids: list[str]) -> dict[str, PythContractPrice]:
        result: dict[str, PythContractPrice] = {}
        for feed_id in feed_ids:
            price = self.read_price(feed_id)
            if price is not None:
                result[feed_id] = price
        return result
