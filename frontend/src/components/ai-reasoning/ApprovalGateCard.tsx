import { CheckCircle2, Clock, Pause, UserCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecutionGate } from "./types";

interface ApprovalGateCardProps {
  executionGate: ExecutionGate;
  hasProposal: boolean;
  aiDecisionMakerEnabled: boolean;
  hardVetoActive: boolean;
}

const gateStatus: Record<string, { label: string; icon: typeof CheckCircle2; color: string; detail: string }> = {
  allowed: {
    label: "Fully Allowed",
    icon: CheckCircle2,
    color: "text-success border-success/30 bg-emerald-bg",
    detail: "AI can proceed without human intervention.",
  },
  needs_human_approval: {
    label: "Needs Human Approval",
    icon: UserCheck,
    color: "text-warning border-warning/30 bg-warning-bg",
    detail: "Execution requires explicit human sign-off before proceeding.",
  },
  blocked_by_guardrail: {
    label: "Blocked by Guardrail",
    icon: Pause,
    color: "text-destructive border-destructive/30 bg-crimson-bg",
    detail: "A hard guardrail is preventing execution. Resolve the guard condition first.",
  },
  simulation_only: {
    label: "Simulation Only",
    icon: Clock,
    color: "text-copper border-copper/30 bg-copper/10",
    detail: "System is in simulation mode. No real execution will occur.",
  },
  paused: {
    label: "Paused",
    icon: XCircle,
    color: "text-destructive border-destructive/30 bg-crimson-bg",
    detail: "AI execution is paused. Resume to continue.",
  },
};

export function ApprovalGateCard({ executionGate, hasProposal, aiDecisionMakerEnabled, hardVetoActive }: ApprovalGateCardProps) {
  const gs = gateStatus[executionGate] ?? gateStatus.paused;
  const Icon = gs.icon;

  return (
    <div className={cn("rounded-lg border p-4", gs.color)}>
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.12em]">{gs.label}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{gs.detail}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded border border-border/60 bg-background/50 px-3 py-2">
          <p className="text-[0.55rem] uppercase tracking-[0.14em] text-muted-foreground">Proposal</p>
          <p className={`mt-1 text-xs font-semibold ${hasProposal ? "text-success" : "text-muted-foreground"}`}>
            {hasProposal ? "Created" : "None"}
          </p>
        </div>
        <div className="rounded border border-border/60 bg-background/50 px-3 py-2">
          <p className="text-[0.55rem] uppercase tracking-[0.14em] text-muted-foreground">Trade Allowed</p>
          <p className={`mt-1 text-xs font-semibold ${executionGate === "allowed" ? "text-success" : "text-destructive"}`}>
            {executionGate === "allowed" ? "Yes" : "No"}
          </p>
        </div>
        <div className="rounded border border-border/60 bg-background/50 px-3 py-2">
          <p className="text-[0.55rem] uppercase tracking-[0.14em] text-muted-foreground">AI Mode</p>
          <p className={`mt-1 text-xs font-semibold ${aiDecisionMakerEnabled ? "text-primary" : "text-muted-foreground"}`}>
            {aiDecisionMakerEnabled ? "Full Access" : "Review Only"}
          </p>
        </div>
      </div>

      {hardVetoActive && (
        <div className="mt-3 flex items-center gap-2 rounded border border-destructive/20 bg-background/40 px-3 py-2">
          <Pause className="h-3.5 w-3.5 shrink-0 text-destructive" />
          <p className="text-[0.65rem] leading-4 text-destructive">
            Hard veto is active. Human override required for emergency action.
          </p>
        </div>
      )}
    </div>
  );
}
