import { useState } from "react"
import { CheckCircle2, Circle, Cpu, Database, ShieldCheck, GitMerge, ArrowRight, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react"
import { useDecisions } from "@/hooks/useDecisions"
import { useCurrentRisk } from "@/hooks/useRisk"
import { useAllocationRecommendation } from "@/hooks/useAllocation"
import { cn } from "@/lib/utils"

const layers = [
  { key: "ingestion", name: "Data Ingestion", desc: "Oracle & price feeds", icon: Database },
  { key: "brain", name: "AI Brain", desc: "Strategy reasoning", icon: Cpu },
  { key: "risk", name: "Risk Engine", desc: "Basel III scoring", icon: ShieldCheck },
  { key: "allocation", name: "Allocation", desc: "Rebalance planning", icon: GitMerge },
  { key: "execution", name: "Execution", desc: "Proposal readiness", icon: ArrowRight },
]

export function AIGlassbox() {
  const [collapsed, setCollapsed] = useState(true)
  const decisionsQuery = useDecisions()
  const riskQuery = useCurrentRisk()
  const allocationQuery = useAllocationRecommendation()

  const decisions = decisionsQuery.data
  const risk = riskQuery.data
  const allocation = allocationQuery.data

  const isLoading = decisionsQuery.isLoading || riskQuery.isLoading
  
  const riskBand = risk?.risk_band ?? "UNKNOWN"
  const riskBandColor =
    riskBand === "NORMAL" ? "text-success" :
    riskBand === "CAUTION" ? "text-warning" :
    riskBand === "RISK_VETO" ? "text-destructive" : "text-muted-foreground"

  const activeLayers: Record<string, boolean> = {
    ingestion: decisions?.data_sources_used?.length ? true : false,
    brain: decisions?.confidence ? true : false,
    risk: risk?.risk_score ? true : false,
    allocation: allocation?.status === "ok",
    execution: decisions?.status === "ok",
  }

  const constraints = decisions?.constraints_applied ?? []

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex h-full min-w-[2.25rem] flex-col items-center justify-center gap-2 border border-border bg-card p-1.5 transition-colors hover:bg-surface-2"
        title="Show AI reasoning"
      >
        <Cpu className="h-3.5 w-3.5 text-primary" />
        <span className="text-[0.45rem] font-semibold uppercase tracking-widest text-muted-foreground" style={{ writingMode: "vertical-rl" }}>
          REASONING
        </span>
        <ChevronLeft className="h-3 w-3 text-muted-foreground" />
      </button>
    )
  }

  return (
    <div className="flex flex-col border border-border bg-card p-4 sm:p-5 max-w-sm">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="terminal-label text-primary">AI Glassbox</p>
          <h3 className="mt-0.5 text-sm font-semibold text-foreground">Reasoning pipeline</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded border px-2 py-0.5 font-mono text-[0.65rem] uppercase", risk?.hard_veto_status === "active" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-success/30 bg-success/10 text-success")}>
            {risk?.hard_veto_status === "active" ? "Vetoed" : "Advisory"}
          </span>
          <button
            onClick={() => setCollapsed(true)}
            className="flex h-6 w-6 items-center justify-center rounded border border-border transition-colors hover:bg-surface-2"
            title="Collapse"
          >
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="h-5 w-5 animate-pulse rounded-full border border-primary/30 bg-primary/10" />
          <span className="ml-2 text-xs text-muted-foreground">Loading reasoning state...</span>
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {layers.map((layer, idx) => {
              const active = activeLayers[layer.key]
              const Icon = layer.icon
              return (
                <div key={layer.key} className="flex items-center gap-3">
                  <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", active ? "border-primary/30 bg-primary/10" : "border-border bg-surface-2")}>
                    <Icon className={cn("h-3.5 w-3.5", active ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{layer.name}</span>
                      {idx < layers.length - 1 && active && activeLayers[layers[idx + 1].key] && (
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-[0.65rem] text-muted-foreground truncate">{layer.desc}</p>
                  </div>
                  {active ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                  )}
                </div>
              )
            })}
          </div>

          {decisions?.reasoning_summary && (
            <div className="mt-4 rounded-md border border-border/60 bg-surface-2 p-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-3.5 w-3.5 text-primary" />
                <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">Reasoning</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-foreground">{decisions.reasoning_summary}</p>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border/60 bg-surface-2 p-2.5">
              <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Risk Score</p>
              <p className={cn("mt-0.5 font-mono text-sm font-semibold", riskBandColor)}>
                {risk?.risk_score ?? "-"}
                <span className="ml-1.5 text-[0.6rem] font-normal text-muted-foreground">{riskBand}</span>
              </p>
            </div>
            <div className="rounded-md border border-border/60 bg-surface-2 p-2.5">
              <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Confidence</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-foreground">
                {decisions?.confidence != null ? `${(decisions.confidence * 100).toFixed(1)}%` : "-"}
              </p>
            </div>
          </div>

          {constraints.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Active Constraints</p>
              {constraints.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
                  <span>{c}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
