from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from services.agent.app.core.settings import Settings, TargetChain, get_settings
from services.agent.modules.oracle.hermes_client import HermesClient
from services.agent.modules.oracle.pyth_contract import PythContractReader
from services.agent.modules.oracle.pyth_parser import PythPriceObservation, parse_hermes_price_update

logger = logging.getLogger("services.agent.oracle.oracle_fallback_service")


class OracleFallbackService:
    """Priority-chain oracle fallback.

    Order:
    1. Pyth Hermes (live HTTP)
    2. On-chain Pyth contract (RPC, no Hermes dependency)
    3. No data → caller handles via persisted fallback
    """

    def __init__(
        self,
        settings: Settings | None = None,
        hermes_client: HermesClient | None = None,
        pyth_contract: PythContractReader | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.hermes_client = hermes_client or HermesClient(
            base_url=self.settings.pyth_hermes_url,
            latest_price_path=self.settings.pyth_hermes_latest_price_path,
            connect_timeout=self.settings.pyth_hermes_connect_timeout_seconds,
            timeout=self.settings.pyth_hermes_read_timeout_seconds,
        )
        self.pyth_contract = pyth_contract or self._build_pyth_contract()

    def _build_pyth_contract(self) -> PythContractReader | None:
        contract_address = (
            self.settings.pyth_mainnet_contract
            if self.settings.target_chain == TargetChain.MANTLE_MAINNET
            else self.settings.pyth_sepolia_contract
        )
        if not contract_address:
            logger.info("No Pyth contract address configured; on-chain fallback disabled.")
            return None
        return PythContractReader(
            rpc_url=self.settings.effective_http_rpc_url,
            contract_address=contract_address,
        )

    async def fetch_parsed_prices(
        self,
        feed_ids: list[str],
    ) -> tuple[dict[str, PythPriceObservation], str]:
        """Try Hermes first, then on-chain Pyth contract.

        Returns (parsed_by_feed_id, source_label).
        """
        if not feed_ids:
            return {}, "none"

        hermes_ok, hermes_payload = await self._try_hermes(feed_ids)
        if hermes_ok:
            parsed = self._parse_payload(feed_ids, hermes_payload)
            if parsed:
                return parsed, "pyth_hermes"

        onchain_parsed = await self._try_onchain(feed_ids)
        if onchain_parsed:
            logger.warning(
                "Hermes failed for %d feed(s); using on-chain Pyth contract fallback.",
                len(feed_ids),
            )
            return onchain_parsed, "pyth_onchain"

        logger.warning(
            "All oracle sources failed for %d feed(s); no price data available.",
            len(feed_ids),
        )
        return {}, "all_failed"

    async def _try_hermes(self, feed_ids: list[str]) -> tuple[bool, dict[str, Any]]:
        try:
            response = await self.hermes_client.fetch_latest_price_updates(feed_ids)
            return True, response.payload
        except Exception as exc:
            logger.warning(
                "Hermes primary fetch failed for %d feed(s): %s: %r",
                len(feed_ids),
                type(exc).__name__,
                exc,
            )
            return False, {}

    async def _try_onchain(self, feed_ids: list[str]) -> dict[str, PythPriceObservation] | None:
        reader = self.pyth_contract
        if reader is None:
            return None
        try:
            prices = reader.read_prices(feed_ids)
        except Exception as exc:
            logger.warning(
                "On-chain Pyth contract fallback failed: %s: %r",
                type(exc).__name__,
                exc,
            )
            return None

        if not prices:
            logger.debug("On-chain Pyth contract returned no prices for %d feed(s).", len(feed_ids))
            return None

        result: dict[str, PythPriceObservation] = {}
        for feed_id, cp in prices.items():
            result[feed_id] = PythPriceObservation(
                feed_id=feed_id,
                publish_time=cp.publish_time,
                price=cp.price,
                confidence=cp.confidence,
                exponent=cp.exponent,
            )
        return result

    @staticmethod
    def _parse_payload(
        feed_ids: list[str],
        payload: dict[str, Any],
    ) -> dict[str, PythPriceObservation]:
        parsed: dict[str, PythPriceObservation] = {}
        for feed_id in feed_ids:
            try:
                parsed[feed_id] = parse_hermes_price_update(payload, feed_id)
            except ValueError:
                continue
        return parsed
