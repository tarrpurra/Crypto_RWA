import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from services.agent.app.main import app


class MarketEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_ingestion_status_endpoint_returns_assets(self) -> None:
        response = self.client.get("/market/ingestion/status")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("assets", body)
        self.assertGreaterEqual(len(body["assets"]), 1)

    def test_latest_prices_endpoint_returns_structured_response(self) -> None:
        response = self.client.get("/market/prices/latest")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("prices", body)
        self.assertIn("status_code", body)

    def test_usdy_oracle_status_endpoint_returns_structured_response(self) -> None:
        response = self.client.get("/market/oracles/usdy")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["asset"], "USDY")
        self.assertIn("status", body)

    def test_latest_quotes_endpoint_returns_structured_response(self) -> None:
        response = self.client.get("/market/quotes/latest")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("quotes", body)
        self.assertIn("status_code", body)

    @patch("services.agent.app.api.market._save_quotes_best_effort")
    @patch("services.agent.app.api.market._save_prices_best_effort")
    @patch("services.agent.app.api.market.QUOTE_SNAPSHOT_STORE.write")
    @patch("services.agent.app.api.market.PRICE_SNAPSHOT_STORE.write")
    @patch("services.agent.app.api.market.get_quote_service")
    @patch("services.agent.app.api.market.get_price_service")
    @patch("services.agent.app.api.market.asyncio.gather", new_callable=AsyncMock)
    def test_latest_quotes_parallelizes_price_refresh_and_route_discovery(
        self,
        gather_mock,
        get_price_service,
        get_quote_service,
        price_store_write,
        quote_store_write,
        save_prices,
        save_quotes,
    ) -> None:
        price_bundle = MagicMock()
        price_bundle.normalized_snapshots = []
        routes = [MagicMock()]
        quotes_bundle = MagicMock()
        quotes_bundle.normalized_snapshots = []

        gather_mock.return_value = (price_bundle, routes)
        get_price_service.return_value.fetch_latest_prices = AsyncMock(return_value=price_bundle)
        quote_service = MagicMock()
        quote_service.sample_latest_quotes.return_value = quotes_bundle
        quote_service.settings.target_chain = "mantle_sepolia"
        get_quote_service.return_value = quote_service

        response = self.client.get("/market/quotes/latest")

        self.assertEqual(response.status_code, 200)
        quote_service.sample_latest_quotes.assert_called_once_with(routes=routes)
        self.assertTrue(gather_mock.await_count >= 1)
        price_store_write.assert_called_once_with(price_bundle)
        quote_store_write.assert_called_once_with(quotes_bundle)
        save_prices.assert_called_once()
        save_quotes.assert_called_once()

    def test_pair_quotes_endpoint_returns_structured_response(self) -> None:
        response = self.client.get("/market/quotes/USDY/mETH")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("quotes", body)
        self.assertIn("status_code", body)

    def test_best_quote_endpoint_returns_not_found_when_no_pair_exists(self) -> None:
        response = self.client.get("/market/quotes/FOO/BAR/best")

        self.assertEqual(response.status_code, 404)

    def test_routes_endpoint_returns_structured_response(self) -> None:
        response = self.client.get("/market/routes")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("routes", body)
        self.assertIn("status_code", body)

    @patch("services.agent.app.api.market.MarketDataRepository")
    def test_price_history_endpoint_returns_demo_points_when_repo_is_empty(self, market_repo_cls) -> None:
        market_repo = MagicMock()
        market_repo.price_history.return_value = []
        market_repo_cls.return_value = market_repo

        response = self.client.get("/market/price-history", params={"asset": "mETH", "range": "24h", "bucket": "1h"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["asset"], "mETH")
        self.assertEqual(body["range"], "24h")
        self.assertEqual(body["bucket"], "1h")
        self.assertTrue(body["demo"])
        self.assertEqual(len(body["points"]), 24)


if __name__ == "__main__":
    unittest.main()
