import { AlertTriangle, Ban, Info, ShieldOff } from "lucide-react";
import type { GuardrailInfo } from "./types";

interface GuardrailBannerProps {
  guardrails: GuardrailInfo[];
}

const severityIcon = {
  info: Info,
  warning: AlertTriangle,
  hard_block: Ban,
};

const severityColor = {
  info: "border-border/70 bg-surface-2 text-muted-foreground",
  warning: "border-warning/30 bg-warning-bg text-warning",
  hard_block: "border-destructive/30 bg-crimson-bg text-destructive",
};

export function GuardrailBanner({ guardrails }: GuardrailBannerProps) {
  const active = guardrails.filter((g) => g.severity !== "info");
  if (active.length === 0) return null;

  return (
    <div className="space-y-2">
      {active.map((g) => {
        const Icon = severityIcon[g.severity];
        return (
          <div key={g.name} className={`flex items-start gap-3 rounded-lg border p-3 ${severityColor[g.severity]}`}>
            <div className="mt-0.5 shrink-0">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em]">{g.name}</p>
                {g.blocksExecution && (
                  <span className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[0.55rem] uppercase tracking-[0.14em] text-destructive">
                    <ShieldOff className="h-2.5 w-2.5" />
                    Blocks Execution
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{g.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
