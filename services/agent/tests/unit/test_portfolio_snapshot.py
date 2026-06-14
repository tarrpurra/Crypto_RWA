import asyncio
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from services.agent.app.api.portfolio import _normalize_zero_snapshot, _snapshot_is_all_zero, current_portfolio
from services.agent.app.core.settings import Settings
from services.agent.app.core.status_codes import TargetChain
from services.agent.app.schemas.market_data import NormalizedPriceSnapshot
from services.agent.app.schemas.portfolio import BalanceObservation, PortfolioPosition, PortfolioSnapshotResponse
from services.agent.modules.market_data.balances import PortfolioSnapshotEngine, VaultShareReader


class PortfolioSnapshotEngineTests(unittest.TestCase):
    def test_phase_2_scenario_fixtures_exist(self) -> None:
        scenario_dir = Path(__file__).resolve().parents[1] / "scenarios"

        self.assertTrue((scenario_dir / "portfolio_complete.json").exists())
        self.assertTrue((scenario_dir / "portfolio_partial.json").exists())
        self.assertTrue((scenario_dir / "portfolio_missing.json").exists())

    def test_missing_balances_return_degraded_snapshot(self) -> None:
        snapshot = PortfolioSnapshotEngine().build_snapshot(
            balances=[],
            prices=[],
            portfolio_address=None,
            chain_id=5003,
            missing_reason="No configured balance source.",
        )

        self.assertEqual(snapshot.status, "degraded")
        self.assertEqual(snapshot.status_code, "DATA_MISSING")
        self.assertEqual(snapshot.total_value_usd, None)
        self.assertEqual(snapshot.positions, [])

    def test_values_positions_and_weights_when_prices_are_fresh(self) -> None:
        now = datetime(2026, 1, 1, tzinfo=UTC)
        snapshot = PortfolioSnapshotEngine().build_snapshot(
            balances=[
                BalanceObservation(
                    asset_key="USDY",
                    asset_symbol="USDY",
                    asset_address="0x1",
                    chain_id=5000,
                    balance="100",
                    decimals=18,
                    observed_timestamp=now,
                    balance_source="test_fixture",
                    status="ok",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                ),
                BalanceObservation(
                    asset_key="METH_MAINNET",
                    asset_symbol="mETH",
                    asset_address="0x2",
                    chain_id=5000,
                    balance="2",
                    decimals=18,
                    observed_timestamp=now,
                    balance_source="test_fixture",
                    status="ok",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                ),
            ],
            prices=[
                NormalizedPriceSnapshot(
                    snapshot_id="price-1",
                    asset_key="USDY",
                    asset_symbol="USDY",
                    asset_address="0x1",
                    chain_id=5000,
                    price_usd="1",
                    confidence_interval_usd="0",
                    publish_timestamp=now,
                    observed_timestamp=now,
                    age_seconds=1,
                    freshness_status="fresh",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                    derivation_method="test",
                    data_sources_used=["test_price"],
                    raw_snapshot_ids=["raw-1"],
                ),
                NormalizedPriceSnapshot(
                    snapshot_id="price-2",
                    asset_key="METH_MAINNET",
                    asset_symbol="mETH",
                    asset_address="0x2",
                    chain_id=5000,
                    price_usd="3000",
                    confidence_interval_usd="0",
                    publish_timestamp=now,
                    observed_timestamp=now,
                    age_seconds=1,
                    freshness_status="fresh",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                    derivation_method="test",
                    data_sources_used=["test_price"],
                    raw_snapshot_ids=["raw-2"],
                ),
            ],
            portfolio_address="0xportfolio",
            chain_id=5000,
            target_weights={"USDY": "0.02", "METH_MAINNET": "0.98"},
        )

        self.assertEqual(snapshot.status, "ok")
        self.assertEqual(snapshot.status_code, "DATA_FRESH")
        self.assertEqual(snapshot.total_value_usd, "6100")
        self.assertEqual(snapshot.positions[0].value_usd, "100")
        self.assertEqual(snapshot.positions[1].value_usd, "6000")
        self.assertEqual(snapshot.positions[0].weight, "0.01639344262295081967213114754")
        self.assertEqual(snapshot.positions[1].weight, "0.9836065573770491803278688525")
        self.assertEqual(snapshot.positions[0].target_weight, "0.02")
        self.assertEqual(snapshot.positions[0].drift_status, "within_target")
        self.assertEqual(snapshot.positions[1].drift_status, "within_target")

    def test_vault_share_reader_uses_user_balances_when_share_calls_revert(self) -> None:
        reader = object.__new__(VaultShareReader)
        reader.web3 = MagicMock()
        reader.web3.to_checksum_address.side_effect = lambda value: value
        reader.web3.eth.get_balance.return_value = 0

        balance_of_call = MagicMock()
        balance_of_call.call.side_effect = Exception("execution reverted")
        total_shares_call = MagicMock()
        total_shares_call.call.side_effect = Exception("execution reverted")
        get_user_balances_call = MagicMock()
        get_user_balances_call.call.return_value = [10**18]

        functions = MagicMock()
        functions.balanceOf.return_value = balance_of_call
        functions.totalShares.return_value = total_shares_call
        functions.getUserBalances.return_value = get_user_balances_call

        reader.vault_contract = MagicMock()
        reader.vault_contract.functions = functions

        balances = reader.read_user_position(
            user_address="0xuser",
            asset_registry={
                "SEPOLIA_WMNT": {
                    "asset_key": "SEPOLIA_WMNT",
                    "symbol": "WMNT",
                    "chain_id": 5003,
                    "address": "0xtoken",
                    "verified": True,
                    "decimals": 18,
                }
            },
            chain_id=5003,
        )

        self.assertEqual(len(balances), 1)
        self.assertEqual(balances[0].asset_symbol, "WMNT")
        self.assertEqual(balances[0].balance, "1")
        self.assertEqual(balances[0].metadata["raw_user_balance"], str(10**18))
        self.assertIsNone(balances[0].metadata["ownership_pct"])

    def test_vault_share_reader_includes_native_mnt_balance(self) -> None:
        reader = object.__new__(VaultShareReader)
        reader.web3 = MagicMock()
        reader.web3.to_checksum_address.side_effect = lambda value: value
        reader.web3.eth.get_balance.return_value = 10**18

        balance_of_call = MagicMock()
        balance_of_call.call.side_effect = Exception("execution reverted")
        total_shares_call = MagicMock()
        total_shares_call.call.side_effect = Exception("execution reverted")
        get_user_balances_call = MagicMock()
        get_user_balances_call.call.return_value = [10**18]

        functions = MagicMock()
        functions.balanceOf.return_value = balance_of_call
        functions.totalShares.return_value = total_shares_call
        functions.getUserBalances.return_value = get_user_balances_call

        reader.vault_contract = MagicMock()
        reader.vault_contract.functions = functions

        balances = reader.read_user_position(
            user_address="0xuser",
            asset_registry={},
            chain_id=5003,
        )

        self.assertEqual(len(balances), 1)
        self.assertEqual(balances[0].asset_symbol, "MNT")
        self.assertEqual(balances[0].asset_address, "0x0000000000000000000000000000000000000000")
        self.assertEqual(balances[0].balance, "1")
        self.assertEqual(balances[0].balance_source, "vault_shares_getUserBalances")

    def test_unpriced_position_keeps_snapshot_partial(self) -> None:
        now = datetime(2026, 1, 1, tzinfo=UTC)
        snapshot = PortfolioSnapshotEngine().build_snapshot(
            balances=[
                BalanceObservation(
                    asset_key="USDY",
                    asset_symbol="USDY",
                    chain_id=5000,
                    balance="100",
                    decimals=18,
                    observed_timestamp=now,
                    balance_source="test_fixture",
                    status="ok",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                )
            ],
            prices=[],
            portfolio_address="0xportfolio",
            chain_id=5000,
        )

        self.assertEqual(snapshot.status, "degraded")
        self.assertEqual(snapshot.status_code, "DATA_PARTIAL")
        self.assertEqual(snapshot.positions[0].valuation_status, "unvalued")
        self.assertEqual(snapshot.positions[0].status_reason, "No price snapshot is available for this position.")
        self.assertEqual(snapshot.positions[0].drift_status, "not_configured")

    def test_zero_balance_position_is_valued_without_price(self) -> None:
        now = datetime(2026, 1, 1, tzinfo=UTC)
        snapshot = PortfolioSnapshotEngine().build_snapshot(
            balances=[
                BalanceObservation(
                    asset_key="SEPOLIA_METH",
                    asset_symbol="mETH",
                    chain_id=5003,
                    balance="0",
                    decimals=18,
                    observed_timestamp=now,
                    balance_source="erc20_balanceOf",
                    status="ok",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                )
            ],
            prices=[],
            portfolio_address="0xportfolio",
            chain_id=5003,
        )

        self.assertEqual(snapshot.status, "ok")
        self.assertEqual(snapshot.status_code, "DATA_FRESH")
        self.assertEqual(snapshot.total_value_usd, "0")
        self.assertEqual(snapshot.positions[0].valuation_status, "valued")
        self.assertEqual(snapshot.positions[0].value_usd, "0")
        self.assertEqual(
            snapshot.positions[0].status_reason,
            "Zero-balance position valued at 0 without requiring a price snapshot.",
        )
        self.assertEqual(snapshot.positions[0].drift_status, "not_configured")

    @patch("services.agent.app.api.portfolio._read_vault_portfolio")
    @patch("services.agent.app.api.portfolio.get_settings")
    @patch("services.agent.app.api.portfolio.Erc20BalanceReader")
    @patch("services.agent.app.api.portfolio.MarketDataRepository")
    @patch("services.agent.app.api.portfolio.PortfolioSnapshotRepository")
    @patch("services.agent.app.api.portfolio.get_price_service")
    def test_current_portfolio_degrades_when_live_prices_fail_and_no_persisted_prices_exist(
        self,
        get_price_service,
        portfolio_repository_cls,
        market_repository_cls,
        balance_reader_cls,
        get_settings,
        mock_read_vault,
    ) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_meth_address="0x0000000000000000000000000000000000000001",
            sepolia_usdy_address="0x0000000000000000000000000000000000000002",
            sepolia_wmnt_address="0x0000000000000000000000000000000000000003",
        )
        get_settings.return_value = settings
        mock_read_vault.return_value = [
            BalanceObservation(
                asset_key="SEPOLIA_USDY",
                asset_symbol="USDY",
                asset_address="0x2",
                chain_id=5003,
                balance="100",
                decimals=18,
                observed_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                balance_source="vault_shares_getUserBalances",
                status="ok",
                status_code="DATA_FRESH",
                status_reason="fresh",
            )
        ]
        get_price_service.return_value.fetch_latest_prices = AsyncMock(side_effect=RuntimeError("price feed down"))
        market_repository_cls.return_value.latest_normalized_prices.return_value = []
        portfolio_repository_cls.return_value.latest_snapshot.return_value = None
        portfolio_repository_cls.return_value.save_snapshot.return_value = None

        snapshot = asyncio.run(current_portfolio(wallet_address="0xportfolio"))

        self.assertEqual(snapshot.status, "degraded")
        self.assertEqual(snapshot.status_code, "DATA_PARTIAL")
        self.assertEqual(snapshot.positions[0].valuation_status, "unvalued")
        self.assertEqual(snapshot.positions[0].status_reason, "No price snapshot is available for this position.")

    def test_failed_balance_observation_remains_visible_and_unvalued(self) -> None:
        now = datetime(2026, 1, 1, tzinfo=UTC)
        snapshot = PortfolioSnapshotEngine().build_snapshot(
            balances=[
                BalanceObservation(
                    asset_key="USDY",
                    asset_symbol="USDY",
                    chain_id=5000,
                    balance=None,
                    decimals=18,
                    observed_timestamp=now,
                    balance_source="erc20_balanceOf",
                    status="degraded",
                    status_code="DATA_MISSING",
                    status_reason="ERC-20 balance read failed.",
                )
            ],
            prices=[
                NormalizedPriceSnapshot(
                    snapshot_id="price-1",
                    asset_key="USDY",
                    asset_symbol="USDY",
                    asset_address="0x1",
                    chain_id=5000,
                    price_usd="1",
                    confidence_interval_usd="0",
                    publish_timestamp=now,
                    observed_timestamp=now,
                    age_seconds=1,
                    freshness_status="fresh",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                    derivation_method="test",
                    data_sources_used=["test_price"],
                    raw_snapshot_ids=["raw-1"],
                )
            ],
            portfolio_address="0xportfolio",
            chain_id=5000,
        )

        self.assertEqual(snapshot.status_code, "DATA_PARTIAL")
        self.assertEqual(snapshot.positions[0].balance, None)
        self.assertEqual(snapshot.positions[0].value_usd, None)
        self.assertEqual(snapshot.positions[0].status_reason, "ERC-20 balance read failed.")

    def test_all_zero_snapshot_detection(self) -> None:
        zero_snapshot = PortfolioSnapshotResponse(
            snapshot_id="snapshot-1",
            generated_at=datetime(2026, 1, 1, tzinfo=UTC),
            portfolio_address="0xportfolio",
            chain_id=5003,
            base_currency="USD",
            total_value_usd="0",
            positions=[
                PortfolioPosition(
                    asset_key="USDY",
                    asset_symbol="USDY",
                    asset_address="0x1",
                    chain_id=5003,
                    balance="0",
                    balance_source="erc20_balanceOf",
                    price_usd="1",
                    value_usd="0",
                    weight="0",
                    target_weight="0.5",
                    weight_drift="-0.5",
                    drift_status="drifted",
                    valuation_status="valued",
                    status_code="DATA_FRESH",
                    status_reason="Position valued from balance and price snapshots.",
                )
            ],
            data_sources_used=["erc20_balanceOf"],
            status="ok",
            status_code="DATA_FRESH",
            status_label="DATA_FRESH",
            status_reason="Portfolio snapshot valued successfully.",
            metadata={},
        )

        self.assertTrue(_snapshot_is_all_zero(zero_snapshot))

    def test_zero_snapshot_normalization_restores_demo_freshness(self) -> None:
        zero_snapshot = PortfolioSnapshotResponse(
            snapshot_id="snapshot-2",
            generated_at=datetime(2026, 1, 1, tzinfo=UTC),
            portfolio_address="0xportfolio",
            chain_id=5003,
            base_currency="USD",
            total_value_usd=None,
            positions=[
                PortfolioPosition(
                    asset_key="SEPOLIA_METH",
                    asset_symbol="mETH",
                    asset_address="0x1",
                    chain_id=5003,
                    balance="0",
                    balance_source="erc20_balanceOf",
                    price_usd=None,
                    value_usd=None,
                    weight=None,
                    target_weight="0.5",
                    weight_drift=None,
                    drift_status="unvalued",
                    route_depth_usd=None,
                    slippage_impact_bps=None,
                    valuation_status="unvalued",
                    status_code="DATA_MISSING",
                    status_reason="Price snapshot is missing, stale, or verification-gated.",
                )
            ],
            data_sources_used=["erc20_balanceOf"],
            status="degraded",
            status_code="DATA_PARTIAL",
            status_label="DATA_PARTIAL",
            status_reason="Portfolio balances are present, but one or more positions cannot be valued.",
            metadata={"balance_count": 1},
        )

        normalized = _normalize_zero_snapshot(zero_snapshot)

        self.assertEqual(normalized.status, "ok")
        self.assertEqual(normalized.status_code, "DATA_FRESH")
        self.assertEqual(normalized.total_value_usd, "0")
        self.assertEqual(normalized.positions[0].value_usd, "0")
        self.assertEqual(normalized.positions[0].weight, "0")
        self.assertEqual(normalized.positions[0].valuation_status, "valued")
        self.assertEqual(normalized.positions[0].status_code, "DATA_FRESH")
        self.assertEqual(normalized.positions[0].status_reason, "Zero-balance position valued at 0 without requiring a price snapshot.")
        self.assertEqual(normalized.positions[0].drift_status, "drifted")

    def test_zero_snapshot_normalization_without_target_stays_not_configured(self) -> None:
        zero_snapshot = PortfolioSnapshotResponse(
            snapshot_id="snapshot-3",
            generated_at=datetime(2026, 1, 1, tzinfo=UTC),
            portfolio_address="0xportfolio",
            chain_id=5003,
            base_currency="USD",
            total_value_usd=None,
            positions=[
                PortfolioPosition(
                    asset_key="SEPOLIA_USDY",
                    asset_symbol="USDY",
                    asset_address="0x2",
                    chain_id=5003,
                    balance="0",
                    balance_source="erc20_balanceOf",
                    price_usd=None,
                    value_usd=None,
                    weight=None,
                    target_weight=None,
                    weight_drift=None,
                    drift_status="unvalued",
                    route_depth_usd=None,
                    slippage_impact_bps=None,
                    valuation_status="unvalued",
                    status_code="DATA_MISSING",
                    status_reason="Price snapshot is missing, stale, or verification-gated.",
                )
            ],
            data_sources_used=["erc20_balanceOf"],
            status="degraded",
            status_code="DATA_PARTIAL",
            status_label="DATA_PARTIAL",
            status_reason="Portfolio balances are present, but one or more positions cannot be valued.",
            metadata={"balance_count": 1},
        )

        normalized = _normalize_zero_snapshot(zero_snapshot)

        self.assertEqual(normalized.positions[0].drift_status, "not_configured")
        self.assertEqual(normalized.metadata.get("demo_normalized"), True)

    @patch("services.agent.repositories.db.market_repository.MarketDataRepository")
    @patch("services.agent.modules.quotes.get_quote_service")
    def test_route_depth_status_reflects_live_quote_validation(self, get_quote_service, market_repository_cls) -> None:
        quote_service = MagicMock()
        quote_service.discover_routes.return_value = []
        get_quote_service.return_value = quote_service
        market_repository_cls.return_value.latest_normalized_quotes.return_value = []

        snapshot = PortfolioSnapshotEngine().build_snapshot(
            balances=[
                BalanceObservation(
                    asset_key="USDY",
                    asset_symbol="USDY",
                    asset_address="0x1",
                    chain_id=5000,
                    balance="1",
                    decimals=18,
                    observed_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                    balance_source="test_fixture",
                    status="ok",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                )
            ],
            prices=[
                NormalizedPriceSnapshot(
                    snapshot_id="price-1",
                    asset_key="USDY",
                    asset_symbol="USDY",
                    asset_address="0x1",
                    chain_id=5000,
                    price_usd="1",
                    confidence_interval_usd="0",
                    publish_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                    observed_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                    age_seconds=1,
                    freshness_status="fresh",
                    status_code="DATA_FRESH",
                    status_reason="fresh",
                    derivation_method="test",
                    data_sources_used=["test_price"],
                    raw_snapshot_ids=["raw-1"],
                )
            ],
            portfolio_address="0xportfolio",
            chain_id=5000,
        )

        self.assertEqual(snapshot.metadata["route_depth_status"], "no_routes")

    @patch("services.agent.app.api.portfolio.asyncio.to_thread", new_callable=AsyncMock)
    @patch("services.agent.app.api.portfolio.get_price_service")
    @patch("services.agent.app.api.portfolio.Erc20BalanceReader")
    @patch("services.agent.app.api.portfolio.PortfolioSnapshotRepository")
    @patch("services.agent.app.api.portfolio.get_settings")
    def test_current_portfolio_launches_live_reads_in_parallel(
        self,
        get_settings,
        portfolio_repository_cls,
        balance_reader_cls,
        get_price_service,
        to_thread,
    ) -> None:
        settings = Settings(
            target_chain=TargetChain.MANTLE_SEPOLIA,
            sepolia_meth_address="0x0000000000000000000000000000000000000001",
            sepolia_usdy_address="0x0000000000000000000000000000000000000002",
            sepolia_wmnt_address="0x0000000000000000000000000000000000000003",
        )
        get_settings.return_value = settings
        portfolio_repository_cls.return_value.latest_snapshot.return_value = None
        balance_reader_cls.return_value.read_configured_balances.return_value = [
            BalanceObservation(
                asset_key="SEPOLIA_USDY",
                asset_symbol="USDY",
                asset_address="0x2",
                chain_id=5003,
                balance="100",
                decimals=18,
                observed_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                balance_source="erc20_balanceOf",
                status="ok",
                status_code="DATA_FRESH",
                status_reason="fresh",
            )
        ]
        get_price_service.return_value.fetch_latest_prices = AsyncMock(return_value=MagicMock(normalized_snapshots=[]))
        to_thread.side_effect = [None, balance_reader_cls.return_value.read_configured_balances.return_value, None]

        snapshot = asyncio.run(current_portfolio(wallet_address="0xportfolio"))

        self.assertGreaterEqual(to_thread.await_count, 2)


if __name__ == "__main__":
    unittest.main()
