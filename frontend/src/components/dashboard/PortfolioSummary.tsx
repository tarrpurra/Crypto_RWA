import { useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortfolioSnapshotResponse, RiskAssessmentResponse } from "@/lib/api/types";

function toTwo(n: number | string): string {
  const v = typeof n === "string" ? Number.parseFloat(n) : n;
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

interface PortfolioSummaryProps {
  portfolio: PortfolioSnapshotResponse | undefined;
  isLoading: boolean;
  detail?: string;
  risk?: RiskAssessmentResponse;
  riskProfile?: string;
}

export function PortfolioSummary({ portfolio, isLoading, detail, risk, riskProfile }: PortfolioSummaryProps) {
  const currentValue = portfolio?.total_value_usd ? Number(portfolio.total_value_usd) : 0;

  const { totalInvested, pnl, pnlPercent } = useMemo(() => {
    const posValue = (portfolio?.positions ?? []).reduce((sum, p) => {
      const v = p.value_usd ? Number.parseFloat(p.value_usd) : 0;
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

    const invested = posValue > 0 ? posValue : currentValue;
    const profit = currentValue - invested;
    const pct = invested > 0 ? (profit / invested) * 100 : 0;

    return { totalInvested: invested, pnl: profit, pnlPercent: pct };
  }, [currentValue, portfolio?.positions]);

  const isPositive = pnl >= 0;

  if (isLoading) {
    return (
      <section className="terminal-panel border-primary/20 col-span-full p-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-pulse border border-primary/30 bg-primary/10" />
          <span className="text-xs text-muted-foreground">Loading portfolio summary...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="terminal-panel border-primary/25 col-span-full p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="terminal-label text-primary">Portfolio</p>
          <p className="text-3xl font-semibold text-foreground">
            ${toTwo(currentValue)}
          </p>
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Invested</p>
              <p className="font-mono text-sm text-foreground">${toTwo(totalInvested)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPositive ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-red-400" />
            )}
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">P&amp;L</p>
              <p className={`font-mono text-sm ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                {isPositive ? "+" : ""}${toTwo(Math.abs(pnl))} ({isPositive ? "+" : ""}{toTwo(pnlPercent)}%)
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4">
        {(portfolio?.positions ?? []).length > 0 && (portfolio?.positions ?? []).map((pos) => {
          const val = pos.value_usd ? Number(pos.value_usd) : 0;
          const share = currentValue > 0 ? (val / currentValue) * 100 : 0;
          return (
            <div key={pos.asset_symbol} className="flex items-center gap-2 text-xs">
              <span className="flex h-2 w-2 rounded-full bg-primary/60" />
              <span className="text-muted-foreground">{pos.asset_symbol}</span>
              <span className="font-mono text-foreground">${toTwo(val)}</span>
              <span className="text-muted-foreground">({toTwo(share)}%)</span>
            </div>
          );
        })}

        {riskProfile && (
          <div className="flex items-center gap-2 text-xs">
            <Shield className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Profile</span>
            <span className="font-mono text-foreground">{riskProfile}</span>
          </div>
        )}

        {risk?.risk_score != null && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Risk</span>
            <span className={cn(
              "font-mono",
              risk.risk_band === "NORMAL" ? "text-success" : risk.risk_band === "CAUTION" ? "text-warning" : "text-destructive",
            )}>
              {risk.risk_band} / {risk.risk_score}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
