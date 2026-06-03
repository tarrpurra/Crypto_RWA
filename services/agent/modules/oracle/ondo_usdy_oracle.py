from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from services.agent.app.core.settings import Settings, TargetChain, get_settings
from services.agent.app.schemas.oracle import OndoUsdyOracleStatus
from services.agent.modules.oracle.freshness import age_seconds, evaluate_freshness, utc_now
from services.agent.modules.oracle.ondo_client import OndoOracleClient, OndoOracleObservation


@dataclass(frozen=True)
class OndoUsdyOracleRead:
    observation: OndoOracleObservation | None
    status: OndoUsdyOracleStatus


class OndoUsdyOracleAdapter:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.client = OndoOracleClient(self.settings.effective_http_rpc_url)

    def read(self) -> OndoUsdyOracleRead:
        ingested_at = utc_now()
        address = self.settings.ondo_usdy_oracle_address or ""

        if self.settings.target_chain != TargetChain.MANTLE_MAINNET:
            return OndoUsdyOracleRead(
                observation=None,
                status=OndoUsdyOracleStatus(
                    asset="USDY",
                    source="ondo_redemption_price_oracle",
                    chain_id=self.settings.effective_chain_id,
                    address=address,
                    ingested_at=ingested_at,
                    status="simulation_only",
                ),
            )

        if not address:
            return OndoUsdyOracleRead(
                observation=None,
                status=OndoUsdyOracleStatus(
                    asset="USDY",
                    source="ondo_redemption_price_oracle",
                    chain_id=self.settings.effective_chain_id,
                    address=address,
                    ingested_at=ingested_at,
                    status="oracle_address_missing",
                ),
            )

        selector = self.settings.ondo_usdy_oracle_method_selector or ""
        if not selector or selector.upper().startswith("TODO_"):
            return OndoUsdyOracleRead(
                observation=None,
                status=OndoUsdyOracleStatus(
                    asset="USDY",
                    source="ondo_redemption_price_oracle",
                    chain_id=self.settings.effective_chain_id,
                    address=address,
                    price=None,
                    scale="verification_required",
                    updated_at=None,
                    ingested_at=ingested_at,
                    status="selector_verification_required",
                ),
            )

        try:
            observation = self.client.fetch_redemption_price(
                oracle_address=address,
                method_selector=selector,
                decimals=self.settings.ondo_usdy_oracle_decimals,
            )
        except Exception:
            return OndoUsdyOracleRead(
                observation=None,
                status=OndoUsdyOracleStatus(
                    asset="USDY",
                    source="ondo_redemption_price_oracle",
                    chain_id=self.settings.effective_chain_id,
                    address=address,
                    ingested_at=ingested_at,
                    status="oracle_unavailable",
                ),
            )

        freshness = evaluate_freshness(
            age_in_seconds=age_seconds(observation.publish_time, ingested_at),
            fresh_limit_seconds=self.settings.ondo_usdy_oracle_fresh_limit_seconds,
            warn_after_seconds=self.settings.ondo_usdy_oracle_warn_seconds,
            hard_block_after_seconds=self.settings.ondo_usdy_oracle_hard_block_seconds,
            fresh_code="ORACLE_FRESH",
            stale_code="ORACLE_STALE",
            source_label="Ondo USDY redemption oracle",
        )
        status = "live" if freshness.status == "ok" else "stale"
        return OndoUsdyOracleRead(
            observation=observation,
            status=OndoUsdyOracleStatus(
                asset="USDY",
                source="ondo_redemption_price_oracle",
                chain_id=self.settings.effective_chain_id,
                address=address,
                price=str(observation.price.quantize(Decimal("0.000000000000000001"))),
                scale=f"1e-{self.settings.ondo_usdy_oracle_decimals}",
                updated_at=observation.publish_time,
                ingested_at=ingested_at,
                status=status,
            ),
        )


def get_ondo_usdy_oracle_adapter() -> OndoUsdyOracleAdapter:
    return OndoUsdyOracleAdapter()
