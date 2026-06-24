import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Cpu,
  PauseCircle,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import type {
  AIAction,
  AIReasoningPanelProps,
  ExecutionGate,
} from "./types";

type TimelineStatus = "complete" | "warning" | "blocked" | "paused";
type EvidenceStatus = "good" | "warning" | "bad";

type TimelineStep = {
  title: string;
  status: TimelineStatus;
  detail: string;
};

type EvidenceItem = {
  label: string;
  value: string;
  limit?: string;
  status: EvidenceStatus;
};

function reasoningStepStatusToTimelineStatus(status: string): TimelineStatus {
  if (status === "complete") {
    return "complete";
  }
  if (status === "paused") {
    return "paused";
  }
  if (status === "blocked" || status === "failed") {
    return "blocked";
  }
  return "warning";
}

function guardrailSeverityToEvidenceStatus(severity: string): EvidenceStatus {
  if (severity === "hard_block") {
    return "bad";
  }
  if (severity === "warning") {
    return "warning";
  }
  return "good";
}

function normalizeSentence(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function updatedAgo(timestamp: string | undefined) {
  if (!timestamp) {
    return "Live";
  }
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000),
  );
  if (seconds < 60) {
    return `Live • ${seconds}s`;
  }
  return `Live • ${Math.round(seconds / 60)}m`;
}

function statusLabel(gate: ExecutionGate) {
  if (gate === "blocked_by_guardrail") {
    return "blocked";
  }
  if (gate === "needs_human_approval") {
    return "needs approval";
  }
  if (gate === "simulation_only") {
    return "simulation only";
  }
  return "safe";
}

function statusTone(gate: ExecutionGate) {
  if (gate === "blocked_by_guardrail") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (gate === "needs_human_approval" || gate === "simulation_only") {
    return "border-warning/30 bg-warning/10 text-warning";
  }
  return "border-success/30 bg-success/10 text-success";
}

function timelineIcon(status: TimelineStatus) {
  if (status === "complete") {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  if (status === "warning") {
    return <AlertTriangle className="h-4 w-4 text-warning" />;
  }
  if (status === "paused") {
    return <PauseCircle className="h-4 w-4 text-warning" />;
  }
  return <ShieldX className="h-4 w-4 text-destructive" />;
}

function evidenceTone(status: EvidenceStatus) {
  if (status === "bad") {
    return "text-destructive";
  }
  if (status === "warning") {
    return "text-warning";
  }
  return "text-foreground";
}

function compactActionText(action: AIAction) {
  if (action === "PAUSE") {
    return "PAUSE";
  }
  if (action === "REBALANCE") {
    return "REBALANCE";
  }
  if (action === "REDUCE_RISK") {
    return "REDUCE ONLY";
  }
  return "HOLD";
}

function buildCardData(props: AIReasoningPanelProps) {
  const {
    allocation,
    risk,
    decisions,
    aiReasoningData,
    hasConnectedWallet,
    aiDecisionMakerEnabled,
    swapRecommendations,
    availableRouteCount,
  } = props;

  const action = (allocation?.decision.recommended_action ??
    risk?.recommended_action ??
    decisions?.recommended_action ??
    "HOLD") as AIAction;
  const confidence =
    allocation?.decision.confidence ??
    risk?.confidence_normalized ??
    risk?.confidence ??
    decisions?.confidence ??
    0;
  const hardVeto = risk?.hard_veto_status === "active";
  const needsApproval =
    !aiDecisionMakerEnabled && risk?.required_human_approval_status === "required";
  const executionGate: ExecutionGate = hardVeto
    ? "blocked_by_guardrail"
    : aiDecisionMakerEnabled
      ? decisions?.ai_debug?.mode === "simulation"
        ? "simulation_only"
        : "allowed"
      : "needs_human_approval";

  const decisionReason = normalizeSentence(
    allocation?.decision.reasoning ??
      risk?.status_reason ??
      risk?.reasoning_summary ??
      decisions?.reasoning_summary ??
      aiReasoningData?.decision.reasoningSummary,
    "Portfolio remains within the current operating envelope.",
  );
  const reasoningSummary = normalizeSentence(
    aiReasoningData?.decision.reasoningSummary ??
    risk?.reasoning_summary ??
      decisions?.reasoning_summary ??
      allocation?.decision.reasoning,
    "The AI reviewed portfolio composition, market inputs, oracle freshness, route liquidity, and policy guards before reaching a decision.",
  );
  const reasoningStages = aiReasoningData?.stages ?? [];
  const reasoningGuardrails = aiReasoningData?.guardrails ?? [];
  const reasoningEvents = aiReasoningData?.events ?? [];
  const nextStep = hardVeto
    ? "Execution is blocked until the guard condition clears and inputs return to a safe state."
    : aiDecisionMakerEnabled
      ? swapRecommendations.length > 0
        ? `Full access AI can auto-approve and submit ${swapRecommendations.length} swap leg${swapRecommendations.length > 1 ? "s" : ""} once the proposal is created in live mode.`
        : "Full access AI is monitoring the portfolio. No execution step is required at this time."
      : needsApproval
        ? "A human review is required before the proposal can move into execution."
        : swapRecommendations.length > 0
            ? `The system is ready to execute ${swapRecommendations.length} linked swap leg${
              swapRecommendations.length > 1 ? "s" : ""
            }.`
          : "No execution step is required. The system remains in monitoring mode.";

  const sources = Array.from(
    new Set([
      ...(decisions?.data_sources_used ?? []),
      ...(risk?.data_sources_used ?? []),
    ]),
  );
  const warnings =
    (risk?.freshness_status && risk.freshness_status !== "fresh" ? 1 : 0) +
    (hardVeto ? 1 : 0) +
    (decisions?.constraints_applied?.length ?? 0);

  const leadPosition = [...(allocation?.current_weights ? Object.entries(allocation.current_weights) : [])]
    .sort((a, b) => b[1] - a[1])[0];

  const buckets = risk?.buckets ?? [];

  function bucketByName(name: string) {
    return buckets.find((b) => b.bucket === name);
  }

  function bucketToStepStatus(b: { status_code: string; hard_veto: boolean }): TimelineStatus {
    if (b.hard_veto) return "blocked";
    if (b.status_code === "RISK_NORMAL") return "complete";
    return "warning";
  }

  function formatBucketName(name: string) {
    return name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const reasoningTimeline = reasoningStages.length
    ? reasoningStages.map((stage) => ({
        title: stage.title,
        status: reasoningStepStatusToTimelineStatus(stage.status),
        detail: normalizeSentence(stage.detail, "Backend reasoning data is available."),
      }))
    : null;

  const reasoningEvidence = reasoningGuardrails.length
    ? reasoningGuardrails.slice(0, 4).map((guardrail) => ({
        label: guardrail.name,
        value: guardrail.message,
        status: guardrailSeverityToEvidenceStatus(guardrail.severity),
      }))
    : null;

  const knownBuckets = new Set(["portfolio_valuation", "concentration_drift", "quote_availability", "oracle_freshness", "policy_guard"]);

  const timeline: TimelineStep[] = [];

  const valBucket = bucketByName("portfolio_valuation");
  if (reasoningTimeline) {
    timeline.push(...reasoningTimeline);
  } else {
    timeline.push({
      title: "Portfolio Scan",
      status: hasConnectedWallet ? "complete" : "warning",
      detail: valBucket?.reason
        ?? (leadPosition
          ? `${leadPosition[0]} exposure at ${(leadPosition[1] * 100).toFixed(2)}%.`
          : "Current portfolio balances and sleeve weights were loaded."),
    });

    const mktBucket = bucketByName("quote_availability");
    timeline.push({
      title: "Market Fetch",
      status: mktBucket ? bucketToStepStatus(mktBucket) : sources.length > 0 ? "complete" : "warning",
      detail: mktBucket?.reason
        ?? (sources.length > 0
          ? "USDY, mETH, reserve, and route market data loaded."
          : "Market data inputs are still loading or unavailable."),
    });

    const concBucket = bucketByName("concentration_drift");
    if (concBucket && concBucket.status_code !== "RISK_NORMAL") {
      timeline.push({
        title: "Concentration Check",
        status: bucketToStepStatus(concBucket),
        detail: concBucket.reason,
      });
    }

    const oracleBucket = bucketByName("oracle_freshness");
    timeline.push({
      title: "Oracle Check",
      status: oracleBucket
        ? bucketToStepStatus(oracleBucket)
        : hardVeto
          ? "blocked"
          : risk?.freshness_status === "fresh"
            ? "complete"
            : "warning",
      detail: oracleBucket?.reason
        ?? (risk?.freshness_status === "fresh"
          ? "Oracle freshness is within the safe execution threshold."
          : hardVeto
            ? "Oracle or freshness policy failed and blocked execution."
            : "Freshness checks require review before execution."),
    });

    const otherBuckets = buckets.filter((b) => !knownBuckets.has(b.bucket));
    for (const b of otherBuckets) {
      timeline.push({
        title: formatBucketName(b.bucket),
        status: bucketToStepStatus(b),
        detail: b.reason,
      });
    }

    const policyBucket = bucketByName("policy_guard");
    timeline.push({
      title: "Policy Guard",
      status: hardVeto || warnings > 0 ? "blocked" : "complete",
      detail: policyBucket?.reason
        ?? (hardVeto
          ? "One or more portfolio or policy guards blocked new allocation."
          : warnings > 0
            ? "Guard conditions require approval before allocation can proceed."
            : "No active policy guard is blocking the proposal."),
    });

    timeline.push({
      title: "Final Decision",
      status: action === "PAUSE" ? "paused" : aiDecisionMakerEnabled ? "complete" : needsApproval ? "warning" : "complete",
      detail:
        action === "PAUSE"
          ? "Pause strategy and request human approval."
          : aiDecisionMakerEnabled
            ? "Decision can be auto-approved by full access AI when the proposal is created in live mode."
            : needsApproval
              ? "Recommendation is ready but still requires human approval."
              : "Decision is ready to move into execution.",
    });
  }

  const evidence: EvidenceItem[] = (
    reasoningEvidence ?? [
      ...(leadPosition
        ? [
            {
              label: `${leadPosition[0]} concentration`,
              value: `${(leadPosition[1] * 100).toFixed(2)}%`,
              limit: "target threshold",
              status: leadPosition[1] > 0.5 ? "bad" : "good",
            } satisfies EvidenceItem,
          ]
        : []),
      ...(risk?.freshness_status
        ? [
            {
              label: "Oracle freshness",
              value:
                risk.freshness_status === "fresh"
                  ? "Safe"
                  : "Below safe threshold",
              status: risk.freshness_status === "fresh" ? "good" : "warning",
            } satisfies EvidenceItem,
          ]
        : []),
      ...(swapRecommendations.length > 0
        ? [
            {
              label: "Execution routes",
              value: `${swapRecommendations.length} available`,
              status: "good",
            } satisfies EvidenceItem,
          ]
        : [
            {
              label: "Execution routes",
              value: action === "PAUSE" ? "Not execution-safe" : "Pending",
              status: action === "PAUSE" ? "bad" : "warning",
            } satisfies EvidenceItem,
          ]),
      {
        label: "Execution status",
        value: statusLabel(executionGate),
        status: executionGate === "allowed" ? "good" : "bad",
      },
    ]
  ).slice(0, 4);

  return {
    updated: updatedAgo(
      aiReasoningData?.summary.lastUpdated ??
      allocation?.generated_at ??
        allocation?.decision.created_at ??
        risk?.generated_at ??
        decisions?.metadata?.timestamp,
    ),
    decision: aiReasoningData?.summary.action ? compactActionText(aiReasoningData.summary.action) : compactActionText(action),
    riskScore: risk?.risk_score_normalized ?? risk?.risk_score ?? 0,
    confidence: aiReasoningData?.summary.confidence ?? confidence,
    signals: sources.length,
    routes: availableRouteCount ?? swapRecommendations.length,
    warnings: aiReasoningData ? Math.max(warnings, aiReasoningData.guardrails.length) : warnings,
    executionGate,
    mainReason:
      action === "PAUSE"
        ? "Risk constraints require pausing new allocation."
        : normalizeSentence(decisionReason, "Decision generated from current portfolio state."),
    summaryLine:
      aiReasoningData?.decision.reasoningSummary
        ? summaryTextFromReason(aiReasoningData.decision.reasoningSummary)
        : action === "PAUSE"
          ? "Risk constraints require pausing new allocation."
          : summaryTextFromReason(decisionReason),
    fullReasoning: `${reasoningSummary} ${nextStep} ${reasoningEvents.map((event) => event.message).slice(0, 2).join(" ")}`.replace(/\s+/g, " ").trim(),
    timeline,
    evidence,
  };
}

function summaryTextFromReason(reason: string) {
  return normalizeSentence(reason, "Recommendation generated from portfolio drift.");
}

export function AIReasoningPanel(props: AIReasoningPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const {
    isLoading,
    hasConnectedWallet,
    aiDecisionMakerEnabled,
    onAiAccessChange,
    isAiAccessPending,
    backendLogs,
    backendLogsLoading,
  } = props;

  const card = useMemo(() => buildCardData(props), [props]);

  const statusClass = statusTone(card.executionGate);

  if (isLoading) {
    return (
      <section className="ai-reasoning-panel rounded-lg p-5">
        <div className="flex items-center gap-3 text-primary">
          <Cpu className="h-4 w-4 animate-pulse" />
          <span className="text-xs uppercase tracking-[0.18em]">AI Reasoning</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Analyzing portfolio...</p>
      </section>
    );
  }

  return (
    <section className="ai-reasoning-panel rounded-lg overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((value) => !value);
          }
        }}
        className="w-full p-4 text-left transition-colors hover:bg-primary/[0.03] sm:p-5"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                <p className="text-xs uppercase tracking-[0.18em] text-primary">
                  AI Command Center
                </p>
              </div>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-foreground">
                {card.mainReason}
              </p>
            </div>

            <div className="ml-4 flex shrink-0 items-center gap-3">
              {hasConnectedWallet && (
                <div
                  className="hidden items-center gap-2 pr-2 sm:flex"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <span className="whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    AI access
                  </span>
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

              <span className="rounded-full border border-border bg-surface-2/70 px-3 py-1 text-[0.68rem] text-muted-foreground">
                {card.updated}
              </span>
              {expanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span className="font-mono text-xl text-cream">{card.decision}</span>
            <span className="text-muted-foreground">
              Risk {card.riskScore.toFixed(0)}/100
            </span>
            <span className="text-muted-foreground">Signals {card.signals}</span>
            <span className="text-muted-foreground">Routes {card.routes}</span>
            <span className="text-warning">Warnings {card.warnings}</span>
            <span className="text-success">
              {Math.round(card.confidence * 100)}%
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.14em] ${statusClass}`}
            >
              {statusLabel(card.executionGate)}
            </span>
          </div>

          <div className="rounded-lg border border-border bg-background/30 p-3">
            <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.16em] text-primary">
              Main Reason
            </p>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-foreground">
              {card.summaryLine}
            </p>
          </div>
        </div>
      </div>

      {showWarning && (
        <div className="border-t border-primary/20 px-5 pb-5 pt-4">
          <div className="rounded-lg border border-destructive/30 bg-crimson-bg p-4">
            <p className="text-sm font-medium text-destructive">
              Warning: Full AI Access
            </p>
            <p className="mt-2 text-sm leading-6 text-cream">
              AI will get full access to execute trades and manage your portfolio
              automatically. AI can make mistakes. Review all actions carefully and
              monitor performance regularly.
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
        <div className="border-t border-primary/20 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
          <div className="mb-4 grid gap-2 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface-2/70 px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
                Signals
              </p>
              <p className="mt-1 font-mono text-lg text-foreground">
                {card.signals}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2/70 px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
                Routes
              </p>
              <p className="mt-1 font-mono text-lg text-foreground">
                {card.routes}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2/70 px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
                Warnings
              </p>
              <p className="mt-1 font-mono text-lg text-warning">
                {card.warnings}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2/70 px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
                Confidence
              </p>
              <p className="mt-1 font-mono text-lg text-foreground">
                {Math.round(card.confidence * 100)}%
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-lg border border-border bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.16em] text-primary">
                    AI Thinking Timeline
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Step-by-step checks behind the current decision.
                  </p>
                </div>
                <span className="rounded-full border border-primary/20 bg-primary/[0.08] px-3 py-1 text-[0.6rem] uppercase tracking-[0.14em] text-primary">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-3 w-3" />
                    {card.updated}
                  </span>
                </span>
              </div>
              <div className="space-y-3">
                {card.timeline.map((step) => (
                  <div
                    key={step.title}
                    className="grid gap-2 rounded-lg border border-border bg-surface-2/50 p-3 md:grid-cols-[180px_1fr]"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {timelineIcon(step.status)}
                      {step.title}
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {step.detail}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-surface-2/60 p-4">
              <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.16em] text-primary">
                Full Reasoning
              </p>
              <p className="mt-3 max-w-[85ch] text-sm leading-6 text-foreground">
                {card.fullReasoning}
              </p>
            </section>

            <section className="rounded-lg border border-border bg-surface-2/60 p-4">
              <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.16em] text-primary">
                Evidence Used
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {card.evidence.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-border bg-background/40 px-3 py-2"
                  >
                    <p className="text-[0.68rem] text-muted-foreground">
                      {item.label}
                    </p>
                    <p
                      className={`mt-1 font-mono text-sm font-semibold ${evidenceTone(item.status)}`}
                    >
                      {item.value}
                      {item.limit ? ` / ${item.limit}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-surface-2/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.16em] text-primary">
                    Backend Activity
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Recent backend logs from the running agent service.
                  </p>
                </div>
                <span className="rounded-full border border-border bg-background/40 px-3 py-1 text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
                  {backendLogsLoading ? "refreshing" : `${backendLogs?.length ?? 0} lines`}
                </span>
              </div>
              <ScrollArea className="mt-3 h-72 rounded-lg border border-border bg-background/50">
                <div className="space-y-2 p-3">
                  {backendLogs && backendLogs.length > 0 ? (
                    backendLogs.map((entry, index) => (
                      <div
                        key={`${entry.timestamp}-${entry.logger}-${index}`}
                        className="rounded-md border border-border/70 bg-surface-2/50 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
                          <span>{entry.level}</span>
                          <span>{entry.logger}</span>
                          <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="mt-1 break-words font-mono text-xs leading-5 text-foreground">
                          {entry.message}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {backendLogsLoading
                        ? "Loading backend activity..."
                        : "No backend log lines available yet."}
                    </p>
                  )}
                </div>
              </ScrollArea>
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
