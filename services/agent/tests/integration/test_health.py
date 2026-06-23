import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from services.agent.app.core import runtime_config
from services.agent.app.core.settings import get_settings
from services.agent.app.core.status_codes import RuntimeMode
from services.agent.app.main import app
from services.agent.app.schemas.health import TokenReadiness


class HealthEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.settings = get_settings()
        self.original_runtime_mode = self.settings.runtime_mode
        self.original_ai_decision_maker_enabled = runtime_config.get_ai_decision_maker_enabled()

    def tearDown(self) -> None:
        self.settings.runtime_mode = self.original_runtime_mode
        runtime_config.AI_DECISION_MAKER_ENABLED = self.original_ai_decision_maker_enabled

    def test_health_endpoint_includes_runtime_context(self) -> None:
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertIn("runtime_mode", body)
        self.assertIn("status_code", body)

    def test_status_endpoint_includes_freshness_thresholds(self) -> None:
        response = self.client.get("/status")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("configured_contracts", body)
        self.assertIn("freshness_thresholds", body)
        self.assertIn("pyth_eth_usd", body["freshness_thresholds"])

    def test_settings_endpoint_includes_sepolia_asset_config(self) -> None:
        response = self.client.get("/settings")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("chain_id", body)
        self.assertIn("sepolia_meth_address", body)
        self.assertIn("sepolia_meth_is_test_token", body)
        self.assertIn("sepolia_meth_price_mode", body)
        self.assertIn("runtime_mode", body)

    def test_settings_endpoint_accepts_runtime_mode_update(self) -> None:
        response = self.client.put("/settings", json={"runtime_mode": "live"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["runtime_mode"], "live")
        self.assertEqual(self.settings.runtime_mode, RuntimeMode.LIVE)

    @patch("services.agent.app.api.health._readiness_routes")
    @patch("services.agent.app.api.health._token_readiness")
    @patch("services.agent.app.api.health.Web3")
    def test_system_readiness_endpoint_returns_structured_response(self, _web3, token_readiness, readiness_routes) -> None:
        token_readiness.side_effect = [
            TokenReadiness(address="0x1", code_exists=True, symbol="USDY", symbol_ok=True, decimals=18),
            TokenReadiness(address="0x2", code_exists=True, symbol="WMNT", symbol_ok=True, decimals=18, deposit_supported=True),
            TokenReadiness(address="0x3", code_exists=True, symbol="mETH", symbol_ok=True, decimals=18, test_token=True),
        ]
        readiness_routes.return_value = {
            "WMNT_USDY": "no_route",
            "USDY_METH": "quote_failed",
            "WMNT_METH": "ok",
        }

        response = self.client.get("/system/readiness")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["chain_id"], 5003)
        self.assertIn("tokens", body)
        self.assertIn("pricing", body)
        self.assertIn("routes", body)
        self.assertEqual(body["execution"]["mode"], "wallet_direct")


if __name__ == "__main__":
    unittest.main()
