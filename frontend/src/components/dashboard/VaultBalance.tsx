import { Activity, ArrowRight, ChevronDown, ShieldAlert, Target, Vault } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type {
  AllocationDecisionResponse,
  DashboardFreshnessPayload,
  RecommendationResponse,
  RiskAssessmentResponse,
  VaultBalanceResponse,
} from "@/lib/api/types";

function toTwo(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number.parseFloat(n) : (n ?? 0);
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

function toThree(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number.parseFloat(n) : (n ?? 0);
  return Number.isFinite(v) ? v.toFixed(3) : "0.000";
}

function toPercent(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return `${Math.round(value * 100)}%`;
}

function toUpdatedText(ageSeconds: number | null | undefined) {
  if (typeof ageSeconds !== "number" || !Number.isFinite(ageSeconds)) {
    return "Updated recently";
  }
  if (ageSeconds < 60) {
    return `Updated ${ageSeconds}s ago`;
  }
  const minutes = Math.round(ageSeconds / 60);
  return `Updated ${minutes}m ago`;
}

function prettyTargetChain(value: string | undefined) {
  if (!value) {
    return "Mantle Sepolia";
  }
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function formatScale(risk: RiskAssessmentResponse | null | undefined) {
  const bands = risk?.risk_score_scale?.bands ?? [];
  const currentBand = bands.find((band) => band.code === risk?.risk_band);
  if (currentBand) {
    const upper =
      currentBand.max_exclusive >= 100
        ? currentBand.max_exclusive.toFixed(0)
        : `<${currentBand.max_exclusive.toFixed(0)}`;
    return `${currentBand.min_inclusive.toFixed(0)}-${upper}`;
  }
  return "0-100";
}

interface VaultBalanceProps {
  vaultData: VaultBalanceResponse | undefined;
  isLoading: boolean;
  onDeposit: () => void;
  onWithdraw: () => void;
  risk?: RiskAssessmentResponse | null;
  allocation?: AllocationDecisionResponse | undefined;
  decisions?: RecommendationResponse | undefined;
  freshness?: DashboardFreshnessPayload | null;
}

function BalanceRow({
  symbol,
  balance,
  value,
  share,
}: {
  symbol: string;
  balance: string;
  value: string | null;
  share?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="flex h-2 w-2 rounded-full bg-primary/60" />
        <span className="text-muted-foreground">{symbol}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-foreground">{toThree(balance)}</span>
        {value && <span className="font-mono text-muted-foreground">${toTwo(value)}</span>}
        {share != null && (
          <span className="w-10 text-right font-mono text-muted-foreground">
            {(share * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

export function VaultBalance({
  vaultData,
  isLoading,
  onDeposit,
  onWithdraw,
  risk,
  allocation,
  decisions,
  freshness,
}: VaultBalanceProps) {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <section className="terminal-panel border-primary/20 p-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-pulse border border-primary/30 bg-primary/10" />
          <span className="text-xs text-muted-foreground">Loading vault...</span>
        </div>
      </section>
    );
  }

  const riskScore = risk?.risk_score_normalized ?? risk?.risk_score;
  const riskBand = risk?.risk_band ?? "PENDING";
  const confidence = risk?.confidence_normalized ?? risk?.confidence;
  const recommendedAction =
    allocation?.decision.recommended_action ??
    decisions?.recommended_action ??
    risk?.recommended_action ??
    "MONITOR";
  const decisionConfidence = allocation?.decision.confidence ?? decisions?.confidence;
  const decisionProfile = allocation?.decision.profile_name ?? "Balanced";
  const approvalMode =
    risk?.required_human_approval_status ??
    decisions?.required_human_approval_status ??
    "required";
  const chainLabel = prettyTargetChain(risk?.target_chain ?? decisions?.target_chain);
  const updatedText = toUpdatedText(freshness?.age_seconds ?? null);
  const riskColor = toneClass(
    riskBand,
    risk?.hard_veto_status ?? decisions?.hard_veto_status,
  );
  const riskScale = formatScale(risk);

  return (
    <section className="terminal-panel border-primary/25 p-3 sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Vault className="h-4 w-4 shrink-0 text-primary" />
              <span className="terminal-label text-primary">YIELDMIND VAULT</span>
            </div>
            <p className="mt-1 text-[0.72rem] text-muted-foreground">
              AI-managed vault • {chainLabel} • {updatedText}
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 xl:items-end">
            {vaultData?.total_value_usd != null && (
              <span className="font-display text-base font-semibold text-foreground whitespace-nowrap">
                ${toTwo(vaultData.total_value_usd)}
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2">
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
        </div>

        <div className="grid gap-3 border-t border-border pt-3 xl:grid-cols-[1.25fr_1px_1fr] xl:items-center">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            {(vaultData?.balances ?? []).map((balance) => (
              <div key={balance.asset_symbol} className="flex items-center gap-2">
                <span className="font-medium text-foreground">{balance.asset_symbol}</span>
                <span className="font-mono text-muted-foreground">
                  {((balance.share ?? 0) * 100).toFixed(1)}%
                </span>
                <span className="font-mono text-foreground">${toTwo(balance.value_usd)}</span>
              </div>
            ))}
            {(vaultData?.balances ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">
                No allocation is available until funds are deposited into the vault.
              </p>
            )}
          </div>

          <div className="hidden self-stretch bg-border xl:block" />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs xl:justify-end">
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
        </div>

        <div className="grid gap-2 border-t border-border/70 pt-3 text-[0.72rem] xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-muted-foreground">Scale <span className="font-mono text-foreground">{riskScale}</span></span>
            <span className="hidden h-3.5 w-px bg-border sm:block" />
            <span className="text-muted-foreground">Approval <span className="font-sans font-medium text-foreground">{approvalMode}</span></span>
            <span className="hidden h-3.5 w-px bg-border sm:block" />
            <span className="text-muted-foreground">
              Decision confidence <span className="font-mono text-foreground">{toPercent(decisionConfidence)}</span>
            </span>
            <span className="hidden h-3.5 w-px bg-border sm:block" />
            <span className="text-muted-foreground">Profile <span className="font-sans font-medium text-foreground">{decisionProfile}</span></span>
          </div>
          <div className="justify-self-start xl:justify-self-end">
            <Button
              onClick={() => setExpanded((value) => !value)}
              variant="ghost"
              size="sm"
              className="h-auto px-0 py-0 text-[0.72rem] text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              View Details
              <ChevronDown
                className={`ml-1 h-3.5 w-3.5 transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="space-y-3 border-t border-border/60 pt-3">
            <div>
              <p className="mb-2 text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
                Asset Details
              </p>
              <div className="space-y-0.5">
                {(vaultData?.balances ?? []).length > 0 ? (
                  vaultData?.balances.map((item) => (
                    <BalanceRow
                      key={`vault-${item.asset_symbol}`}
                      symbol={item.asset_symbol}
                      balance={item.balance}
                      value={item.value_usd}
                      share={item.share}
                    />
                  ))
                ) : (
                  <p className="py-2 text-xs text-muted-foreground">
                    No funds deposited yet. Deposit from your wallet to start AI-managed allocation.
                  </p>
                )}
              </div>
            </div>

            {vaultData?.status_reason && (
              <div>
                <p className="mb-1 text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
                  Status
                </p>
                <p className="text-xs leading-tight text-muted-foreground">
                  {vaultData.status_reason}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
