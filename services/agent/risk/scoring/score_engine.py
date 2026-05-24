from __future__ import annotations

import logging
from datetime import datetime
from services.agent.app.core.settings import get_settings
from services.agent.app.schemas.risk import RiskSnapshot
from services.agent.repositories.db.market_repository import MarketDataRepository
from services.agent.modules.oracle.freshness import utc_now
from services.agent.app.schemas.portfolio import PortfolioSnapshot

logger = logging.getLogger("services.agent.risk.score_engine")


class RiskScoreEngine:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.repo = MarketDataRepository()

    def compute_risk_snapshot(self, portfolio: PortfolioSnapshot) -> RiskSnapshot:
        now = utc_now()
        
        # 1. Fetch latest prices & quotes
        prices = self.repo.latest_normalized_prices()
        quotes = self.repo.latest_normalized_quotes()
        
        bucket_scores = {
            "depeg": 0.0,
            "liquidity": 0.0,
            "oracle": 0.0,
            "concentration": 0.0,
        }
        
        prechecks = {
            "oracle_fresh": True,
            "liquidity_sufficient": True,
            "peg_stable": True,
            "concentration_within_bounds": True,
        }
        
        notes: list[str] = []
        
        # --- Oracle Risk & Freshness check ---
        max_price_age = 0.0
        for p in prices:
            age = (now - p.observed_timestamp).total_seconds()
            if age > max_price_age:
                max_price_age = age
            
            # Check thresholds from settings
            if p.asset_symbol == "USDY":
                if age > self.settings.ondo_usdy_oracle_hard_block_seconds:
                    bucket_scores["oracle"] = 100.0
                    prechecks["oracle_fresh"] = False
                    notes.append(f"USDY oracle price is extremely stale: {age:.1f}s")
                elif age > self.settings.ondo_usdy_oracle_warn_seconds:
                    bucket_scores["oracle"] = max(bucket_scores["oracle"], 50.0)
                    notes.append(f"USDY oracle price is warning-level stale: {age:.1f}s")
            else:  # volatile/mETH
                if age > self.settings.pyth_eth_usd_hard_block_seconds:
                    bucket_scores["oracle"] = 100.0
                    prechecks["oracle_fresh"] = False
                    notes.append(f"Pyth oracle price is extremely stale: {age:.1f}s")
                elif age > self.settings.pyth_eth_usd_warn_seconds:
                    bucket_scores["oracle"] = max(bucket_scores["oracle"], 50.0)
                    notes.append(f"Pyth oracle price is warning-level stale: {age:.1f}s")
                    
        if not prices:
            bucket_scores["oracle"] = 100.0
            prechecks["oracle_fresh"] = False
            notes.append("No price snapshots found in database.")

        # --- Depeg Risk ---
        # Compare USDY oracle price against DEX price (mid price)
        usdy_price = next((p for p in prices if p.asset_symbol == "USDY"), None)
        # Note: check if we have any USDY quotes
        usdy_quote = next((q for q in quotes if "USDY" in q.route_id or q.token_in_symbol == "USDY" or q.token_out_symbol == "USDY"), None)
        
        if usdy_price and usdy_quote and usdy_quote.quoted_price:
            try:
                oracle_val = float(usdy_price.price_usd)
                dex_val = float(usdy_quote.quoted_price)
                if oracle_val > 0:
                    diff = abs(oracle_val - dex_val) / oracle_val
                    if diff > 0.02:  # > 2% depeg
                        bucket_scores["depeg"] = 100.0
                        prechecks["peg_stable"] = False
                        notes.append(f"Severe USDY depeg detected: Oracle ${oracle_val:.3f} vs DEX ${dex_val:.3f} ({diff*100:.1f}%)")
                    elif diff > 0.01:  # > 1% depeg
                        bucket_scores["depeg"] = 60.0
                        notes.append(f"Moderate USDY depeg detected: Oracle ${oracle_val:.3f} vs DEX ${dex_val:.3f} ({diff*100:.1f}%)")
            except Exception as exc:
                logger.error("Error computing depeg: %s", exc)

        # --- Liquidity Risk ---
        max_slippage = 0.0
        for q in quotes:
            if q.estimated_slippage_bps:
                try:
                    slip = float(q.estimated_slippage_bps) / 100.0  # %
                    if slip > max_slippage:
                        max_slippage = slip
                except ValueError:
                    pass
                    
        if max_slippage > 2.0:  # > 2% slippage
            bucket_scores["liquidity"] = 100.0
            prechecks["liquidity_sufficient"] = False
            notes.append(f"Critical slippage warning: best route slippage is {max_slippage:.2f}%")
        elif max_slippage > 1.0:  # > 1% slippage
            bucket_scores["liquidity"] = 50.0
            notes.append(f"Moderate slippage: best route slippage is {max_slippage:.2f}%")
            
        if not quotes:
            bucket_scores["liquidity"] = 50.0  # Stale or unknown route liquidity
            notes.append("No active route quotes found.")

        # --- Concentration Risk ---
        for symbol, weight in portfolio.weights.items():
            if symbol == "mETH" and weight > 0.40:
                bucket_scores["concentration"] = max(bucket_scores["concentration"], 80.0)
                prechecks["concentration_within_bounds"] = False
                notes.append(f"mETH concentration of {weight*100:.1f}% exceeds safe limit of 40%")
            elif symbol == "USDY" and weight > 0.60:
                bucket_scores["concentration"] = max(bucket_scores["concentration"], 70.0)
                prechecks["concentration_within_bounds"] = False
                notes.append(f"USDY concentration of {weight*100:.1f}% exceeds safe limit of 60%")

        # 2. Compute Weighted Score
        weights = {
            "depeg": 0.35,
            "liquidity": 0.20,
            "oracle": 0.25,
            "concentration": 0.20,
        }
        
        total_score = sum(bucket_scores[b] * weights[b] for b in bucket_scores)
        
        # 3. Determine Action Band
        # 0-25   = RISK_NORMAL
        # 25-45  = RISK_CAUTION
        # 45-65  = RISK_REBALANCE_ONLY
        # 65-80  = RISK_REDUCE_ONLY
        # >80    = RISK_PAUSE_REQUIRED
        
        if total_score > 80.0:
            risk_band = "RISK_PAUSE_REQUIRED"
            status_code = "RISK_PAUSE_REQUIRED"
        elif total_score > 65.0:
            risk_band = "RISK_REDUCE_ONLY"
            status_code = "RISK_REDUCE_ONLY"
        elif total_score > 45.0:
            risk_band = "RISK_REBALANCE_ONLY"
            status_code = "RISK_REBALANCE_ONLY"
        elif total_score > 25.0:
            risk_band = "RISK_CAUTION"
            status_code = "RISK_CAUTION"
        else:
            risk_band = "RISK_NORMAL"
            status_code = "RISK_NORMAL"
            
        # 4. Hard Veto Check
        # Trigger RISK_VETO if oracle is stale or severe depeg/slippage exists
        if not prechecks["oracle_fresh"] or bucket_scores["depeg"] == 100.0 or not prechecks["liquidity_sufficient"]:
            risk_band = "RISK_VETO"
            status_code = "RISK_VETO"
            total_score = 100.0
            notes.append("HARD VETO ACTIVE: Proposal execution is blocked.")

        status_reason = f"Weighted risk score is {total_score:.1f}. Active band is {risk_band}."
        if not notes:
            notes.append("All risk systems normal.")

        return RiskSnapshot(
            snapshot_id=f"risk_{int(now.timestamp())}",
            total_score=total_score,
            risk_band=risk_band,
            status_code=status_code,
            status_reason=status_reason,
            bucket_scores=bucket_scores,
            prechecks=prechecks,
            notes=notes,
            created_at=now,
        )
