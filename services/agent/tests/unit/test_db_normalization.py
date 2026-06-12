from __future__ import annotations

import unittest

from services.agent.repositories.db.normalization import normalize_asset_symbol, normalize_json_symbols


class DbNormalizationTests(unittest.TestCase):
    def test_normalize_asset_symbol_uses_frontend_display_names(self) -> None:
        self.assertEqual(normalize_asset_symbol("METH"), "mETH")
        self.assertEqual(normalize_asset_symbol("meth"), "mETH")
        self.assertEqual(normalize_asset_symbol("USDY"), "USDY")
        self.assertEqual(normalize_asset_symbol("usdy"), "USDY")
        self.assertEqual(normalize_asset_symbol("WMNT"), "WMNT")
        self.assertEqual(normalize_asset_symbol("mnt"), "WMNT")
        self.assertEqual(normalize_asset_symbol("TOKEN_A"), "MockTokenA")
        self.assertEqual(normalize_asset_symbol("mock_token_b"), "MockTokenB")

    def test_normalize_json_symbols_only_rewrites_symbol_fields(self) -> None:
        payload = {
            "asset_symbol": "METH",
            "token_in_symbol": "mnt",
            "token_out_symbol": "mock_token_a",
            "deposit_asset_symbol": "usdy",
            "asset_key": "SEPOLIA_METH",
            "nested": [{"asset_symbol": "mocktokenb"}],
        }

        normalized = normalize_json_symbols(payload)

        self.assertEqual(normalized["asset_symbol"], "mETH")
        self.assertEqual(normalized["token_in_symbol"], "WMNT")
        self.assertEqual(normalized["token_out_symbol"], "MockTokenA")
        self.assertEqual(normalized["deposit_asset_symbol"], "USDY")
        self.assertEqual(normalized["asset_key"], "SEPOLIA_METH")
        self.assertEqual(normalized["nested"][0]["asset_symbol"], "MockTokenB")


if __name__ == "__main__":
    unittest.main()
