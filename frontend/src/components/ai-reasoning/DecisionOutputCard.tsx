import { AlertTriangle, ArrowRight, Ban, CheckCircle2, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecisionInfo, AIAction, ExecutionGate } from "./types";

interface DecisionOutputCardProps {
  recommendedAction: AIAction;
  executionGate: ExecutionGate;
  decision: DecisionInfo;
}

const actionColor: Record<string, string> = {
  PAUSE: "text-destructive border-destructive/30 bg-crimson-bg",
  REBALANCE: "text-primary border-primary/30 bg-primary/10",
  REDUCE_RISK: "text-warning border-warning/30 bg-warning-bg",
  HOLD: "text-success border-success/30 bg-emerald-bg",
  APPROVE_PROPOSAL: "text-success border-success/30 bg-emerald-bg",
  SIMULATION_ONLY: "text-copper border-copper/30 bg-copper/10",
};

const actionIcon: Record<string, typeof Ban> = {
  PAUSE: Ban,
  REBALANCE: ArrowRight,
  REDUCE_RISK: AlertTriangle,
  HOLD: CheckCircle2,
  APPROVE_PROPOSAL: CheckCircle2,
  SIMULATION_ONLY: ShieldOff,
};

const gateLabel: Record<string, string> = {
  allowed: "Execution Allowed",
  needs_human_approval: "Awaiting Human Approval",
  blocked_by_guardrail: "Blocked by Guardrail",
  simulation_only: "Simulation Only",
  paused: "Paused",
};

const gateColor: Record<string, string> = {
  allowed: "text-success border-success/30",
  needs_human_approval: "text-warning border-warning/30",
  blocked_by_guardrail: "text-destructive border-destructive/30",
  simulation_only: "text-copper border-copper/30",
  paused: "text-destructive border-destructive/30",
};

export function DecisionOutputCard({ recommendedAction, executionGate, decision }: DecisionOutputCardProps) {
  const Icon = actionIcon[recommendedAction] ?? CheckCircle2;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">Final AI Decision</p>

      <div className="mt-4 flex items-start gap-4">
        <div className={cn("flex items-center gap-3 rounded-lg border px-4 py-3", actionColor[recommendedAction] ?? "")}>
          <Icon className="h-5 w-5" />
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.12em]">{recommendedAction}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Recommended Action</p>
          </div>
        </div>

        <div className={cn("flex items-center gap-3 rounded-lg border px-4 py-3", gateColor[executionGate] ?? "")}>
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.12em]">{gateLabel[executionGate] ?? executionGate}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Execution Status</p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-md border border-border/70 bg-surface-2/70 p-3">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Why?</p>
          <p className="mt-1 text-sm leading-6 text-cream">{decision.reasoningSummary}</p>
        </div>

        {decision.constraints.length > 0 && (
          <div className="rounded-md border border-border/70 bg-surface-2/70 p-3">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Constraints</p>
            <ul className="mt-2 space-y-1">
              {decision.constraints.map((c) => (
                <li key={c} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-md border border-success/20 bg-emerald-bg p-3">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-success">Next Step</p>
          <p className="mt-1 text-sm leading-6 text-cream">{decision.nextStep}</p>
        </div>
      </div>
    </div>
  );
}
