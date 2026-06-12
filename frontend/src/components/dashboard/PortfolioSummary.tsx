import { useMemo, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Shield,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  DollarSign,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  AllocationDecisionResponse,
  DashboardFreshnessPayload,
  PortfolioSnapshotResponse,
  RecommendationResponse,
  RiskAssessmentResponse,
  VaultBalanceResponse,
} from "@/lib/api/types";

function toTwo(n: number | string): string {
  const v = typeof n === "string" ? Number.parseFloat(n) : n;
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

interface PortfolioSummaryProps {
  portfolio: PortfolioSnapshotResponse | undefined;
  vaultData?: VaultBalanceResponse;
  isLoading: boolean;
  detail?: string;
  risk?: RiskAssessmentResponse;
  riskProfile?: string;
  allocation?: AllocationDecisionResponse;
  decisions?: RecommendationResponse;
  freshness?: DashboardFreshnessPayload | null;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  children?: ReactNode;
}

function toPercent(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return `${Math.round(value * 100)}%`;
}

function toneClass(riskBand: string | undefined, hardVetoStatus: string | undefined) {
  if (hardVetoStatus === "active") {
    return "text-destructive";
  }
  if (riskBand === "RISK_CAUTION" || riskBand === "RISK_REBALANCE_ONLY") {
    return "text-warning";
  }
  return "text-success";
}

export function PortfolioSummary({
  portfolio,
  vaultData,
  isLoading,
  detail,
  risk,
  riskProfile,
  allocation,
  decisions,
  freshness: _freshness,
  onDeposit,
  onWithdraw,
  children,
}: PortfolioSummaryProps) {
  const currentValue = portfolio?.total_value_usd ? Number(portfolio.total_value_usd) : 0;

  const costBasisTracked = Boolean(vaultData?.metadata?.cost_basis_tracking);
  const totalInvested = useMemo(() => {
    const invested = vaultData?.invested_amount_usd ? Number.parseFloat(vaultData.invested_amount_usd) : NaN;
    return Number.isFinite(invested) ? invested : null;
  }, [vaultData?.invested_amount_usd]);
  const pnl = useMemo(() => {
    const value = vaultData?.pnl_usd ? Number.parseFloat(vaultData.pnl_usd) : NaN;
    return Number.isFinite(value) ? value : null;
  }, [vaultData?.pnl_usd]);
  const pnlPercent = useMemo(() => {
    const value = vaultData?.pnl_percent ? Number.parseFloat(vaultData.pnl_percent) : NaN;
    return Number.isFinite(value) ? value : null;
  }, [vaultData?.pnl_percent]);

  const isPositive = (pnl ?? 0) >= 0;
  const riskScore = risk?.risk_score_normalized ?? risk?.risk_score;
  const riskBand = risk?.risk_band ?? "PENDING";
  const confidence = risk?.confidence_normalized ?? risk?.confidence;
  const recommendedAction =
    allocation?.decision.recommended_action ??
    decisions?.recommended_action ??
    risk?.recommended_action ??
    "MONITOR";
  const riskColor = toneClass(riskBand, risk?.hard_veto_status ?? decisions?.hard_veto_status);

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
    <section className="terminal-panel border-primary/25 col-span-full rounded-lg p-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-start">
        <div className="space-y-1">
          <p className="terminal-label text-primary">Portfolio</p>
          <p className="text-3xl font-semibold text-foreground">
            ${toTwo(currentValue)}
          </p>
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        </div>

        <div className="grid gap-y-2 pt-1 xl:justify-self-start">
          <div className="flex items-start gap-2">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Invested</p>
              <p className="font-mono text-sm text-foreground">
                {totalInvested != null ? `$${toTwo(totalInvested)}` : costBasisTracked ? "$0.00" : "Unavailable"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            {isPositive ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-red-400" />
            )}
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">P&amp;L</p>
              {pnl != null && pnlPercent != null ? (
                <p className={`font-mono text-sm ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                  {isPositive ? "+" : ""}${toTwo(Math.abs(pnl))} ({isPositive ? "+" : ""}{toTwo(pnlPercent)}%)
                </p>
              ) : (
                <p className="font-mono text-sm text-muted-foreground">
                  {costBasisTracked ? "Unavailable" : "Waiting for vault flow history"}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-self-end">
          <Button
            onClick={onDeposit}
            variant="outline"
            size="sm"
            className="border-primary/30 text-primary hover:bg-primary/10"
          >
            Deposit
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
          <Button
            onClick={onWithdraw}
            variant="outline"
            size="sm"
            className="border-primary/30 text-primary hover:bg-primary/10"
          >
            Withdraw
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border pt-4 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Risk</span>
            <span className={`font-mono ${riskColor}`}>
              {typeof riskScore === "number" ? riskScore.toFixed(2) : "--"}
            </span>
            <span className="text-muted-foreground">/ 100</span>
            <span className={`font-mono ${riskColor}`}>{riskBand}</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Confidence</span>
            <span className="font-mono text-foreground">{toPercent(confidence)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Action</span>
            <span className="font-mono text-foreground uppercase">{recommendedAction}</span>
          </div>
        </div>

        {riskProfile && (
          <div className="flex items-center gap-2">
            <Shield className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Profile</span>
            <span className="font-mono text-foreground">{riskProfile}</span>
          </div>
        )}
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
      </div>

      {children && (
        <div className="mt-5 border-t border-border pt-5">
          {children}
        </div>
      )}
    </section>
  );
}
