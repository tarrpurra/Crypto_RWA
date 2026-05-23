import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from services.agent.app.main import app


class ChainEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_chain_status_returns_degraded_response_when_rpc_fails(self) -> None:
        with patch(
            "services.agent.app.api.chain.QuickNodeRpcClient.status",
            side_effect=RuntimeError("RPC unavailable"),
        ):
            response = self.client.get("/chain/status")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["status_code"], "DATA_MISSING")
        self.assertEqual(body["chain_id"], None)
        self.assertEqual(body["latest_block"], None)
        self.assertIn("rpc_error", body)


if __name__ == "__main__":
    unittest.main()
