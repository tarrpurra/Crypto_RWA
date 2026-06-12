import { cn } from "@/lib/utils";

export type ReasoningStepStatus =
  | "queued"
  | "running"
  | "complete"
  | "warning"
  | "blocked"
  | "failed";

export type ReasoningStep = {
  id: string;
  title: string;
  detail: string;
  status: ReasoningStepStatus;
  timestamp?: string;
  evidence?: string[];
};

type LiveReasoningTraceProps = {
  steps: ReasoningStep[];
  expanded?: boolean;
};

const statusLabel: Record<ReasoningStepStatus, string> = {
  queued: "Queued",
  running: "Running",
  complete: "Complete",
  warning: "Warning",
  blocked: "Blocked",
  failed: "Failed",
};

function markerClass(status: ReasoningStepStatus) {
  return cn(
    "mt-1 h-2.5 w-2.5 rounded-full bg-copper",
    status === "complete" && "bg-success shadow-[0_0_12px_rgba(47,230,161,0.45)]",
    status === "running" && "bg-primary shadow-[0_0_16px_rgba(255,200,87,0.6)]",
    status === "warning" && "bg-warning shadow-[0_0_14px_rgba(255,176,32,0.5)]",
    (status === "blocked" || status === "failed") && "bg-destructive shadow-[0_0_14px_rgba(255,90,87,0.5)]",
  );
}

function cardClass(status: ReasoningStepStatus) {
  return cn(
    "grid grid-cols-[14px_1fr] gap-3 border border-primary/15 bg-card/90 px-3 py-3",
    status === "running" && "border-primary/50",
    status === "warning" && "border-warning/35",
    (status === "blocked" || status === "failed") && "border-destructive/35",
  );
}

export function LiveReasoningTrace({ steps, expanded = true }: LiveReasoningTraceProps) {
  if (!expanded || steps.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-primary/20 bg-primary/[0.035] px-0 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-primary">
          Live AI Reasoning Trace
        </span>
        <span className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
          Explainable pipeline
        </span>
      </div>

      <div className="grid gap-2.5">
        {steps.map((step) => (
          <div key={step.id} className={cardClass(step.status)}>
            <div className={markerClass(step.status)} />
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-extrabold text-cream">{step.title}</p>
                <span className="shrink-0 text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
                  {statusLabel[step.status]}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
              {step.evidence?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {step.evidence.map((item) => (
                    <span key={item} className="rounded border border-border/70 bg-surface-2 px-2 py-0.5 font-mono text-[0.65rem] text-foreground">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
