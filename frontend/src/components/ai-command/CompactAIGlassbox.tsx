import { Activity, AlertTriangle, CheckCheck, ShieldAlert, XCircle } from "lucide-react";

import type {
  AllocationDecisionResponse,
  LatestQuotesResponse,
  PortfolioSnapshotResponse,
  RecommendationResponse,
  RiskAssessmentResponse,
  RoutesResponse,
} from "@/lib/api/types";

type CompactAIGlassboxProps = {
  allocation: AllocationDecisionResponse | undefined;
  risk: RiskAssessmentResponse | undefined;
  decisions: RecommendationResponse | undefined;
  portfolio: PortfolioSnapshotResponse | undefined;
  routes: RoutesResponse | undefined;
  quotes: LatestQuotesResponse | undefined;
  aiDecisionMakerEnabled: boolean;
  isLoading: boolean;
};

type TimelineStatus = "complete" | "warning" | "failed" | "blocked";
type EvidenceStatus = "good" | "warning" | "bad";

type EvidenceItem = {
  label: string;
  value: string;
  limit?: string;
  status: EvidenceStatus;
};

function formatPercent(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

function formatAgeLabel(timestamp: string | undefined) {
  if (!timestamp) {
    return "Live";
  }
  const ageSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000),
  );
  if (ageSeconds < 60) {
    return `Live • ${ageSeconds}s ago`;
  }
  return `Live • ${Math.round(ageSeconds / 60)}m ago`;
}

function normalizeSentence(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function summarizeReason(
  allocation: AllocationDecisionResponse | undefined,
  risk: RiskAssessmentResponse | undefined,
  decisions: RecommendationResponse | undefined,
) {
  return normalizeSentence(
    allocation?.decision.reasoning ??
      risk?.status_reason ??
      risk?.reasoning_summary ??
      decisions?.status_reason ??
      decisions?.reasoning_summary,
    "No blocking condition is active. The system is monitoring portfolio state.",
  );
}

function summarizeReasoning(
  allocation: AllocationDecisionResponse | undefined,
  risk: RiskAssessmentResponse | undefined,
  decisions: RecommendationResponse | undefined,
) {
  return normalizeSentence(
    risk?.reasoning_summary ??
      decisions?.reasoning_summary ??
      allocation?.decision.reasoning,
    "AI checked portfolio, market data, oracle freshness, liquidity, and policy guards.",
  );
}

function buildEvidence({
  risk,
  portfolio,
  routes,
  quotes,
}: {
  risk: RiskAssessmentResponse | undefined;
  portfolio: PortfolioSnapshotResponse | undefined;
  routes: RoutesResponse | undefined;
  quotes: LatestQuotesResponse | undefined;
}) {
  const items: EvidenceItem[] = [];

  if (risk?.freshness_status) {
    items.push({
      label: "Oracle",
      value: risk.freshness_status,
      status: risk.freshness_status === "fresh" ? "good" : "bad",
    });
  }

  if (routes?.routes?.length != null) {
    items.push({
      label: "Routes",
      value: String(routes.routes.length),
      status: routes.routes.length > 0 ? "good" : "warning",
    });
  }

  const quote = (quotes?.quotes ?? []).find(
    (entry) => entry.route_depth_usd || entry.estimated_slippage_bps,
  );
  if (quote?.route_depth_usd) {
    items.push({
      label: "Route depth",
      value: `$${Math.round(Number(quote.route_depth_usd)).toLocaleString()}`,
      status: Number(quote.route_depth_usd) > 0 ? "good" : "warning",
    });
  }

  if (quote?.estimated_slippage_bps) {
    const slippage = Number(quote.estimated_slippage_bps) / 100;
    items.push({
      label: "Slippage",
      value: `${slippage.toFixed(2)}%`,
      limit: "0.75%",
      status: slippage > 0.75 ? "warning" : "good",
    });
  }

  const leadPosition = [...(portfolio?.positions ?? [])]
    .filter((position) => position.asset_symbol && position.weight)
    .sort((a, b) => Number(b.value_usd ?? 0) - Number(a.value_usd ?? 0))[0];
  if (leadPosition?.asset_symbol && leadPosition.weight) {
    items.push({
      label: `${leadPosition.asset_symbol} exposure`,
      value: `${(Number(leadPosition.weight) * 100).toFixed(1)}%`,
      limit: "50.0%",
      status: Number(leadPosition.weight) > 0.5 ? "warning" : "good",
    });
  }

  return items.slice(0, 4);
}

function buildTimeline({
  hasPortfolio,
  hasMarket,
  oracleFailed,
  liquidityWarning,
  executionBlocked,
}: {
  hasPortfolio: boolean;
  hasMarket: boolean;
  oracleFailed: boolean;
  liquidityWarning: boolean;
  executionBlocked: boolean;
}) {
  return [
    { label: "Portfolio", status: hasPortfolio ? "complete" : "warning" as TimelineStatus },
    { label: "Market", status: hasMarket ? "complete" : "warning" as TimelineStatus },
    { label: "Oracle", status: oracleFailed ? "failed" : "complete" as TimelineStatus },
    { label: "Liquidity", status: liquidityWarning ? "warning" : "complete" as TimelineStatus },
    { label: "Execution", status: executionBlocked ? "blocked" : "complete" as TimelineStatus },
  ];
}

function timelineIcon(status: TimelineStatus) {
  if (status === "complete") {
    return <CheckCheck className="h-3.5 w-3.5 text-success" />;
  }
  if (status === "warning") {
    return <AlertTriangle className="h-3.5 w-3.5 text-warning" />;
  }
  return <XCircle className="h-3.5 w-3.5 text-destructive" />;
}

function timelineTone(status: TimelineStatus) {
  if (status === "complete") {
    return "text-foreground";
  }
  if (status === "warning") {
    return "text-warning";
  }
  return "text-destructive";
}

function actionTone(action: string | undefined) {
  if (action === "PAUSE" || action === "REDUCE_RISK") {
    return "text-warning";
  }
  if (action === "REBALANCE") {
    return "text-primary";
  }
  return "text-foreground";
}

function decisionStatusTone(blocked: boolean, needsApproval: boolean) {
  if (blocked) {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (needsApproval) {
    return "border-warning/30 bg-warning/10 text-warning";
  }
  return "border-success/30 bg-success/10 text-success";
}

function decisionStatusLabel(blocked: boolean, needsApproval: boolean) {
  if (blocked) {
    return "blocked";
  }
  if (needsApproval) {
    return "needs approval";
  }
  return "safe";
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

export function CompactAIGlassbox({
  allocation,
  risk,
  decisions,
  portfolio,
  routes,
  quotes,
  aiDecisionMakerEnabled,
  isLoading,
}: CompactAIGlassboxProps) {
  if (isLoading) {
    return (
      <section className="terminal-panel border-primary/20 rounded-lg p-5">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-pulse border border-primary/30 bg-primary/10" />
          <span className="text-xs text-muted-foreground">
            Loading AI command state...
          </span>
        </div>
      </section>
    );
  }

  const action =
    allocation?.decision.recommended_action ??
    risk?.recommended_action ??
    decisions?.recommended_action ??
    "HOLD";
  const confidence =
    allocation?.decision.confidence ??
    risk?.confidence_normalized ??
    risk?.confidence ??
    decisions?.confidence ??
    0;
  const warnings = [
    risk?.freshness_status && risk.freshness_status !== "fresh" ? "freshness" : null,
    risk?.hard_veto_status === "active" ? "hard_veto" : null,
    ...(decisions?.constraints_applied ?? []),
  ].filter(Boolean).length;
  const signals = Array.from(
    new Set([
      ...(decisions?.data_sources_used ?? []),
      ...(risk?.data_sources_used ?? []),
      ...(portfolio?.data_sources_used ?? []),
    ]),
  ).length;
  const routeCount = routes?.routes?.length ?? allocation?.rebalance_actions?.length ?? 0;
  const updatedAgo = formatAgeLabel(
    allocation?.generated_at ??
      allocation?.decision.created_at ??
      risk?.generated_at ??
      portfolio?.generated_at ??
      undefined,
  );
  const reason = summarizeReason(allocation, risk, decisions);
  const reasoning = summarizeReasoning(allocation, risk, decisions);
  const needsApproval =
    risk?.required_human_approval_status === "required" || !aiDecisionMakerEnabled;
  const evidence = buildEvidence({ risk, portfolio, routes, quotes });
  const oracleFailed =
    risk?.hard_veto_status === "active" || risk?.freshness_status === "stale";
  const liquidityWarning =
    Boolean(quotes?.quotes?.length) &&
    (quotes?.quotes ?? []).every(
      (entry) => !entry.route_depth_usd || entry.freshness_status !== "fresh",
    );
  const executionBlocked = action === "PAUSE" || risk?.hard_veto_status === "active";
  const riskScore = risk?.risk_score_normalized ?? risk?.risk_score;
  const timeline = buildTimeline({
    hasPortfolio: Boolean(portfolio?.positions?.length),
    hasMarket: Boolean(
      (decisions?.data_sources_used ?? []).length || quotes?.quotes?.length,
    ),
    oracleFailed,
    liquidityWarning,
    executionBlocked,
  });

  return (
    <section className="terminal-panel border-primary/25 overflow-hidden rounded-lg p-0">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <p className="terminal-label text-primary">AI Command Center</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Glassbox view of current portfolio decision
            </p>
          </div>
          <span className="rounded-full border border-border bg-surface-2/70 px-3 py-1 text-[0.68rem] text-muted-foreground">
            {updatedAgo}
          </span>
        </div>
      </div>

      <div className="grid gap-2 border-b border-border bg-surface-2/40 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4 sm:px-5">
        <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
          <p className="text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
            Signals
          </p>
          <p className="mt-1 font-mono text-lg text-foreground">{signals}</p>
        </div>
        <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
          <p className="text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
            Routes
          </p>
          <p className="mt-1 font-mono text-lg text-foreground">{routeCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
          <p className="text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
            Warnings
          </p>
          <p className="mt-1 font-mono text-lg text-warning">{warnings}</p>
        </div>
        <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
          <p className="text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
            Confidence
          </p>
          <p className="mt-1 font-mono text-lg text-foreground">
            {formatPercent(confidence)}
          </p>
        </div>
      </div>

      <div className="border-b border-border px-4 py-4 sm:px-5">
        <div className="grid gap-3 lg:grid-cols-[150px_1fr_auto] lg:items-center">
          <p className={`font-mono text-2xl font-semibold uppercase ${actionTone(action)}`}>
            {action}
          </p>
          <div className="min-w-0">
            <p className="line-clamp-1 text-sm font-medium text-foreground">
              {reason}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5" />
                Risk {typeof riskScore === "number" ? riskScore.toFixed(0) : "--"}/100
              </span>
              <span className="text-muted-foreground">•</span>
              <span className={needsApproval ? "text-warning" : "text-success"}>
                {needsApproval ? "Needs Human Approval" : "Execution Allowed"}
              </span>
            </div>
          </div>
          <span
            className={`inline-flex h-fit items-center rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${decisionStatusTone(
              executionBlocked,
              needsApproval,
            )}`}
          >
            {decisionStatusLabel(executionBlocked, needsApproval)}
          </span>
        </div>
      </div>

      <div className="border-b border-border px-4 py-4 sm:px-5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-primary">
          Main Reasoning
        </p>
        <p className="mt-2 line-clamp-2 max-w-[80ch] text-sm leading-6 text-foreground">
          {reasoning}
        </p>
      </div>

      <div className="border-b border-border px-4 py-4 sm:px-5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-primary">
          Evidence
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {evidence.length > 0 ? (
            evidence.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-border bg-surface-2/60 px-3 py-2"
              >
                <p className="text-[0.68rem] text-muted-foreground">{item.label}</p>
                <p
                  className={`mt-1 font-mono text-sm font-semibold ${evidenceTone(item.status)}`}
                >
                  {item.value}
                  {item.limit ? ` / ${item.limit}` : ""}
                </p>
              </div>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">
              No compact evidence available yet.
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-primary">
          Timeline
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
          {timeline.slice(0, 5).map((step, index) => (
            <div key={step.label} className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/50 px-3 py-1 text-xs ${timelineTone(
                  step.status,
                )}`}
              >
                {timelineIcon(step.status)}
                {step.label}
              </span>
              {index < timeline.length - 1 && (
                <span className="text-muted-foreground">→</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
