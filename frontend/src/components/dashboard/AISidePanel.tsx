import { useState } from "react"
import { Cpu, ShieldCheck, GitMerge, ArrowRight, AlertTriangle, CheckCircle2, ChevronLeft, Database, Circle, ChevronRight } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useDecisions } from "@/hooks/useDecisions"
import { useCurrentRisk } from "@/hooks/useRisk"
import { useAllocationRecommendation } from "@/hooks/useAllocation"
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet"
import { useSettings, useUpdateSettings } from "@/hooks/useSystem"
import { cn } from "@/lib/utils"

const actionConfig: Record<string, { label: string; icon: typeof Cpu; color: string }> = {
  REBALANCE: { label: "Rebalance", icon: GitMerge, color: "text-primary" },
  HEDGE: { label: "Hedge", icon: ShieldCheck, color: "text-warning" },
  PAUSE: { label: "Pause", icon: AlertTriangle, color: "text-destructive" },
  MONITOR: { label: "Monitor", icon: Cpu, color: "text-up" },
}

const pipelineLayers = [
  { key: "ingestion", name: "Data Ingestion", desc: "Oracle & price feeds", icon: Database },
  { key: "brain", name: "AI Brain", desc: "Strategy reasoning", icon: Cpu },
  { key: "risk", name: "Risk Engine", desc: "Basel III scoring", icon: ShieldCheck },
  { key: "allocation", name: "Allocation", desc: "Rebalance planning", icon: GitMerge },
  { key: "execution", name: "Execution", desc: "Proposal readiness", icon: ArrowRight },
]

export function AISidePanel() {
  const [collapsed, setCollapsed] = useState(true)
  const { effectiveWalletAddress, walletAddress } = usePortfolioWallet()

  const decisionsQuery = useDecisions()
  const riskQuery = useCurrentRisk()
  const allocationQuery = useAllocationRecommendation()
  const settingsQuery = useSettings()
  const updateSettings = useUpdateSettings()

  const decisions = decisionsQuery.data
  const risk = riskQuery.data
  const allocation = allocationQuery.data
  const settings = settingsQuery.data

  const hasWalletScope = Boolean(effectiveWalletAddress)
  const isLoading = hasWalletScope && (decisionsQuery.isLoading || riskQuery.isLoading)
  const aiDecisionMakerOn = settings?.ai_decision_maker_enabled ?? false

  const riskBand = risk?.risk_band ?? "UNKNOWN"
  const riskBandColor =
    riskBand === "NORMAL" ? "text-success" :
    riskBand === "CAUTION" ? "text-warning" :
    riskBand === "RISK_VETO" ? "text-destructive" : "text-muted-foreground"

  const action = decisions?.recommended_action ?? "MONITOR"
  const config = actionConfig[action] ?? actionConfig.MONITOR
  const Icon = config.icon

  const activeLayers: Record<string, boolean> = {
    ingestion: decisions?.data_sources_used?.length ? true : false,
    brain: decisions?.confidence ? true : false,
    risk: risk?.risk_score ? true : false,
    allocation: allocation?.status === "ok",
    execution: decisions?.status === "ok",
  }

  const constraints = decisions?.constraints_applied ?? []
  const aiDebug = decisions?.ai_debug

  function prettyDebugValue(value: unknown): string {
    if (value == null) {
      return "No data."
    }
    if (typeof value === "string") {
      return value
    }
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

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

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed right-0 top-11 z-20 flex min-w-[2.25rem] flex-col items-center justify-center gap-2 border border-border bg-card p-1.5 transition-colors hover:bg-surface-2 panel-inverted"
        style={{ height: "calc(100vh - 2.75rem)" }}
        title="Show AI panel"
      >
        <div className="relative">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <span className={cn("absolute -right-0.5 -top-0.5 h-1.5 w-1.5", aiDecisionMakerOn ? "bg-success" : "bg-muted-foreground")} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground" style={{ writingMode: "vertical-rl" }}>
          AI PANEL
        </span>
        <ChevronLeft className="h-3 w-3 text-muted-foreground" />
      </button>
    )
  }

  return (
    <div
      className="fixed right-0 top-11 z-20 flex w-80 flex-col border-l border-border bg-card panel-inverted"
      style={{ height: "calc(100vh - 2.75rem)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Cpu className="h-4 w-4 text-primary" />
            <span className={cn("absolute -right-0.5 -top-0.5 h-1.5 w-1.5", aiDecisionMakerOn ? "bg-success" : "bg-muted-foreground")} />
          </div>
          <span className="text-xs font-semibold text-foreground">AI Panel</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={aiDecisionMakerOn}
            disabled={updateSettings.isPending}
            onCheckedChange={(checked) => updateSettings.mutate({ ai_decision_maker_enabled: checked })}
          />
          <button
            onClick={() => setCollapsed(true)}
            className="flex h-6 w-6 items-center justify-center border-2 border-border transition-colors hover:bg-surface-2"
            title="Collapse"
          >
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Decision Feed */}
        <div>
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">Recommendation</p>

          {!hasWalletScope ? (
            <div className="border border-border/60 bg-surface-2 px-3 py-4">
              <p className="text-xs font-medium text-foreground">Connect or paste a wallet to load AI recommendations.</p>
              <p className="mt-1 text-[0.7rem] leading-4 text-muted-foreground">
                Portfolio, risk, allocation, and AI decision queries stay disabled until a Mantle Sepolia wallet is connected or pasted.
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="h-4 w-4 animate-pulse rounded-full border border-primary/30 bg-primary/10" />
              <span className="ml-2 text-xs text-muted-foreground">Loading...</span>
            </div>
          ) : (
            <>
              <div className={cn("flex items-center gap-2 border px-3 py-2", action === "PAUSE" ? "border-destructive/30 bg-destructive/10" : "border-primary/20 bg-primary/10")}>
                <Icon className={cn("h-4 w-4 shrink-0", config.color)} />
                <div className="min-w-0">
                  <p className={cn("text-xs font-semibold", config.color)}>{config.label}</p>
                  {decisions?.reasoning_summary && (
                    <p className="mt-0.5 text-[0.7rem] leading-3 text-muted-foreground line-clamp-2">{decisions.reasoning_summary}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border border-border/60 bg-surface-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">AI Mode</p>
                  <p className="mt-0.5 text-xs text-foreground">
                    {aiDecisionMakerOn ? "Full access AI" : "Recommendation only"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[0.7rem] text-muted-foreground">Recommendation only</span>
                  <Switch
                    checked={aiDecisionMakerOn}
                    disabled={updateSettings.isPending}
                    onCheckedChange={(checked) => updateSettings.mutate({ ai_decision_maker_enabled: checked })}
                  />
                  <span className="text-[0.7rem] text-muted-foreground">Full access AI</span>
                </div>
              </div>

              <div className="mt-2 space-y-1">
                {decisionItems.map((item) => (
                  <div key={item.key} className="flex items-center justify-between border border-border/60 bg-surface-2 px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <item.icon className="h-3 w-3 shrink-0 text-primary" />
                      <span className="text-[0.7rem] text-muted-foreground">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn("font-mono text-xs font-medium", item.status === "ok" ? "text-success" : item.status === "warn" ? "text-warning" : "text-foreground")}>
                        {item.value}
                      </span>
                      {item.detail && (
                        <span className="text-xs text-muted-foreground">{item.detail}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border/60" />

        {/* Reasoning pipeline */}
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Reasoning Pipeline</p>

          <div className="space-y-1.5">
            {pipelineLayers.map((layer, idx) => {
              const active = activeLayers[layer.key]
              const LayerIcon = layer.icon
              return (
                <div key={layer.key} className="flex items-center gap-2">
                  <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded border", active ? "border-primary/30 bg-primary/10" : "border-border bg-surface-2")}>
                    <LayerIcon className={cn("h-3 w-3", active ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground">{layer.name}</span>
                      {idx < pipelineLayers.length - 1 && active && activeLayers[pipelineLayers[idx + 1].key] && (
                        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  {active ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
                  ) : (
                    <Circle className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                  )}
                </div>
              )
            })}
          </div>

          {/* AI debug */}
          {aiDebug && (
            <div className="mt-2 rounded border border-border/60 bg-surface-2 p-2">
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3 w-3 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Debug</span>
              </div>
              <div className="mt-2 space-y-2">
                <div>
                  <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Mode</p>
                  <p className="mt-1 text-xs text-foreground">
                    {aiDebug.mode}
                    {aiDebug.used_fallback ? " (fallback)" : ""}
                    {aiDebug.ai_overrode_deterministic ? " | AI override active" : ""}
                  </p>
                </div>
                {aiDebug.fallback_reason && (
                  <div>
                    <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Fallback Reason</p>
                    <p className="mt-1 text-xs leading-4 text-foreground">{aiDebug.fallback_reason}</p>
                  </div>
                )}
                <div>
                  <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Prompt</p>
                  <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-words border border-border/60 bg-card p-2 font-mono text-[0.68rem] leading-4 text-foreground">
                    {prettyDebugValue(aiDebug.prompt)}
                  </pre>
                </div>
                <div>
                  <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Raw Output</p>
                  <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-words border border-border/60 bg-card p-2 font-mono text-[0.68rem] leading-4 text-foreground">
                    {prettyDebugValue(aiDebug.raw_response)}
                  </pre>
                </div>
                <div>
                  <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Parsed Output</p>
                  <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-words border border-border/60 bg-card p-2 font-mono text-[0.68rem] leading-4 text-foreground">
                    {prettyDebugValue(aiDebug.parsed_response)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Risk + confidence */}
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <div className="rounded border border-border/60 bg-surface-2 p-2">
              <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Risk</p>
              <p className={cn("mt-0.5 font-mono text-xs font-semibold", riskBandColor)}>
                {risk?.risk_score ?? "-"}
                <span className="ml-1 text-[0.7rem] font-normal text-muted-foreground">{riskBand}</span>
              </p>
            </div>
            <div className="rounded border border-border/60 bg-surface-2 p-2">
              <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Confidence</p>
              <p className="mt-0.5 font-mono text-xs font-semibold text-foreground">
                {decisions?.confidence != null ? `${(decisions.confidence * 100).toFixed(1)}%` : "-"}
              </p>
            </div>
          </div>

          {allocation?.decision?.target_weights && (
            <div className="mt-2 rounded border border-border/60 bg-surface-2 p-2">
              <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">AI Allocation</p>
              <div className="mt-1 space-y-1">
                {Object.entries(allocation.decision.target_weights).map(([symbol, weight]) => {
                  const matched = allocation.rebalance_actions.find((actionItem) => actionItem.asset_symbol === symbol)
                  return (
                    <div key={symbol} className="flex items-center justify-between text-[0.7rem]">
                      <span className="text-muted-foreground">{symbol}</span>
                      <span className="font-mono text-foreground">
                        {(weight * 100).toFixed(1)}%{matched ? ` · ${matched.action}` : ""}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Constraints */}
          {constraints.length > 0 && (
            <div className="mt-2 space-y-0.5">
              <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Constraints</p>
              {constraints.map((c, i) => (
                <div key={i} className="flex items-center gap-1 text-[0.7rem] text-muted-foreground">
                  <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-warning" />
                  <span>{c}</span>
                </div>
              ))}
            </div>
          )}

          {!decisions && !risk && !allocation && (
            <p className="py-4 text-center text-[0.7rem] text-muted-foreground">No data available yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
