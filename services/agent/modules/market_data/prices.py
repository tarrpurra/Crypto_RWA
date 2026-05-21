from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from uuid import uuid4

from services.agent.app.core.settings import Settings, get_settings
from services.agent.app.core.status_codes import DataStatusCode, TargetChain
from services.agent.app.schemas.market_data import AssetIngestionStatus, AssetMetadata, NormalizedPriceSnapshot, RawPriceSnapshot
from services.agent.modules.market_data.snapshots import PriceIngestionBundle
from services.agent.modules.oracle import HermesClient, age_seconds, evaluate_freshness, parse_hermes_price_update, utc_now


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

    def asset_metadata_for_target_chain(self) -> list[AssetMetadata]:
        target_chain_id = self.settings.effective_chain_id
        assets: list[AssetMetadata] = []
        for raw_asset in self.settings.asset_registry.values():
            if raw_asset["chain_id"] == target_chain_id:
                assets.append(AssetMetadata(**raw_asset))
        return assets

    def ingestion_status(self) -> list[AssetIngestionStatus]:
        statuses: list[AssetIngestionStatus] = []
        for asset in self.asset_metadata_for_target_chain():
            if asset.symbol == "USDY":
                configured = bool(asset.address and asset.ondo_oracle_address)
                status = "ok" if configured else "missing"
                reason = "USDY oracle and address are configured." if configured else "USDY still needs verified Ondo oracle and asset address configuration."
                statuses.append(
                    AssetIngestionStatus(
                        asset_key=asset.asset_key,
                        asset_symbol=asset.symbol,
                        configured=configured,
                        status=status,
                        status_code=DataStatusCode.DATA_FRESH.value if configured else DataStatusCode.DATA_MISSING.value,
                        status_reason=reason,
                        required_sources=["ondo_redemption_oracle", "dex_quote"],
                    )
                )
                continue

            inputs = self._price_inputs(asset)
            configured = bool(inputs.eth_usd_feed_id and (inputs.direct_feed_id or inputs.ratio_feed_id))
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
        hermes_response = await self.hermes_client.fetch_latest_price_updates(feed_ids) if feed_ids else None
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

    def _missing_snapshot(self, asset: AssetMetadata, reason: str, status: str = "missing") -> tuple[list[RawPriceSnapshot], NormalizedPriceSnapshot]:
        now = utc_now()
        return [], NormalizedPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            observed_timestamp=now,
            freshness_status=status,
            status_code=DataStatusCode.DATA_MISSING.value,
            status_reason=reason,
            derivation_method=None,
            data_sources_used=[],
            raw_snapshot_ids=[],
        )

    def _build_asset_price(self, asset: AssetMetadata, hermes_response, parsed_by_feed_id: dict[str, object]) -> tuple[list[RawPriceSnapshot], NormalizedPriceSnapshot]:
        if asset.symbol == "USDY":
            return self._missing_snapshot(
                asset,
                "USDY reference pricing is locked to the Ondo redemption oracle, which is not implemented in this service yet.",
                status="unverified",
            )

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
