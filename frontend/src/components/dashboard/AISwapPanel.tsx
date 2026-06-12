import { useMemo, useState } from "react";
import { Bot, ChevronDown, ChevronUp, Cpu, FileSearch, ShieldCheck, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { LiveReasoningTrace, type ReasoningStep } from "@/components/ai/LiveReasoningTrace";
import { ReasoningStreamPanel } from "@/components/ai/ReasoningStreamPanel";
import type { AllocationDecisionResponse, RiskAssessmentResponse, RecommendationResponse } from "@/lib/api/types";

interface SwapRecommendation {
  action: string;
  amount: number;
  asset_symbol: string;
  token_in_symbol?: string;
  token_out_symbol?: string;
  swap_pair_label?: string;
}

interface AISwapPanelProps {
  allocation: AllocationDecisionResponse | undefined;
  risk: RiskAssessmentResponse | undefined;
  decisions: RecommendationResponse | undefined;
  isLoading: boolean;
  hasConnectedWallet: boolean;
  aiDecisionMakerEnabled: boolean;
  onAiAccessChange: (enabled: boolean) => void;
  isAiAccessPending: boolean;
  swapRecommendations: SwapRecommendation[];
}

function normalizeSummaryText(reasoning: string | undefined, profileName: string | undefined) {
  if (!reasoning) {
    return "Rebalance recommended based on current allocation drift.";
  }

  const prefixPattern = /^Proposed rebalance actions for .*? profile:\s*/i;
  const cleaned = reasoning.replace(prefixPattern, "").trim();
  const normalized = cleaned.replace(/\s*,\s*/g, "; ").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return profileName
      ? `${profileName} profile rebalance is recommended.`
      : "Rebalance is recommended.";
  }

  return profileName
    ? `${profileName} rebalance: ${normalized}`
    : normalized;
}

export function AISwapPanel({
  allocation,
  risk,
  decisions,
  isLoading,
  hasConnectedWallet,
  aiDecisionMakerEnabled,
  onAiAccessChange,
  isAiAccessPending,
  swapRecommendations,
}: AISwapPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const decision = allocation?.decision;
  const confidence = decision?.confidence ?? risk?.confidence ?? decisions?.confidence ?? 0;
  const action = decision?.recommended_action ?? risk?.recommended_action ?? decisions?.recommended_action ?? "MONITOR";
  const primarySwapRecommendation = swapRecommendations[0] ?? null;
  const primarySwapPairLabel = primarySwapRecommendation
    ? primarySwapRecommendation.swap_pair_label
      ?? (primarySwapRecommendation.token_in_symbol && primarySwapRecommendation.token_out_symbol
        ? `${primarySwapRecommendation.token_in_symbol} -> ${primarySwapRecommendation.token_out_symbol}`
        : primarySwapRecommendation.asset_symbol)
    : null;
  const hasMultipleSwapLegs = swapRecommendations.length > 1;
  const summaryText = normalizeSummaryText(decision?.reasoning, decision?.profile_name);
  const retrievalItems = useMemo(() => {
    const items = [
      ...(decisions?.data_sources_used ?? []),
      ...(decisions?.constraints_applied ?? []),
      decision?.profile_name ? `profile:${decision.profile_name}` : null,
      primarySwapRecommendation?.token_in_symbol ? `token_in:${primarySwapRecommendation.token_in_symbol}` : null,
      primarySwapRecommendation?.token_out_symbol ? `token_out:${primarySwapRecommendation.token_out_symbol}` : null,
      risk?.risk_band ? `risk:${risk.risk_band}` : null,
    ].filter((value): value is string => Boolean(value));
    return Array.from(new Set(items));
  }, [
    decision?.profile_name,
    decisions?.constraints_applied,
    decisions?.data_sources_used,
    primarySwapRecommendation?.token_in_symbol,
    primarySwapRecommendation?.token_out_symbol,
    risk?.risk_band,
  ]);
  const reasoningNotes = useMemo(
    () => Array.from(new Set([...(decisions?.notes ?? []), ...(risk?.notes ?? [])])),
    [decisions?.notes, risk?.notes],
  );
  const parsedResponse = decisions?.ai_debug?.parsed_response ?? null;
  const reasoningSteps = useMemo<ReasoningStep[]>(() => {
    const sources = decisions?.data_sources_used ?? [];
    const hasSwap = swapRecommendations.length > 0;
    const proposalStatus: ReasoningStep["status"] =
      action === "PAUSE"
        ? "blocked"
        : hasSwap
          ? "running"
          : "warning";
    const approvalStatus: ReasoningStep["status"] =
      risk?.hard_veto_status === "active"
        ? "blocked"
        : aiDecisionMakerEnabled
          ? "running"
          : "queued";

    return [
      {
        id: "portfolio",
        title: "Portfolio scan",
        detail: hasConnectedWallet
          ? "Loaded wallet-scoped balances and current portfolio context for the active account."
          : "Waiting for a connected wallet before scanning balances and holdings.",
        status: hasConnectedWallet ? "complete" : "queued",
        evidence: [
          allocation?.decision?.profile_name ? `profile:${allocation.decision.profile_name}` : null,
          primarySwapRecommendation?.token_in_symbol ? `asset:${primarySwapRecommendation.token_in_symbol}` : null,
        ].filter((value): value is string => Boolean(value)),
      },
      {
        id: "market",
        title: "Market check",
        detail: sources.length > 0
          ? "Verified current pricing and route context from the latest available market data sources."
          : "Market data inputs are still loading or unavailable for this recommendation.",
        status: sources.length > 0 ? "complete" : "warning",
        evidence: sources.slice(0, 4),
      },
      {
        id: "allocation",
        title: "Allocation drift",
        detail: decision?.reasoning
          ? decision.reasoning
          : "The allocation engine is comparing the current sleeves against the selected target profile.",
        status: allocation?.status === "ok" || action === "REBALANCE" ? "complete" : allocation ? "warning" : "queued",
        evidence: [
          action ? `action:${action}` : null,
          hasMultipleSwapLegs ? `legs:${swapRecommendations.length}` : null,
        ].filter((value): value is string => Boolean(value)),
      },
      {
        id: "risk",
        title: "Risk guard",
        detail: risk?.reasoning_summary
          ? risk.reasoning_summary
          : "Risk checks are still running before the proposal can move forward.",
        status:
          risk?.hard_veto_status === "active"
            ? "blocked"
            : risk?.risk_band === "RISK_CAUTION" || risk?.risk_band === "RISK_REBALANCE_ONLY"
              ? "warning"
              : risk
                ? "complete"
                : "queued",
        evidence: [
          risk?.risk_band ? `band:${risk.risk_band}` : null,
          risk?.risk_score != null ? `score:${risk.risk_score.toFixed(2)}` : null,
        ].filter((value): value is string => Boolean(value)),
      },
      {
        id: "proposal",
        title: "Proposal",
        detail: hasSwap && primarySwapRecommendation
          ? `Prepared ${primarySwapPairLabel ?? primarySwapRecommendation.asset_symbol} ${primarySwapRecommendation.action.toLowerCase()} recommendation for review.`
          : action === "PAUSE"
            ? "Proposal generation stopped because the current risk or portfolio state does not allow a trade."
            : "No executable swap leg has been generated yet.",
        status: proposalStatus,
        evidence: primarySwapRecommendation
          ? [primarySwapPairLabel ?? primarySwapRecommendation.asset_symbol, `amount:${primarySwapRecommendation.amount.toFixed(4)}`]
          : undefined,
      },
      {
        id: "approval",
        title: "Approval",
        detail:
          risk?.hard_veto_status === "active"
            ? "Execution remains blocked until the hard veto clears."
            : aiDecisionMakerEnabled
              ? "The system is allowed to continue through approval and execution once guard checks are satisfied."
              : "Waiting for user review before any approval or execution can happen.",
        status: approvalStatus,
        evidence: [
          risk?.required_human_approval_status ? `human:${risk.required_human_approval_status}` : null,
          aiDecisionMakerEnabled ? "mode:full-access" : "mode:review-only",
        ].filter((value): value is string => Boolean(value)),
      },
    ];
  }, [
    action,
    aiDecisionMakerEnabled,
    allocation,
    decision?.reasoning,
    hasConnectedWallet,
    hasMultipleSwapLegs,
    primarySwapPairLabel,
    primarySwapRecommendation,
    risk,
    swapRecommendations.length,
    decisions?.data_sources_used,
  ]);
  const pipelineStats = useMemo(() => {
    const completed = reasoningSteps.filter((step) => step.status === "complete").length;
    const warnings = reasoningSteps.filter((step) => step.status === "warning").length;
    const blocked = reasoningSteps.filter((step) => step.status === "blocked" || step.status === "failed").length;
    return { completed, warnings, blocked, total: reasoningSteps.length };
  }, [reasoningSteps]);

  if (isLoading) {
    return (
      <section className="ai-reasoning-panel rounded-xl p-5">
        <div className="flex items-center gap-3 text-primary">
          <Cpu className="h-4 w-4 animate-pulse" />
          <span className="text-xs uppercase tracking-[0.18em]">AI Reasoning</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Analyzing portfolio...</p>
      </section>
    );
  }

  return (
    <section className="ai-reasoning-panel rounded-xl">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-primary/[0.03]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Cpu className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-primary">AI Reasoning Summary</p>
            <p className="mt-0.5 text-sm font-medium text-cream">
              {action === "REBALANCE"
                ? summaryText
                : action === "PAUSE"
                  ? "Risk constraints require pausing new allocations."
                  : "Portfolio is within acceptable parameters."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
                <FileSearch className="h-3 w-3" />
                {retrievalItems.length} retrieved
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
                <ShieldCheck className="h-3 w-3" />
                {pipelineStats.warnings > 0 ? `${pipelineStats.warnings} warnings` : "guards clear"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
                <Bot className="h-3 w-3" />
                {decisions?.ai_debug?.mode ?? "derived trace"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasConnectedWallet && (
            <div className="flex items-center gap-2 pr-3">
              <span className="whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-muted-foreground">AI access</span>
              <Switch
                checked={aiDecisionMakerEnabled ?? false}
                disabled={isAiAccessPending}
                onCheckedChange={(v) => {
                  if (v && !aiDecisionMakerEnabled) {
                    setShowWarning(true);
                  } else {
                    onAiAccessChange?.(false);
                  }
                }}
                className="scale-75"
              />
            </div>
          )}
          <span className="rounded-full border border-success/30 px-3 py-1 text-xs text-success">
            {Math.round(confidence * 100)}%
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {showWarning && (
        <div className="border-t border-primary/20 px-5 pb-5 pt-4">
          <div className="rounded-lg border border-destructive/30 bg-crimson-bg p-4">
            <p className="text-sm font-medium text-destructive">Warning: Full AI Access</p>
            <p className="mt-2 text-sm leading-6 text-cream">
              AI will get full access to execute trades and manage your portfolio automatically.
              AI can make mistakes. Review all actions carefully and monitor performance regularly.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => {
                  onAiAccessChange(true);
                  setShowWarning(false);
                }}
                className="rounded-md bg-destructive/20 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/30"
              >
                Accept & Enable
              </button>
              <button
                onClick={() => setShowWarning(false)}
                className="rounded-md border border-primary/20 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/[0.04]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {expanded && (
        <div className="border-t border-primary/20 px-5 pb-5 pt-4">
          <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent p-4">
              <div className="flex items-center justify-between gap-3">
              <div>
                  <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.16em] text-primary">
                    Full Reasoning Flow
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Live retrieval context, guardrails, notes, and parsed decision output.
                  </p>
                </div>
                <div className="rounded-full border border-primary/20 bg-primary/[0.08] px-3 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-primary">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    {pipelineStats.completed}/{pipelineStats.total} complete
                  </span>
                </div>
              </div>
              <ReasoningStreamPanel
                retrievalItems={retrievalItems}
                constraints={decisions?.constraints_applied ?? []}
                notes={reasoningNotes}
                parsedResponse={parsedResponse}
              />
            </section>

            <section className="rounded-lg border border-border bg-surface-2/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.16em] text-primary">
                    Explainable Pipeline
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Deterministic stages the system passed before issuing the latest recommendation.
                  </p>
                </div>
                <span className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
                  {pipelineStats.blocked > 0 ? `${pipelineStats.blocked} blocked` : `${pipelineStats.warnings} warning`}
                </span>
              </div>
              <LiveReasoningTrace steps={reasoningSteps} expanded />
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
