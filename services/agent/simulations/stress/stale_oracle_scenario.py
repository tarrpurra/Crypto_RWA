from __future__ import annotations


def build_stale_oracle_scenario() -> dict:
    scenario = {
        "scenario_id": "stale_oracle",
        "name": "Stale Oracle",
        "description": "Oracle freshness decays until the strategy enters a hard-veto pause state.",
        "category": "stress",
        "data_sources_used": ["seeded_scenario"],
        "steps": [],
    }
    base_portfolio = {
        "wallet_or_vault": "scenario_vault",
        "total_value_usd": 1000000.0,
        "balances": [
            {"asset_symbol": "USDC", "balance": 250000.0, "value_usd": 250000.0, "weight": 0.25},
            {"asset_symbol": "USDY", "balance": 450000.0, "value_usd": 450000.0, "weight": 0.45},
            {"asset_symbol": "mETH", "balance": 85.7143, "value_usd": 300000.0, "weight": 0.30},
        ],
        "weights": {"USDC": 0.25, "USDY": 0.45, "mETH": 0.30},
        "status_code": "DATA_FRESH",
    }
    for index, risk_band in enumerate(["RISK_NORMAL", "RISK_CAUTION", "RISK_VETO"]):
        score = [10.0, 38.0, 100.0][index]
        portfolio = dict(base_portfolio)
        portfolio["snapshot_id"] = f"stale_oracle_port_{index}"
        portfolio["status_reason"] = "Seeded stale-oracle portfolio."
        scenario["steps"].append(
            {
                "observed_at": f"2026-05-26T0{index}:00:00+00:00",
                "asset_prices": {"USDC": 1.0, "USDY": 1.0, "mETH": 3500.0},
                "portfolio": portfolio,
                "risk": {
                    "snapshot_id": f"stale_oracle_risk_{index}",
                    "total_score": score,
                    "risk_band": risk_band,
                    "status_code": risk_band,
                    "status_reason": "Oracle freshness deteriorated." if index else "Baseline risk.",
                    "bucket_scores": {"depeg": 0.0, "liquidity": 0.0, "oracle": score, "concentration": 0.0},
                    "prechecks": {"peg_stable": True, "oracle_fresh": index < 2, "liquidity_sufficient": True},
                    "notes": ["Oracle data is fresh."] if index == 0 else ["Oracle staleness is restricting recommendations."],
                },
            }
        )
    return scenario
