from __future__ import annotations


def build_depeg_scenario() -> dict:
    return {
        "scenario_id": "depeg",
        "name": "USDY Depeg",
        "description": "USDY price weakens while risk bands escalate and allocation is forced to pause.",
        "category": "stress",
        "data_sources_used": ["seeded_scenario"],
        "steps": [
            {
                "observed_at": "2026-05-26T00:00:00+00:00",
                "asset_prices": {"USDC": 1.0, "USDY": 1.0, "mETH": 3500.0},
                "portfolio": {
                    "snapshot_id": "depeg_port_0",
                    "wallet_or_vault": "scenario_vault",
                    "total_value_usd": 1000000.0,
                    "balances": [
                        {"asset_symbol": "USDC", "balance": 250000.0, "value_usd": 250000.0, "weight": 0.25},
                        {"asset_symbol": "USDY", "balance": 450000.0, "value_usd": 450000.0, "weight": 0.45},
                        {"asset_symbol": "mETH", "balance": 85.7143, "value_usd": 300000.0, "weight": 0.30},
                    ],
                    "weights": {"USDC": 0.25, "USDY": 0.45, "mETH": 0.30},
                    "status_code": "DATA_FRESH",
                    "status_reason": "Seeded baseline portfolio.",
                },
                "risk": {
                    "snapshot_id": "depeg_risk_0",
                    "total_score": 10.0,
                    "risk_band": "RISK_NORMAL",
                    "status_code": "RISK_NORMAL",
                    "status_reason": "Baseline risk.",
                    "bucket_scores": {"depeg": 0.0, "liquidity": 0.0, "oracle": 0.0, "concentration": 0.0},
                    "prechecks": {"peg_stable": True, "oracle_fresh": True, "liquidity_sufficient": True},
                    "notes": ["All risk systems normal."],
                },
            },
            {
                "observed_at": "2026-05-26T01:00:00+00:00",
                "asset_prices": {"USDC": 1.0, "USDY": 0.985, "mETH": 3475.0},
                "portfolio": {
                    "snapshot_id": "depeg_port_1",
                    "wallet_or_vault": "scenario_vault",
                    "total_value_usd": 985750.0,
                    "balances": [
                        {"asset_symbol": "USDC", "balance": 250000.0, "value_usd": 250000.0, "weight": 0.2536},
                        {"asset_symbol": "USDY", "balance": 450000.0, "value_usd": 443250.0, "weight": 0.4497},
                        {"asset_symbol": "mETH", "balance": 84.1727, "value_usd": 292500.0, "weight": 0.2967},
                    ],
                    "weights": {"USDC": 0.2536, "USDY": 0.4497, "mETH": 0.2967},
                    "status_code": "DATA_FRESH",
                    "status_reason": "Seeded moderate depeg portfolio.",
                },
                "risk": {
                    "snapshot_id": "depeg_risk_1",
                    "total_score": 42.0,
                    "risk_band": "RISK_CAUTION",
                    "status_code": "RISK_CAUTION",
                    "status_reason": "Moderate depeg pressure.",
                    "bucket_scores": {"depeg": 60.0, "liquidity": 20.0, "oracle": 20.0, "concentration": 0.0},
                    "prechecks": {"peg_stable": True, "oracle_fresh": True, "liquidity_sufficient": True},
                    "notes": ["Moderate USDY depeg detected."],
                },
            },
            {
                "observed_at": "2026-05-26T02:00:00+00:00",
                "asset_prices": {"USDC": 1.0, "USDY": 0.94, "mETH": 3420.0},
                "portfolio": {
                    "snapshot_id": "depeg_port_2",
                    "wallet_or_vault": "scenario_vault",
                    "total_value_usd": 956200.0,
                    "balances": [
                        {"asset_symbol": "USDC", "balance": 250000.0, "value_usd": 250000.0, "weight": 0.2615},
                        {"asset_symbol": "USDY", "balance": 450000.0, "value_usd": 423000.0, "weight": 0.4424},
                        {"asset_symbol": "mETH", "balance": 82.807, "value_usd": 283200.0, "weight": 0.2961},
                    ],
                    "weights": {"USDC": 0.2615, "USDY": 0.4424, "mETH": 0.2961},
                    "status_code": "DATA_FRESH",
                    "status_reason": "Seeded severe depeg portfolio.",
                },
                "risk": {
                    "snapshot_id": "depeg_risk_2",
                    "total_score": 100.0,
                    "risk_band": "RISK_VETO",
                    "status_code": "RISK_VETO",
                    "status_reason": "Severe USDY depeg blocks execution-facing recommendations.",
                    "bucket_scores": {"depeg": 100.0, "liquidity": 40.0, "oracle": 20.0, "concentration": 0.0},
                    "prechecks": {"peg_stable": False, "oracle_fresh": True, "liquidity_sufficient": True},
                    "notes": ["HARD VETO ACTIVE: Severe USDY depeg detected."],
                },
            },
        ],
    }
