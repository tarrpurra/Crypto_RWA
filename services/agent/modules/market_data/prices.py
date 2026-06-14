from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from services.agent.app.core.settings import Settings, TargetChain, get_settings
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
            if raw_asset["chain_id"] == target_chain_id:
                if raw_asset["price_strategy"] == "sepolia_mock_fixed" and not self.settings.sepolia_mock_prices_enabled:
                    continue
                assets.append(AssetMetadata(**raw_asset))
        return assets

    def ingestion_status(self) -> list[AssetIngestionStatus]:
        statuses: list[AssetIngestionStatus] = []
        for asset in self.asset_metadata_for_target_chain():
            inputs = self._price_inputs(asset)
            if asset.price_strategy == "sepolia_mock_fixed":
                configured = bool(asset.address and self.settings.sepolia_mock_prices_enabled)
                statuses.append(
                    AssetIngestionStatus(
                        asset_key=asset.asset_key,
                        asset_symbol=asset.symbol,
                        configured=configured,
                        status="simulation_only" if configured else "unverified",
                        status_code=DataStatusCode.DATA_FRESH.value if configured else DataStatusCode.DATA_MISSING.value,
                        status_reason=(
                            "Sepolia validation asset uses explicit simulation-only pricing for frontend and backend test runs."
                            if configured
                            else "Sepolia validation asset address or simulation pricing is not configured."
                        ),
                        required_sources=["sepolia_mock_fixed_price", "erc20_balanceOf"],
                    )
                )
                continue

            if asset.price_strategy == "sepolia_stable_fallback":
                configured = bool(asset.address and self.settings.simulation_fallback_enabled)
                statuses.append(
                    AssetIngestionStatus(
                        asset_key=asset.asset_key,
                        asset_symbol=asset.symbol,
                        configured=configured,
                        status="simulation_only" if configured else "unverified",
                        status_code=DataStatusCode.DATA_PARTIAL.value if configured else DataStatusCode.DATA_MISSING.value,
                        status_reason=(
                            "Sepolia stable asset uses simulation fallback pricing for end-to-end allocator and swap testing."
                            if configured
                            else "Sepolia stable asset address or simulation fallback is not configured."
                        ),
                        required_sources=["sepolia_stable_fallback", "dex_quote", "liquidity_check"],
                    )
                )
                continue

            if asset.price_strategy == "route_helper" and asset.symbol == "WMNT":
                configured = bool(asset.address and inputs.direct_feed_id)
                if configured:
                    status = "ok"
                    status_code = DataStatusCode.DATA_FRESH.value
                    reason = "WMNT uses the configured MNT/USD Pyth feed for valuation."
                    required_sources = ["pyth_direct", "dex_quote"]
                elif asset.address:
                    status = "simulation_only"
                    status_code = DataStatusCode.DATA_PARTIAL.value
                    reason = "WMNT falls back to native MNT parity until the MNT/USD Pyth feed is configured."
                    required_sources = ["native_mnt_parity", "dex_quote"]
                else:
                    status = "unverified"
                    status_code = DataStatusCode.DATA_MISSING.value
                    reason = "WMNT address or MNT/USD Pyth feed is not configured."
                    required_sources = ["pyth_direct", "dex_quote"]
                statuses.append(
                    AssetIngestionStatus(
                        asset_key=asset.asset_key,
                        asset_symbol=asset.symbol,
                        configured=configured,
                        status=status,
                        status_code=status_code,
                        status_reason=reason,
                        required_sources=required_sources,
                    )
                )
                continue

            if asset.symbol == "USDY":
                if self.settings.target_chain == TargetChain.MANTLE_SEPOLIA:
                    inputs = self._price_inputs(asset)
                    selector = self.settings.ondo_usdy_oracle_method_selector or ""
                    selector_verified = bool(selector and not selector.upper().startswith("TODO_"))
                    has_oracle_reference = bool(
                        asset.address
                        and asset.ondo_oracle_address
                        and selector_verified
                        and self.settings.ondo_usdy_reference_rpc_url
                    )
                    configured = bool(
                        asset.address
                        and (
                            has_oracle_reference
                            or inputs.direct_feed_id
                            or self.settings.sepolia_usdy_reference_price_usd
                            or self.settings.simulation_fallback_enabled
                        )
                    )
                    if has_oracle_reference:
                        status = "ok"
                        status_code = DataStatusCode.DATA_FRESH.value
                        status_reason = "Sepolia USDY uses the verified Ondo mainnet oracle as its mirrored reference source."
                        required_sources = ["ondo_redemption_oracle", "dex_quote", "liquidity_check"]
                    elif inputs.direct_feed_id:
                        status = "ok"
                        status_code = DataStatusCode.DATA_FRESH.value
                        status_reason = "Sepolia USDY uses a direct mirrored USDY/USD feed for valuation."
                        required_sources = ["pyth_direct", "dex_quote", "liquidity_check"]
                    elif self.settings.sepolia_usdy_reference_price_usd:
                        status = "simulation_only"
                        status_code = DataStatusCode.DATA_PARTIAL.value
                        status_reason = "Sepolia USDY uses a configured mirrored reference price for testnet valuation."
                        required_sources = ["configured_reference_price", "dex_quote", "liquidity_check"]
                    else:
                        status = "simulation_only" if configured else "unverified"
                        status_code = DataStatusCode.DATA_PARTIAL.value if configured else DataStatusCode.DATA_MISSING.value
                        status_reason = (
                            "Sepolia USDY uses a $1 simulation fallback because no mirrored USDY reference feed is configured."
                            if configured
                            else "Sepolia USDY address or simulation fallback is not configured."
                        )
                        required_sources = ["sepolia_stable_fallback", "dex_quote", "liquidity_check"]
                    statuses.append(
                        AssetIngestionStatus(
                            asset_key=asset.asset_key,
                            asset_symbol=asset.symbol,
                            configured=configured,
                            status=status,
                            status_code=status_code,
                            status_reason=status_reason,
                            required_sources=required_sources,
                        )
                    )
                    continue
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

            if asset.symbol == "mETH":
                if (
                    self.settings.target_chain == TargetChain.MANTLE_SEPOLIA
                    and self.settings.sepolia_meth_is_test_token
                    and self.settings.effective_sepolia_meth_price_mode == "manual_mirror"
                ):
                    configured = bool(asset.address and self.settings.meth_manual_price_usd)
                    status = "simulation_only" if configured else "unverified"
                    reason = (
                        "Sepolia mETH test token uses a manual mirrored USD price for demo-safe risk and allocation logic."
                        if configured
                        else "Sepolia mETH test token manual mirror pricing is enabled, but METH_MANUAL_PRICE_USD is not configured."
                    )
                    statuses.append(
                        AssetIngestionStatus(
                            asset_key=asset.asset_key,
                            asset_symbol=asset.symbol,
                            configured=configured,
                            status=status,
                            status_code=DataStatusCode.DATA_PARTIAL.value if configured else DataStatusCode.DATA_MISSING.value,
                            status_reason=reason,
                            required_sources=["manual_mirror", "dex_quote"],
                        )
                    )
                    continue
                if inputs.direct_feed_id:
                    configured = True
                    status = "ok"
                    reason = "mETH uses the configured direct METH/USD Pyth feed."
                    required_sources = ["pyth_direct", "dex_quote"]
                elif inputs.ratio_feed_id and inputs.eth_usd_feed_id:
                    configured = True
                    status = "ok"
                    reason = "mETH uses the configured ETH/USD plus METH/ETH ratio feed pair."
                    required_sources = ["pyth_eth_usd", "pyth_meth_eth_ratio", "dex_quote"]
                else:
                    configured = bool(inputs.eth_usd_feed_id)
                    status = "ok" if configured else "unverified"
                    reason = "mETH using ETH/USD Pyth feed proxy." if configured else "ETH/USD Pyth feed not configured."
                    required_sources = ["pyth_eth_usd", "dex_quote"]
                statuses.append(
                    AssetIngestionStatus(
                        asset_key=asset.asset_key,
                        asset_symbol=asset.symbol,
                        configured=configured,
                        status=status,
                        status_code=DataStatusCode.DATA_FRESH.value if configured else DataStatusCode.DATA_MISSING.value,
                        status_reason=reason,
                        required_sources=required_sources,
                    )
                )
            else:
                configured = bool(inputs.eth_usd_feed_id and (inputs.direct_feed_id or inputs.ratio_feed_id))
                status = "ok" if configured else "unverified"
                reason = "Price inputs are configured." if configured else "Needs verified ETH/USD plus direct or ratio feed inputs."
                statuses.append(
                    AssetIngestionStatus(
                        asset_key=asset.asset_key,
                        asset_symbol=asset.symbol,
                        configured=configured,
                        status=status,
                        status_code=DataStatusCode.DATA_FRESH.value if configured else DataStatusCode.DATA_MISSING.value,
                        status_reason=reason,
                        required_sources=["pyth_eth_usd", "dex_quote", "direct or ratio feed"],
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
                logger.warning("Hermes price fetch failed: %s: %r", type(exc).__name__, exc)
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
        inputs = self._price_inputs(asset)
        if asset.price_strategy == "sepolia_mock_fixed":
            return self._build_sepolia_mock_price(asset)
        if asset.price_strategy == "sepolia_stable_fallback":
            if self.settings.simulation_fallback_enabled and asset.address:
                return self._build_sepolia_stable_price(asset, "Sepolia stable fallback pricing enabled for testnet end-to-end flow.")
            return self._missing_snapshot(asset, "Sepolia stable fallback pricing is disabled or asset address is not configured.", status="unverified")

        if asset.price_strategy == "route_helper" and asset.symbol == "WMNT":
            if inputs.direct_feed_id and parsed_by_feed_id.get(inputs.direct_feed_id) is not None:
                direct_obs = parsed_by_feed_id[inputs.direct_feed_id]
                return self._build_direct_snapshot(
                    asset,
                    hermes_response,
                    direct_obs,
                    derivation_method="pyth_direct",
                    data_source_label="pyth_direct",
                )
            if asset.address:
                quote_derived = self._build_wmnt_quote_reference_price(asset, hermes_response, parsed_by_feed_id)
                if quote_derived is not None:
                    return quote_derived
                return self._missing_snapshot(
                    asset,
                    "WMNT could not be priced because the MNT/USD Pyth feed is unavailable and no usable WMNT/USDY quote fallback was found.",
                    status="unverified",
                    status_code=DataStatusCode.DATA_PARTIAL.value,
                )
            return self._missing_snapshot(asset, "WMNT address is not configured.", status="unverified")

        if asset.symbol == "USDY":
            return self._build_usdy_price(asset, hermes_response, parsed_by_feed_id)
        if (
            asset.symbol == "mETH"
            and self.settings.target_chain == TargetChain.MANTLE_SEPOLIA
            and self.settings.sepolia_meth_is_test_token
            and self.settings.effective_sepolia_meth_price_mode == "manual_mirror"
        ):
            if self.settings.meth_manual_price_usd:
                return self._build_configured_reference_price(
                    asset,
                    source="manual_mirror",
                    price=self.settings.meth_manual_price_usd,
                    reason="Sepolia mETH test token uses a manual mirrored USD price for demo-safe execution and risk evaluation.",
                )
            if self.settings.require_live_prices:
                return self._missing_snapshot(
                    asset,
                    "Sepolia mETH test token manual mirror mode is enabled, but METH_MANUAL_PRICE_USD is not configured.",
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
            return self._build_direct_snapshot(
                asset,
                hermes_response,
                direct_obs,
                derivation_method="direct_pyth",
                data_source_label="pyth_direct",
            )

        if inputs.ratio_feed_id and parsed_by_feed_id.get(inputs.ratio_feed_id) is not None:
            ratio_obs = parsed_by_feed_id[inputs.ratio_feed_id]
            return self._build_ratio_snapshot(asset, hermes_response, eth_obs, ratio_obs)

        # Fallback: use ETH/USD as proxy for mETH
        return self._build_direct_snapshot(
            asset,
            hermes_response,
            eth_obs,
            derivation_method="pyth_eth_usd_proxy",
            data_source_label="pyth_eth_usd",
        )

    def _build_sepolia_mock_price(self, asset: AssetMetadata) -> tuple[list[RawPriceSnapshot], NormalizedPriceSnapshot]:
        if not self.settings.sepolia_mock_prices_enabled:
            return self._missing_snapshot(asset, "Sepolia mock fixed pricing is disabled.", status="unverified")

        price = (
            self.settings.sepolia_mock_token_a_price_usd
            if asset.asset_key == "MOCK_TOKEN_A"
            else self.settings.sepolia_mock_token_b_price_usd
        )
        now = utc_now()
        raw_snapshot = RawPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            feed_id=None,
            source="sepolia_mock_fixed_price",
            source_url=None,
            raw_payload_json={
                "runtime_mode": self.settings.runtime_mode.value,
                "target_chain": self.settings.target_chain.value,
                "testnet_only": True,
            },
            fetch_timestamp=now,
            publish_timestamp=now,
            price_raw=price,
            confidence_raw=None,
            exponent=None,
            status="simulation_only",
            status_code=DataStatusCode.DATA_FRESH.value,
            status_reason="Simulation-only Sepolia mock-token price configured for local end-to-end testing.",
        )
        normalized = NormalizedPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            price_usd=price,
            confidence_interval_usd=None,
            publish_timestamp=now,
            observed_timestamp=now,
            age_seconds=0,
            freshness_status="simulation_only",
            status_code=DataStatusCode.DATA_FRESH.value,
            status_reason="Simulation-only Sepolia mock-token price configured for local end-to-end testing.",
            derivation_method="sepolia_mock_fixed_price",
            data_sources_used=["sepolia_mock_fixed_price"],
            raw_snapshot_ids=[raw_snapshot.snapshot_id],
        )
        return [raw_snapshot], normalized

    def _build_sepolia_stable_price(self, asset: AssetMetadata, reason: str) -> tuple[list[RawPriceSnapshot], NormalizedPriceSnapshot]:
        now = utc_now()
        price = "1"
        raw_snapshot = RawPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            feed_id=None,
            source="sepolia_stable_fallback",
            source_url=None,
            raw_payload_json={
                "target_chain": self.settings.target_chain.value,
                "testnet_only": True,
                "reason": reason,
            },
            fetch_timestamp=now,
            publish_timestamp=now,
            price_raw=price,
            confidence_raw=None,
            exponent=None,
            status="simulation_only",
            status_code=DataStatusCode.DATA_PARTIAL.value,
            status_reason=reason,
        )
        normalized = NormalizedPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            price_usd=price,
            confidence_interval_usd=None,
            publish_timestamp=now,
            observed_timestamp=now,
            age_seconds=0,
            freshness_status="simulation_only",
            status_code=DataStatusCode.DATA_PARTIAL.value,
            status_reason=reason,
            derivation_method="sepolia_stable_fallback",
            data_sources_used=["sepolia_stable_fallback"],
            raw_snapshot_ids=[raw_snapshot.snapshot_id],
        )
        return [raw_snapshot], normalized

    def _build_usdy_price(self, asset: AssetMetadata, hermes_response, parsed_by_feed_id: dict[str, object]) -> tuple[list[RawPriceSnapshot], NormalizedPriceSnapshot]:
        if self.settings.target_chain == TargetChain.MANTLE_SEPOLIA:
            inputs = self._price_inputs(asset)
            direct_obs = parsed_by_feed_id.get(inputs.direct_feed_id) if inputs.direct_feed_id else None
            if direct_obs is not None:
                return self._build_direct_snapshot(
                    asset,
                    hermes_response,
                    direct_obs,
                    derivation_method="pyth_direct",
                    data_source_label="pyth_direct",
                )

            if self.settings.sepolia_usdy_reference_price_usd:
                return self._build_configured_reference_price(
                    asset,
                    source="configured_reference_price",
                    price=self.settings.sepolia_usdy_reference_price_usd,
                    reason="Sepolia USDY uses a configured mirrored reference price for testnet valuation.",
                )

        oracle_read = self.ondo_usdy_adapter.read()
        if oracle_read.observation is None:
            if self.settings.target_chain.value == "mantle_sepolia" and self.settings.simulation_fallback_enabled:
                return self._build_sepolia_stable_price(
                    asset,
                    f"Ondo USDY oracle: {oracle_read.status.status}, using $1 test fallback because no mirrored USDY reference feed is configured.",
                )
            status_code = DataStatusCode.DATA_MISSING.value
            freshness_status = "unverified" if oracle_read.status.status == "selector_verification_required" else "missing"
            if oracle_read.status.status == "simulation_only":
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

    def _build_configured_reference_price(
        self,
        asset: AssetMetadata,
        *,
        source: str,
        price: str,
        reason: str,
    ) -> tuple[list[RawPriceSnapshot], NormalizedPriceSnapshot]:
        now = utc_now()
        raw_snapshot = RawPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            feed_id=None,
            source=source,
            source_url=None,
            raw_payload_json={
                "target_chain": self.settings.target_chain.value,
                "testnet_only": True,
                "reason": reason,
            },
            fetch_timestamp=now,
            publish_timestamp=now,
            price_raw=price,
            confidence_raw=None,
            exponent=None,
            status="simulation_only",
            status_code=DataStatusCode.DATA_PARTIAL.value,
            status_reason=reason,
        )
        normalized = NormalizedPriceSnapshot(
            snapshot_id=str(uuid4()),
            asset_key=asset.asset_key,
            asset_symbol=asset.symbol,
            asset_address=asset.address,
            chain_id=asset.chain_id,
            price_usd=price,
            confidence_interval_usd=None,
            publish_timestamp=now,
            observed_timestamp=now,
            age_seconds=0,
            freshness_status="simulation_only",
            status_code=DataStatusCode.DATA_PARTIAL.value,
            status_reason=reason,
            derivation_method=source,
            data_sources_used=[source],
            raw_snapshot_ids=[raw_snapshot.snapshot_id],
        )
        return [raw_snapshot], normalized

    def _build_wmnt_quote_reference_price(
        self,
        asset: AssetMetadata,
        hermes_response,
        parsed_by_feed_id: dict[str, object],
    ) -> tuple[list[RawPriceSnapshot], NormalizedPriceSnapshot] | None:
        usdy_asset = next(
            (
                candidate
                for candidate in self.asset_metadata_for_target_chain()
                if candidate.symbol == "USDY" and candidate.address
            ),
            None,
        )
        if usdy_asset is None:
            return None

        _, usdy_snapshot = self._build_usdy_price(usdy_asset, hermes_response, parsed_by_feed_id)
        if not usdy_snapshot.price_usd:
            return None

        try:
            usdy_price = Decimal(usdy_snapshot.price_usd)
        except (InvalidOperation, ValueError):
            return None
        if usdy_price <= 0:
            return None

        try:
            from services.agent.modules.quotes.service import QuoteService
            best_quote = QuoteService(self.settings).best_quote_for_pair("WMNT", "USDY")
        except Exception as exc:
            logger.warning("WMNT quote fallback lookup failed: %s: %r", type(exc).__name__, exc)
            return None
        if best_quote is None or not best_quote.amount_in or not best_quote.amount_out:
            return None
        if best_quote.status_code not in {
            DataStatusCode.QUOTE_FRESH.value,
            DataStatusCode.QUOTE_STALE.value,
            DataStatusCode.DATA_PARTIAL.value,
        }:
            return None

        try:
            amount_in = Decimal(best_quote.amount_in)
            amount_out = Decimal(best_quote.amount_out)
        except (InvalidOperation, ValueError):
            return None
        if amount_in <= 0 or amount_out <= 0:
            return None

        derived_price = (amount_out / amount_in) * usdy_price
        quoted_pair = f"{best_quote.token_in_symbol}/{best_quote.token_out_symbol}"
        reason = (
            f"WMNT uses a quote-derived USD fallback from {quoted_pair} because the MNT/USD Pyth feed is unavailable."
        )
        return self._build_configured_reference_price(
            asset,
            source="wmnt_usdy_quote",
            price=format(derived_price.normalize(), "f"),
            reason=reason,
        )

    def _build_direct_snapshot(
        self,
        asset: AssetMetadata,
        hermes_response,
        observation,
        derivation_method: str,
        data_source_label: str = "pyth_direct",
    ) -> tuple[list[RawPriceSnapshot], NormalizedPriceSnapshot]:
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
            data_sources_used=[data_source_label],
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
