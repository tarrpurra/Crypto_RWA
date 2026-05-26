from __future__ import annotations


def build_liquidity_shock_scenario() -> dict:
    return {
        "scenario_id": "liquidity_shock",
        "name": "Liquidity Shock",
        "description": "Route liquidity weakens while mETH concentration remains high.",
        "category": "stress",
        "data_sources_used": ["seeded_scenario"],
        "steps": [
            {
                "observed_at": "2026-05-26T00:00:00+00:00",
                "asset_prices": {"USDC": 1.0, "USDY": 1.0, "mETH": 3500.0},
                "portfolio": {
                    "snapshot_id": "liq_port_0",
                    "wallet_or_vault": "scenario_vault",
                    "total_value_usd": 1000000.0,
                    "balances": [
                        {"asset_symbol": "USDC", "balance": 50000.0, "value_usd": 50000.0, "weight": 0.05},
                        {"asset_symbol": "USDY", "balance": 450000.0, "value_usd": 450000.0, "weight": 0.45},
                        {"asset_symbol": "mETH", "balance": 142.8571, "value_usd": 500000.0, "weight": 0.50},
                    ],
                    "weights": {"USDC": 0.05, "USDY": 0.45, "mETH": 0.50},
                    "status_code": "DATA_FRESH",
                    "status_reason": "Seeded high mETH concentration portfolio.",
                },
                "risk": {
                    "snapshot_id": "liq_risk_0",
                    "total_score": 20.0,
                    "risk_band": "RISK_NORMAL",
                    "status_code": "RISK_NORMAL",
                    "status_reason": "Routes are available.",
                    "bucket_scores": {"depeg": 0.0, "liquidity": 0.0, "oracle": 0.0, "concentration": 80.0},
                    "prechecks": {"peg_stable": True, "oracle_fresh": True, "liquidity_sufficient": True},
                    "notes": ["mETH concentration is elevated."],
                },
            },
            {
                "observed_at": "2026-05-26T01:00:00+00:00",
                "asset_prices": {"USDC": 1.0, "USDY": 1.0, "mETH": 3400.0},
                "portfolio": {
                    "snapshot_id": "liq_port_1",
                    "wallet_or_vault": "scenario_vault",
                    "total_value_usd": 985714.0,
                    "balances": [
                        {"asset_symbol": "USDC", "balance": 50000.0, "value_usd": 50000.0, "weight": 0.0507},
                        {"asset_symbol": "USDY", "balance": 450000.0, "value_usd": 450000.0, "weight": 0.4565},
                        {"asset_symbol": "mETH", "balance": 142.8571, "value_usd": 485714.0, "weight": 0.4928},
                    ],
                    "weights": {"USDC": 0.0507, "USDY": 0.4565, "mETH": 0.4928},
                    "status_code": "DATA_FRESH",
                    "status_reason": "Seeded liquidity warning portfolio.",
                },
                "risk": {
                    "snapshot_id": "liq_risk_1",
                    "total_score": 58.0,
                    "risk_band": "RISK_REBALANCE_ONLY",
                    "status_code": "RISK_REBALANCE_ONLY",
                    "status_reason": "Liquidity is weak; only risk-reducing rebalance is allowed.",
                    "bucket_scores": {"depeg": 0.0, "liquidity": 70.0, "oracle": 0.0, "concentration": 80.0},
                    "prechecks": {"peg_stable": True, "oracle_fresh": True, "liquidity_sufficient": True},
                    "notes": ["Route liquidity is weak."],
                },
            },
            {
                "observed_at": "2026-05-26T02:00:00+00:00",
                "asset_prices": {"USDC": 1.0, "USDY": 1.0, "mETH": 3250.0},
                "portfolio": {
                    "snapshot_id": "liq_port_2",
                    "wallet_or_vault": "scenario_vault",
                    "total_value_usd": 964286.0,
                    "balances": [
                        {"asset_symbol": "USDC", "balance": 50000.0, "value_usd": 50000.0, "weight": 0.0519},
                        {"asset_symbol": "USDY", "balance": 450000.0, "value_usd": 450000.0, "weight": 0.4667},
                        {"asset_symbol": "mETH", "balance": 142.8571, "value_usd": 464286.0, "weight": 0.4814},
                    ],
                    "weights": {"USDC": 0.0519, "USDY": 0.4667, "mETH": 0.4814},
                    "status_code": "DATA_FRESH",
                    "status_reason": "Seeded liquidity shock portfolio.",
                },
                "risk": {
                    "snapshot_id": "liq_risk_2",
                    "total_score": 100.0,
                    "risk_band": "RISK_VETO",
                    "status_code": "RISK_VETO",
                    "status_reason": "Liquidity shock blocks proposal generation.",
                    "bucket_scores": {"depeg": 0.0, "liquidity": 100.0, "oracle": 0.0, "concentration": 80.0},
                    "prechecks": {"peg_stable": True, "oracle_fresh": True, "liquidity_sufficient": False},
                    "notes": ["HARD VETO ACTIVE: Critical route slippage."],
                },
            },
        ],
    }
