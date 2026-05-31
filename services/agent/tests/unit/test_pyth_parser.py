from __future__ import annotations

import unittest
from decimal import Decimal

from services.agent.modules.oracle.pyth_parser import parse_hermes_price_update


class PythParserTests(unittest.TestCase):
    def test_parse_latest_price_accepts_prefixed_feed_id(self) -> None:
        payload = {
            "parsed": [
                {
                    "id": "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
                    "price": {
                        "price": "184136023127",
                        "conf": "177166324",
                        "expo": -8,
                        "publish_time": 1692110601,
                    },
                }
            ]
        }

        observation = parse_hermes_price_update(
            payload,
            "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
        )

        self.assertEqual(
            observation.feed_id,
            "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
        )
        self.assertEqual(observation.price, Decimal("1841.36023127"))
        self.assertEqual(observation.confidence, Decimal("1.77166324"))


if __name__ == "__main__":
    unittest.main()
