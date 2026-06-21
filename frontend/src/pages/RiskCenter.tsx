import {
  AlertTriangle,
  Bot,
  Check,
  Clock3,
  Database,
  Loader2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";

import { RiskBucketChart } from "@/components/dashboard/RiskBucketChart";
import { RiskConfidenceCard } from "@/components/dashboard/RiskConfidenceCard";
import { PageScaffold, StatusPill } from "@/components/rwa/PageScaffold";
import { useAllocationRecommendation } from "@/hooks/useAllocation";
import { useDecisions } from "@/hooks/useDecisions";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";
import { useCurrentRisk } from "@/hooks/useRisk";
import type { RiskAssessmentResponse, RiskBucket } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type Tone = "ready" | "degraded" | "blocked" | "neutral";

function formatLabel(value: string | null | undefined) {
  if (!value) {
    return "Pending";
  }
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return `${Math.round(value * 100)}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Waiting for first assessment";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function bucketTone(bucket: RiskBucket): Tone {
  if (bucket.hard_veto || bucket.status === "blocked") {
    return "blocked";
  }
  if (bucket.status === "warning" || bucket.status === "missing") {
    return "degraded";
  }
  if (bucket.status === "ok") {
    return "ready";
  }
  return "neutral";
}

function bucketStatusLabel(bucket: RiskBucket) {
  if (bucket.hard_veto) {
    return "Hard veto";
  }
  return formatLabel(bucket.status);
}

function bucketDisplayName(name: string) {
  return name
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function readinessTone(risk: RiskAssessmentResponse | undefined): Tone {
  if (!risk) {
    return "neutral";
  }
  if (risk.hard_veto_status === "active") {
    return "blocked";
  }
  if (risk.status !== "ok") {
    return "degraded";
  }
  return "ready";
}

function readinessLabel(risk: RiskAssessmentResponse | undefined) {
  if (!risk) {
    return "Waiting for assessment";
  }
  if (risk.hard_veto_status === "active") {
    return "Hard veto active";
  }
  if (risk.required_human_approval_status === "required") {
    return "Approval required";
  }
  return "All checks clear";
}

export default function RiskCenter() {
  const { effectiveWalletAddress, isSupportedChain, connectedWalletAddress } = usePortfolioWallet();
  const currentQuery = useCurrentRisk();
  const decisionsQuery = useDecisions();
  const allocationQuery = useAllocationRecommendation();

  const current = currentQuery.data;
  const decisions = decisionsQuery.data;
  const allocation = allocationQuery.data;
  const buckets = current?.buckets ?? [];
  const constraints = decisions?.constraints_applied ?? [];
  const dataSources = Array.from(
    new Set([...(current?.data_sources_used ?? []), ...(decisions?.data_sources_used ?? [])]),
  );
  const isConnected = Boolean(effectiveWalletAddress);
  const loading = currentQuery.isLoading || decisionsQuery.isLoading || allocationQuery.isLoading;
  const syncing = currentQuery.isFetching || decisionsQuery.isFetching || allocationQuery.isFetching;
  const canAssess = isConnected && isSupportedChain;

  const recommendationChecks = [
    {
      title: "Wallet scope",
      detail: canAssess
        ? `Using ${effectiveWalletAddress}`
        : connectedWalletAddress && !isSupportedChain
          ? "Connected wallet is not on Mantle Sepolia"
          : "Connect or paste a Mantle Sepolia wallet to load risk and AI checks",
      tone: canAssess ? "ready" : "blocked",
      icon: Wallet,
    },
    {
      title: "Portfolio snapshot",
      detail: current?.metadata?.portfolio_snapshot_id
        ? `Snapshot ${String(current.metadata.portfolio_snapshot_id).slice(0, 12)} loaded`
        : current?.status_reason ?? "Waiting for portfolio data",
      tone: current ? "ready" : "degraded",
      icon: Database,
    },
    {
      title: "Market freshness",
      detail: current?.freshness_status ? formatLabel(current.freshness_status) : "Waiting for price and quote inputs",
      tone: current?.freshness_status === "fresh" ? "ready" : current ? "degraded" : "neutral",
      icon: Clock3,
    },
    {
      title: "Execution guardrail",
      detail: current?.hard_veto_status === "active" ? "A canonical guardrail is blocking execution" : "No hard veto is active",
      tone: current?.hard_veto_status === "active" ? "blocked" : current ? "ready" : "neutral",
      icon: current?.hard_veto_status === "active" ? ShieldX : ShieldCheck,
    },
    {
      title: "Human approval",
      detail: formatLabel(current?.required_human_approval_status ?? decisions?.required_human_approval_status ?? "pending"),
      tone: current?.required_human_approval_status === "required" ? "degraded" : current ? "ready" : "neutral",
      icon: ShieldAlert,
    },
    {
      title: "AI decision mode",
      detail: decisions?.ai_debug?.mode
        ? `${formatLabel(decisions.ai_debug.mode)}${decisions.ai_debug.used_fallback ? " fallback active" : ""}`
        : "No AI decision trace available yet",
      tone: decisions?.ai_debug?.used_fallback ? "degraded" : decisions ? "ready" : "neutral",
      icon: Bot,
    },
  ] as const;

  return (
    <PageScaffold
      title="Risk"
      description="Live risk buckets, approval gates, and AI recommendation checks for the connected wallet."
    >
      <div className="space-y-8">
        <header className="terminal-panel space-y-6 p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="terminal-label">Risk Command</p>
              <div>
                <h1 className="text-4xl font-semibold leading-none text-foreground sm:text-5xl">Risk & AI guardrails</h1>
                <p className="mt-3 max-w-3xl text-base text-muted-foreground">
                  The risk page now shows the live checks the engine evaluates before any recommendation or allocation is allowed to move forward.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <StatusPill tone={readinessTone(current)}>{readinessLabel(current)}</StatusPill>
              {syncing ? (
                <div className="inline-flex items-center gap-2 border border-warning/35 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Synchronizing</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-lg border border-border bg-surface-1 p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="terminal-label">Current risk band</p>
                  <h2 className="mt-4 text-3xl font-semibold text-primary sm:text-4xl">
                    {current?.risk_band ?? "Waiting"}
                  </h2>
                </div>
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {current?.reasoning_summary ?? "Connect a supported wallet to load the live risk verdict."}
              </p>
            </section>

            <section className="rounded-lg border border-border bg-surface-2 p-6">
              <p className="terminal-label">Recommendation state</p>
              <div className="mt-4 flex items-end gap-2">
                <p className="text-3xl font-semibold text-foreground sm:text-4xl">
                  {allocation?.decision?.recommended_action ?? decisions?.recommended_action ?? current?.recommended_action ?? "Pending"}
                </p>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {allocation?.decision?.reasoning ?? decisions?.reasoning_summary ?? current?.status_reason ?? "No recommendation is available yet."}
              </p>
            </section>

            <section className="rounded-lg border border-border bg-surface-2 p-6">
              <p className="terminal-label">AI execution mode</p>
              <div className="mt-4 flex items-end gap-2">
                <p className="text-3xl font-semibold text-foreground sm:text-4xl">
                  {decisions?.ai_debug?.mode ? formatLabel(decisions.ai_debug.mode) : "Pending"}
                </p>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {decisions?.ai_debug?.used_fallback
                  ? decisions.ai_debug.fallback_reason ?? "A deterministic fallback is currently in use."
                  : constraints.length
                    ? `${constraints.length} active execution constraint${constraints.length > 1 ? "s" : ""} are being applied to the AI output.`
                    : "No extra AI constraints are currently overriding the deterministic engine."}
              </p>
            </section>
          </div>
        </header>

        {!canAssess ? (
          <section className="terminal-panel p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">Wallet connection required</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  The risk engine, AI recommendation checks, and allocation guardrails only run for a connected or pasted Mantle Sepolia wallet. No env fallback is used on this page.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <RiskConfidenceCard
            risk={current ?? null}
            allocation={allocation}
            decisions={decisions}
            isLoading={loading}
          />
          <section className="terminal-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="terminal-label text-primary">AI Risk Detail</p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">Before recommendation and allocation</h2>
              </div>
              <Sparkles className="h-4 w-4 text-primary" />
            </div>

            <div className="mt-5 space-y-3">
              {recommendationChecks.map((check) => {
                const Icon = check.icon;
                return (
                  <div key={check.title} className="rounded-lg border border-border bg-surface-2/70 p-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                          check.tone === "ready" && "border-success/35 bg-success/10 text-success",
                          check.tone === "degraded" && "border-warning/35 bg-warning/10 text-warning",
                          check.tone === "blocked" && "border-destructive/35 bg-destructive/10 text-destructive",
                          check.tone === "neutral" && "border-border bg-background text-muted-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{check.title}</p>
                          <StatusPill tone={check.tone}>{formatLabel(check.tone)}</StatusPill>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <RiskBucketChart risk={current} isLoading={loading} />

          <section className="terminal-panel overflow-hidden p-0">
            <div className="border-b border-border px-6 py-5">
              <h2 className="text-xl font-semibold text-foreground">Active checks the engine is following</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Live bucket checks from the deterministic risk engine. These are the inputs the AI must respect before any recommendation can be trusted.
              </p>
            </div>

            <div className="divide-y divide-border">
              {buckets.length ? (
                buckets.map((bucket) => (
                  <div key={bucket.bucket} className="px-6 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{bucketDisplayName(bucket.bucket)}</p>
                          <StatusPill tone={bucketTone(bucket)}>{bucketStatusLabel(bucket)}</StatusPill>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{bucket.reason}</p>
                      </div>

                      <div className="grid shrink-0 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                        <div className="rounded border border-border bg-surface-2 px-3 py-2">
                          <span className="block">Score</span>
                          <span className="mt-1 block font-mono text-foreground">{bucket.score.toFixed(2)}</span>
                        </div>
                        <div className="rounded border border-border bg-surface-2 px-3 py-2">
                          <span className="block">Weight</span>
                          <span className="mt-1 block font-mono text-foreground">{formatPercent(bucket.weight)}</span>
                        </div>
                        <div className="rounded border border-border bg-surface-2 px-3 py-2">
                          <span className="block">Code</span>
                          <span className="mt-1 block font-mono text-foreground">{bucket.status_code}</span>
                        </div>
                      </div>
                    </div>

                    {bucket.data_sources_used.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {bucket.data_sources_used.map((source) => (
                          <span
                            key={`${bucket.bucket}-${source}`}
                            className="rounded border border-border bg-surface-2 px-2 py-1 text-[0.68rem] text-muted-foreground"
                          >
                            {source}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="px-6 py-8 text-sm text-muted-foreground">
                  No bucket-level checks are available yet.
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="terminal-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="terminal-label text-primary">Allocation Guard</p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">Latest AI allocation posture</h2>
              </div>
              <Target className="h-4 w-4 text-primary" />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-border bg-surface-2 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Action</p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {allocation?.decision?.recommended_action ?? "Pending"}
                </p>
              </div>
              <div className="rounded border border-border bg-surface-2 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Decision confidence</p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {formatPercent(allocation?.decision?.confidence ?? decisions?.confidence)}
                </p>
              </div>
              <div className="rounded border border-border bg-surface-2 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Profile</p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {allocation?.decision?.profile_name ?? "Pending"}
                </p>
              </div>
              <div className="rounded border border-border bg-surface-2 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Rebalance routes</p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {allocation?.rebalance_actions?.length ?? 0}
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {allocation?.decision?.reasoning ?? "The allocation engine has not returned a recommendation for this wallet yet."}
            </p>
          </section>

          <section className="terminal-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="terminal-label text-primary">Evidence & Notes</p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">What the engine used</h2>
              </div>
              <Check className="h-4 w-4 text-primary" />
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Data sources</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dataSources.length ? (
                    dataSources.map((source) => (
                      <span key={source} className="rounded border border-border bg-surface-2 px-2.5 py-1 text-[0.68rem] text-muted-foreground">
                        {source}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No data sources reported yet.</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Active constraints</p>
                <div className="mt-3 space-y-2">
                  {constraints.length ? (
                    constraints.map((constraint) => (
                      <div key={constraint} className="rounded border border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
                        {constraint}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No extra AI constraints are active on the latest recommendation.</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Risk notes</p>
                <div className="mt-3 space-y-2">
                  {(current?.notes ?? []).length ? (
                    current?.notes.map((note) => (
                      <div key={note} className="rounded border border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
                        {note}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No additional risk notes were returned.</p>
                  )}
                </div>
              </div>

              <div className="rounded border border-border bg-surface-2 px-3 py-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Last assessment:</span> {formatDateTime(current?.generated_at)}
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageScaffold>
  );
}
