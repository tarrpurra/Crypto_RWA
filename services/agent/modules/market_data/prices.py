from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import uuid4

from services.agent.app.core.settings import Settings, get_settings
from services.agent.app.core.status_codes import DataStatusCode
from services.agent.app.schemas.market_data import AssetIngestionStatus, AssetMetadata, NormalizedPriceSnapshot, RawPriceSnapshot
from services.agent.modules.market_data.snapshots import PriceIngestionBundle
from services.agent.modules.oracle import (
    HermesClient,
    OndoUsdyOracleAdapter,
    age_seconds,
    evaluate_freshness,
    parse_hermes_price_update,
    utc_now,
)
logger = logging.getLogger("services.agent.market_data.prices")


@dataclass(frozen=True)
class PriceInputs:
    eth_usd_feed_id: str | None
    direct_feed_id: str | None
    ratio_feed_id: str | None


class PriceService:
    def __init__(self, settings: Settings | None = None, hermes_client: HermesClient | None = None) -> None:
        self.settings = settings or get_settings()
        self.hermes_client = hermes_client or HermesClient(
            base_url=self.settings.pyth_hermes_url,
            latest_price_path=self.settings.pyth_hermes_latest_price_path,
        )
        self.ondo_usdy_adapter = OndoUsdyOracleAdapter(self.settings)

    def asset_metadata_for_target_chain(self) -> list[AssetMetadata]:
        target_chain_id = self.settings.effective_chain_id
        assets: list[AssetMetadata] = []
        for raw_asset in self.settings.asset_registry.values():
            if raw_asset["chain_id"] == target_chain_id and raw_asset["price_strategy"] != "route_helper":
                assets.append(AssetMetadata(**raw_asset))
        return assets

    def ingestion_status(self) -> list[AssetIngestionStatus]:
        statuses: list[AssetIngestionStatus] = []
        for asset in self.asset_metadata_for_target_chain():
            if asset.symbol == "USDY":
                selector = self.settings.ondo_usdy_oracle_method_selector or ""
                configured = bool(asset.address and asset.ondo_oracle_address)
                selector_verified = bool(selector and not selector.upper().startswith("TODO_"))
                status = "ok" if configured and selector_verified else "unverified"
                reason = (
                    "USDY mainnet oracle address is configured and selector is verified."
                    if configured and selector_verified
                    else "USDY uses the confirmed Ondo mainnet oracle address, but selector verification is still required before live price reads are trusted."
                )
                statuses.append(
                    AssetIngestionStatus(
                        asset_key=asset.asset_key,
                        asset_symbol=asset.symbol,
                        configured=configured,
                        status=status,
                        status_code=DataStatusCode.DATA_FRESH.value if configured else DataStatusCode.DATA_MISSING.value,
                        status_reason=reason,
                        required_sources=["ondo_redemption_oracle", "dex_quote", "liquidity_check"],
                    )
                )
                continue

            inputs = self._price_inputs(asset)
            configured = bool(inputs.eth_usd_feed_id and (inputs.direct_feed_id or inputs.ratio_feed_id or asset.symbol == "mETH"))
            status = "ok" if configured else "unverified"
            reason = "mETH price inputs are configured." if configured else "mETH still needs verified ETH/USD plus direct or ratio feed inputs."
            statuses.append(
                AssetIngestionStatus(
                    asset_key=asset.asset_key,
                    asset_symbol=asset.symbol,
                    configured=configured,
                    status=status,
                    status_code=DataStatusCode.DATA_FRESH.value if configured else DataStatusCode.DATA_MISSING.value,
                    status_reason=reason,
                    required_sources=["pyth_eth_usd", "dex_quote", "mETH direct or ratio feed"],
                )
            )
        return statuses

    async def fetch_latest_prices(self) -> PriceIngestionBundle:
        assets = self.asset_metadata_for_target_chain()
        feed_ids = self._collect_feed_ids(assets)
        hermes_response = None
        if feed_ids:
            try:
                hermes_response = await self.hermes_client.fetch_latest_price_updates(feed_ids)
            except Exception as exc:
                logger.warning("Hermes price fetch failed: %s", exc)
        parsed_by_feed_id = self._parse_feeds(feed_ids, hermes_response.payload if hermes_response else {})

        bundle = PriceIngestionBundle()
        for asset in assets:
            raw_snapshots, normalized_snapshot = self._build_asset_price(asset, hermes_response, parsed_by_feed_id)
            bundle.raw_snapshots.extend(raw_snapshots)
            bundle.normalized_snapshots.append(normalized_snapshot)
        return bundle

    def _collect_feed_ids(self, assets: list[AssetMetadata]) -> list[str]:
        collected: set[str] = set()
        for asset in assets:
            inputs = self._price_inputs(asset)
            for feed_id in (inputs.eth_usd_feed_id, inputs.direct_feed_id, inputs.ratio_feed_id):
                if self._is_verified_feed_id(feed_id):
                    collected.add(feed_id)
        return sorted(collected)

    def _parse_feeds(self, feed_ids: list[str], payload: dict) -> dict[str, object]:
        parsed: dict[str, object] = {}
        for feed_id in feed_ids:
            try:
                parsed[feed_id] = parse_hermes_price_update(payload, feed_id)
            except ValueError:
                continue
        return parsed

    def _price_inputs(self, asset: AssetMetadata) -> PriceInputs:
        return PriceInputs(
            eth_usd_feed_id=self.settings.eth_usd_pyth_feed_id if self._is_verified_feed_id(self.settings.eth_usd_pyth_feed_id) else None,
            direct_feed_id=asset.pyth_feed_id if self._is_verified_feed_id(asset.pyth_feed_id) else None,
            ratio_feed_id=asset.ratio_feed_id if self._is_verified_feed_id(asset.ratio_feed_id) else None,
        )

    @staticmethod
    def _is_verified_feed_id(feed_id: str | None) -> bool:
        return bool(feed_id and not str(feed_id).upper().startswith("TODO_"))

    def _missing_snapshot(self, asset: AssetMetadata, reason: str, status: str = "missing", status_code: str | None = None) -> tuple[list[RawPriceSnapshot], NormalizedPriceSnapshot]:
        now = utc_now()
        return [], NormalizedPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            observed_timestamp=now,
            freshness_status=status,
            status_code=status_code or DataStatusCode.DATA_MISSING.value,
            status_reason=reason,
            derivation_method=None,
            data_sources_used=[],
            raw_snapshot_ids=[],
        )

    def _build_asset_price(self, asset: AssetMetadata, hermes_response, parsed_by_feed_id: dict[str, object]) -> tuple[list[RawPriceSnapshot], NormalizedPriceSnapshot]:
        if asset.symbol == "USDY":
            return self._build_usdy_price(asset)

        inputs = self._price_inputs(asset)
        if not inputs.eth_usd_feed_id:
            return self._missing_snapshot(asset, "ETH/USD Pyth feed id is not configured or not verified.", status="unverified")

        eth_obs = parsed_by_feed_id.get(inputs.eth_usd_feed_id)
        if eth_obs is None:
            return self._missing_snapshot(asset, "ETH/USD price update could not be parsed from Hermes.")

        if inputs.direct_feed_id and parsed_by_feed_id.get(inputs.direct_feed_id) is not None:
            direct_obs = parsed_by_feed_id[inputs.direct_feed_id]
            return self._build_direct_snapshot(asset, hermes_response, direct_obs, derivation_method="direct_pyth")

        if inputs.ratio_feed_id and parsed_by_feed_id.get(inputs.ratio_feed_id) is not None:
            ratio_obs = parsed_by_feed_id[inputs.ratio_feed_id]
            return self._build_ratio_snapshot(asset, hermes_response, eth_obs, ratio_obs)

        return self._missing_snapshot(asset, "mETH direct or ratio feed data is not available yet.", status="unverified")

    def _build_usdy_price(self, asset: AssetMetadata) -> tuple[list[RawPriceSnapshot], NormalizedPriceSnapshot]:
        oracle_read = self.ondo_usdy_adapter.read()
        if oracle_read.observation is None:
            status_code = DataStatusCode.DATA_MISSING.value
            freshness_status = "unverified" if oracle_read.status.status == "selector_verification_required" else "missing"
            if oracle_read.status.status == "mainnet_only":
                freshness_status = "unverified"
            return self._missing_snapshot(asset, f"Ondo USDY oracle status: {oracle_read.status.status}.", status=freshness_status, status_code=status_code)

        observation = oracle_read.observation
        now = utc_now()
        raw_snapshot = RawPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            feed_id=None,
            source="ondo_redemption_oracle",
            source_url=None,
            raw_payload_json={
                "oracle_address": asset.ondo_oracle_address,
                "oracle_status": oracle_read.status.status,
                "scale": oracle_read.status.scale,
            },
            fetch_timestamp=now,
            publish_timestamp=observation.publish_time,
            price_raw=str(observation.price),
            confidence_raw=None,
            exponent=None,
            status="ok",
            status_code=DataStatusCode.ORACLE_FRESH.value,
            status_reason="USDY redemption price fetched from the configured Ondo oracle.",
        )
        freshness = evaluate_freshness(
            age_in_seconds=age_seconds(observation.publish_time, now),
            fresh_limit_seconds=self.settings.ondo_usdy_oracle_fresh_limit_seconds,
            warn_after_seconds=self.settings.ondo_usdy_oracle_warn_seconds,
            hard_block_after_seconds=self.settings.ondo_usdy_oracle_hard_block_seconds,
            fresh_code=DataStatusCode.ORACLE_FRESH.value,
            stale_code=DataStatusCode.ORACLE_STALE.value,
            source_label="USDY redemption oracle",
        )
        normalized = NormalizedPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            price_usd=str(observation.price),
            confidence_interval_usd=None,
            publish_timestamp=observation.publish_time,
            observed_timestamp=now,
            age_seconds=freshness.age_seconds,
            freshness_status=freshness.status,
            status_code=DataStatusCode.LIQUIDITY_UNKNOWN.value if not freshness.hard_blocked else freshness.status_code,
            status_reason="USDY oracle price is available, but DEX quote and liquidity validation are still required for execution readiness.",
            derivation_method="ondo_redemption_oracle",
            data_sources_used=["ondo_redemption_oracle"],
            raw_snapshot_ids=[raw_snapshot.snapshot_id],
        )
        return [raw_snapshot], normalized

    def _build_direct_snapshot(self, asset: AssetMetadata, hermes_response, observation, derivation_method: str) -> tuple[list[RawPriceSnapshot], NormalizedPriceSnapshot]:
        now = utc_now()
        raw_snapshot = RawPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            feed_id=observation.feed_id,
            source="pyth_hermes",
            source_url=hermes_response.source_url if hermes_response else None,
            raw_payload_json=hermes_response.payload if hermes_response else {},
            fetch_timestamp=hermes_response.fetched_at if hermes_response else now,
            publish_timestamp=observation.publish_time,
            price_raw=str(observation.price),
            confidence_raw=str(observation.confidence),
            exponent=observation.exponent,
            status="ok",
            status_code=DataStatusCode.ORACLE_FRESH.value,
            status_reason="Direct price feed parsed successfully.",
        )
        freshness = evaluate_freshness(
            age_in_seconds=age_seconds(observation.publish_time, now),
            fresh_limit_seconds=self.settings.pyth_eth_usd_fresh_limit_seconds,
            warn_after_seconds=self.settings.pyth_eth_usd_warn_seconds,
            hard_block_after_seconds=self.settings.pyth_eth_usd_hard_block_seconds,
            fresh_code=DataStatusCode.ORACLE_FRESH.value,
            stale_code=DataStatusCode.ORACLE_STALE.value,
            source_label=f"{asset.symbol} oracle price",
        )
        normalized = NormalizedPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            price_usd=str(observation.price),
            confidence_interval_usd=str(observation.confidence),
            publish_timestamp=observation.publish_time,
            observed_timestamp=now,
            age_seconds=freshness.age_seconds,
            freshness_status=freshness.status,
            status_code=freshness.status_code,
            status_reason=freshness.status_reason,
            derivation_method=derivation_method,
            data_sources_used=["pyth_eth_usd" if asset.symbol == "mETH" else "pyth_direct"],
            raw_snapshot_ids=[raw_snapshot.snapshot_id],
        )
        return [raw_snapshot], normalized

    def _build_ratio_snapshot(self, asset: AssetMetadata, hermes_response, eth_observation, ratio_observation) -> tuple[list[RawPriceSnapshot], NormalizedPriceSnapshot]:
        now = utc_now()
        eth_raw = RawPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol="ETH",
            asset_address=None,
            chain_id=asset.chain_id,
            feed_id=eth_observation.feed_id,
            source="pyth_hermes",
            source_url=hermes_response.source_url if hermes_response else None,
            raw_payload_json=hermes_response.payload if hermes_response else {},
            fetch_timestamp=hermes_response.fetched_at if hermes_response else now,
            publish_timestamp=eth_observation.publish_time,
            price_raw=str(eth_observation.price),
            confidence_raw=str(eth_observation.confidence),
            exponent=eth_observation.exponent,
            status="ok",
            status_code=DataStatusCode.ORACLE_FRESH.value,
            status_reason="ETH/USD price feed parsed successfully.",
        )
        ratio_raw = RawPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            feed_id=ratio_observation.feed_id,
            source="pyth_hermes",
            source_url=hermes_response.source_url if hermes_response else None,
            raw_payload_json=hermes_response.payload if hermes_response else {},
            fetch_timestamp=hermes_response.fetched_at if hermes_response else now,
            publish_timestamp=ratio_observation.publish_time,
            price_raw=str(ratio_observation.price),
            confidence_raw=str(ratio_observation.confidence),
            exponent=ratio_observation.exponent,
            status="ok",
            status_code=DataStatusCode.ORACLE_FRESH.value,
            status_reason="mETH/ETH ratio feed parsed successfully.",
        )
        derived_price = ratio_observation.price * eth_observation.price
        derived_confidence = (abs(ratio_observation.price) * eth_observation.confidence) + (abs(eth_observation.price) * ratio_observation.confidence)
        max_age = max(
            age_seconds(eth_observation.publish_time, now) or 0,
            age_seconds(ratio_observation.publish_time, now) or 0,
        )
        freshness = evaluate_freshness(
            age_in_seconds=max_age,
            fresh_limit_seconds=self.settings.pyth_eth_usd_fresh_limit_seconds,
            warn_after_seconds=self.settings.pyth_eth_usd_warn_seconds,
            hard_block_after_seconds=self.settings.pyth_eth_usd_hard_block_seconds,
            fresh_code=DataStatusCode.ORACLE_FRESH.value,
            stale_code=DataStatusCode.ORACLE_STALE.value,
            source_label=f"{asset.symbol} derived oracle price",
        )
        normalized = NormalizedPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            price_usd=str(derived_price),
            confidence_interval_usd=str(derived_confidence),
            publish_timestamp=min(eth_observation.publish_time, ratio_observation.publish_time),
            observed_timestamp=now,
            age_seconds=freshness.age_seconds,
            freshness_status=freshness.status,
            status_code=freshness.status_code,
            status_reason=freshness.status_reason,
            derivation_method="eth_usd_times_meth_eth_ratio",
            data_sources_used=["pyth_eth_usd", "pyth_meth_eth_ratio"],
            raw_snapshot_ids=[eth_raw.snapshot_id, ratio_raw.snapshot_id],
        )
        return [eth_raw, ratio_raw], normalized


def get_price_service() -> PriceService:
    return PriceService()
