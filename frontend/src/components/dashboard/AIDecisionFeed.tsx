import { Cpu, ShieldCheck, GitMerge, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react"
import { useDecisions } from "@/hooks/useDecisions"
import { useCurrentRisk } from "@/hooks/useRisk"
import { useAllocationRecommendation } from "@/hooks/useAllocation"
import { cn } from "@/lib/utils"

const actionConfig: Record<string, { label: string; icon: typeof Cpu; color: string }> = {
  REBALANCE: { label: "Rebalance", icon: GitMerge, color: "text-primary" },
  HEDGE: { label: "Hedge", icon: ShieldCheck, color: "text-warning" },
  PAUSE: { label: "Pause", icon: AlertTriangle, color: "text-destructive" },
  MONITOR: { label: "Monitor", icon: Cpu, color: "text-up" },
}

export function AIDecisionFeed() {
  const decisionsQuery = useDecisions()
  const riskQuery = useCurrentRisk()
  const allocationQuery = useAllocationRecommendation()

  const decisions = decisionsQuery.data
  const risk = riskQuery.data
  const allocation = allocationQuery.data

  const isLoading = decisionsQuery.isLoading

  const action = decisions?.recommended_action ?? "MONITOR"
  const config = actionConfig[action] ?? actionConfig.MONITOR
  const Icon = config.icon

  const decisionItems: Array<{
    key: string
    icon: typeof Cpu
    label: string
    value: string
    detail: string
    status: "ok" | "warn" | "info"
  }> = []

  if (risk?.risk_score != null) {
    decisionItems.push({
      key: "risk-score",
      icon: ShieldCheck,
      label: "Risk Score",
      value: `${risk.risk_score}`,
      detail: risk.risk_band ?? "N/A",
      status: risk.risk_band === "NORMAL" ? "ok" : risk.risk_band === "CAUTION" ? "warn" : "info",
    })
  }

  if (decisions?.confidence != null) {
    decisionItems.push({
      key: "confidence",
      icon: Cpu,
      label: "Confidence",
      value: `${(decisions.confidence * 100).toFixed(1)}%`,
      detail: decisions.data_sources_used?.length ? `${decisions.data_sources_used.length} sources` : "",
      status: decisions.confidence > 0.8 ? "ok" : decisions.confidence > 0.5 ? "warn" : "info",
    })
  }

  if (allocation?.decision?.recommended_action && allocation.decision.recommended_action !== action) {
    decisionItems.push({
      key: "allocation",
      icon: GitMerge,
      label: "Allocation",
      value: allocation.decision.recommended_action,
      detail: allocation.decision.profile_name ?? "",
      status: "info",
    })
  }

  if (decisions?.recommended_action) {
    decisionItems.push({
      key: "next-action",
      icon: ArrowRight,
      label: "Next Action",
      value: decisions.recommended_action,
      detail: decisions.asset ? `Asset: ${decisions.asset}` : "",
      status: "info",
    })
  }

  return (
    <div className="flex h-full flex-col border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="terminal-label text-primary">AI Decision</p>
          <h3 className="mt-0.5 text-sm font-semibold text-foreground">Latest recommendation</h3>
        </div>
        <span className="rounded border border-primary/20 bg-primary/8 px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase text-primary">
          Live
        </span>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="h-5 w-5 animate-pulse rounded-full border border-primary/30 bg-primary/10" />
          <span className="ml-2 text-xs text-muted-foreground">Loading decision state...</span>
        </div>
      ) : (
        <>
          {/* Current action banner */}
          <div className={cn("mt-4 flex items-center gap-3 rounded-md border px-3 py-2.5", action === "PAUSE" ? "border-destructive/30 bg-destructive/10" : "border-primary/20 bg-primary/8")}>
            <Icon className={cn("h-5 w-5", config.color)} />
            <div className="min-w-0">
              <p className={cn("text-sm font-semibold", config.color)}>{config.label}</p>
              {decisions?.reasoning_summary && (
                <p className="mt-0.5 text-xs leading-4 text-muted-foreground line-clamp-2">{decisions.reasoning_summary}</p>
              )}
            </div>
          </div>

          {/* Decision metrics */}
          <div className="mt-3 space-y-1.5">
            {decisionItems.map((item) => (
              <div key={item.key} className="flex items-center justify-between rounded-md border border-border/60 bg-surface-2 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <item.icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="text-[0.65rem] text-muted-foreground">{item.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("font-mono text-xs font-medium", item.status === "ok" ? "text-success" : item.status === "warn" ? "text-warning" : "text-foreground")}>
                    {item.value}
                  </span>
                  {item.detail && (
                    <span className="text-[0.6rem] text-muted-foreground">{item.detail}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Data quality summary */}
          {decisions?.status && (
            <div className="mt-auto pt-3 border-t border-border/60">
              <div className="flex items-center gap-2">
                {decisions.status === "ok" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                )}
                <span className="text-[0.65rem] text-muted-foreground">{decisions.status_reason}</span>
              </div>
            </div>
          )}

          {!decisions && !risk && !allocation && (
            <div className="flex flex-1 items-center justify-center py-8">
              <p className="text-xs text-muted-foreground">No decision data available yet.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
