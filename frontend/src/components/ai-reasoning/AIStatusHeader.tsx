import { AlertTriangle, CheckCircle2, Cpu, type LucideIcon, Pause, ShieldOff, Signal, Zap } from "lucide-react";
import type { AIAction, ExecutionGate } from "./types";

interface AIStatusHeaderProps {
  action: AIAction;
  riskBand: string;
  executionGate: ExecutionGate;
  confidence: number;
  mode: string;
  lastUpdated: string;
  signalsRetrieved: number;
  warnings: number;
  hardGuardActive: boolean;
  needsHumanApproval: boolean;
}

const actionConfig: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  PAUSE: { label: "PAUSE", icon: Pause, color: "text-destructive" },
  REBALANCE: { label: "REBALANCE", icon: Zap, color: "text-primary" },
  REDUCE_RISK: { label: "REDUCE RISK", icon: ShieldOff, color: "text-warning" },
  HOLD: { label: "HOLD", icon: CheckCircle2, color: "text-success" },
  APPROVE_PROPOSAL: { label: "APPROVE", icon: CheckCircle2, color: "text-success" },
  SIMULATION_ONLY: { label: "SIMULATION", icon: Cpu, color: "text-copper" },
};

const gateColor: Record<string, string> = {
  allowed: "text-success",
  needs_human_approval: "text-warning",
  blocked_by_guardrail: "text-destructive",
  simulation_only: "text-copper",
  paused: "text-destructive",
};

const bandColor = (band: string): string => {
  if (band.startsWith("RISK_NORMAL")) return "text-success";
  if (band.startsWith("RISK_CAUTION") || band.startsWith("RISK_REBALANCE_ONLY")) return "text-warning";
  if (band.startsWith("RISK_REDUCE_ONLY") || band.startsWith("RISK_PAUSE_REQUIRED") || band.startsWith("RISK_VETO")) return "text-destructive";
  return "text-muted-foreground";
};

export function AIStatusHeader({
  action,
  riskBand,
  executionGate,
  confidence,
  mode,
  lastUpdated,
  signalsRetrieved,
  warnings,
  hardGuardActive,
  needsHumanApproval,
}: AIStatusHeaderProps) {
  const cfg = actionConfig[action] ?? actionConfig.HOLD;
  const Icon = cfg.icon;

  return (
    <div className="rounded-lg border border-border bg-gradient-to-br from-card/90 to-surface-2/90 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 ${cfg.color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">AI Reasoning Engine</p>
            <div className="mt-1 flex items-center gap-3">
              <span className={`text-lg font-extrabold ${cfg.color}`}>{cfg.label}</span>
              <span className={`rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${bandColor(riskBand)}`}>
                {riskBand}
              </span>
              <span className={`rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${gateColor[executionGate] ?? "text-muted-foreground"}`}>
                {executionGate.replaceAll("_", " ")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Confidence</p>
            <p className={`text-lg font-extrabold ${confidence >= 0.7 ? "text-success" : confidence >= 0.4 ? "text-warning" : "text-destructive"}`}>
              {Math.round(confidence * 100)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Mode</p>
            <p className="text-sm font-semibold text-cream">{mode}</p>
          </div>
          <div className="text-right">
            <p className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Updated</p>
            <p className="text-sm font-semibold text-cream">{lastUpdated}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
          <Signal className="h-3 w-3 text-primary" />
          {signalsRetrieved} Signals Retrieved
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.62rem] uppercase tracking-[0.14em] ${
          warnings > 0
            ? "border-warning/30 bg-warning-bg text-warning"
            : "border-border bg-surface-2 text-muted-foreground"
        }`}>
          <AlertTriangle className="h-3 w-3" />
          {warnings > 0 ? `${warnings} Warnings` : "No Warnings"}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.62rem] uppercase tracking-[0.14em] ${
          hardGuardActive
            ? "border-destructive/30 bg-crimson-bg text-destructive"
            : "border-border bg-surface-2 text-muted-foreground"
        }`}>
          <ShieldOff className="h-3 w-3" />
          {hardGuardActive ? "Hard Guard Active" : "Guards Clear"}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.62rem] uppercase tracking-[0.14em] ${
          needsHumanApproval
            ? "border-warning/30 bg-warning-bg text-warning"
            : "border-border bg-surface-2 text-muted-foreground"
        }`}>
          <Cpu className="h-3 w-3" />
          {needsHumanApproval ? "Human Approval Required" : "Auto-Approval Active"}
        </span>
      </div>
    </div>
  );
}
