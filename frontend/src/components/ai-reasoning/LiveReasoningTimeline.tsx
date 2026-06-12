import { CheckCircle2, Clock, Pause, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReasoningStage, ReasoningStepStatus } from "./types";

interface LiveReasoningTimelineProps {
  stages: ReasoningStage[];
}

const statusIcon: Record<ReasoningStepStatus, typeof CheckCircle2> = {
  idle: Clock,
  running: Loader2,
  complete: CheckCircle2,
  warning: AlertTriangle,
  blocked: Pause,
  failed: XCircle,
};

const statusLabel: Record<ReasoningStepStatus, string> = {
  idle: "Idle",
  running: "Running",
  complete: "Complete",
  warning: "Warning",
  blocked: "Blocked",
  failed: "Failed",
};

const markerBorderClass = (status: ReasoningStepStatus) => cn(
  "border-2",
  status === "running" && "border-primary",
  status === "complete" && "border-success",
  status === "warning" && "border-warning",
  (status === "blocked" || status === "failed") && "border-destructive",
  status === "idle" && "border-border",
);

const iconColorClass = (status: ReasoningStepStatus) => cn(
  status === "running" && "text-primary animate-spin",
  status === "complete" && "text-success",
  status === "warning" && "text-warning",
  (status === "blocked" || status === "failed") && "text-destructive",
  status === "idle" && "text-muted-foreground",
);

const connectorClass = (stage: ReasoningStage, nextStage: ReasoningStage | undefined) => {
  if (!nextStage) return "h-0";
  const active = stage.status === "complete" || stage.status === "running";
  const nextActive = nextStage.status === "complete" || nextStage.status === "running" || nextStage.status === "warning" || nextStage.status === "blocked";
  return cn(
    "ml-[1.125rem] h-4 w-px",
    active && nextActive ? "bg-primary/40" : "bg-border",
  );
};

const stepBgClass = (status: ReasoningStepStatus) => cn(
  "rounded-lg border px-4 py-3 transition-all duration-300",
  status === "idle" && "border-border/50 bg-card/50",
  status === "running" && "border-primary/40 bg-primary/[0.06]",
  status === "complete" && "border-border bg-card",
  status === "warning" && "border-warning/30 bg-warning-bg",
  (status === "blocked" || status === "failed") && "border-destructive/30 bg-crimson-bg",
);

export function LiveReasoningTimeline({ stages }: LiveReasoningTimelineProps) {
  if (stages.length === 0) return null;

  return (
    <div className="space-y-1">
      {stages.map((stage, i) => {
        const Icon = statusIcon[stage.status];
        const nextStage = stages[i + 1];

        return (
          <div key={stage.id}>
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className={cn("flex h-[1.35rem] w-[1.35rem] items-center justify-center rounded-full bg-card", markerBorderClass(stage.status))}>
                  <Icon className={cn("h-3 w-3", iconColorClass(stage.status))} />
                </div>
              </div>

              <div className={cn("min-w-0 flex-1", stepBgClass(stage.status))}>
                <div className="flex items-center justify-between gap-3">
                  <p className={cn(
                    "text-sm font-bold",
                    stage.status === "idle" && "text-muted-foreground",
                    stage.status === "running" && "text-primary",
                    stage.status === "complete" && "text-cream",
                    stage.status === "warning" && "text-warning",
                    (stage.status === "blocked" || stage.status === "failed") && "text-destructive",
                  )}>
                    {stage.title}
                  </p>
                  <span className="shrink-0 text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">
                    {statusLabel[stage.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{stage.description}</p>
                {stage.detail && (
                  <p className="mt-1 text-[0.65rem] leading-4 text-muted-foreground/70">{stage.detail}</p>
                )}
                {stage.evidenceTags && stage.evidenceTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {stage.evidenceTags.map((tag) => (
                      <span key={tag} className="rounded border border-border/70 bg-surface-2/80 px-2 py-0.5 font-mono text-[0.6rem] text-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {connectorClass(stage, nextStage).includes("h-4") && (
              <div className={connectorClass(stage, nextStage)} />
            )}
          </div>
        );
      })}
    </div>
  );
}
