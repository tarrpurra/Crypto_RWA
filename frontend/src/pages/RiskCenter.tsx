import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { useAllocationRecommendation } from "@/hooks/useAllocation";
import { useCurrentRisk, useRiskAssessments } from "@/hooks/useRisk";

export default function RiskCenter() {
  const currentQuery = useCurrentRisk();
  const assessmentsQuery = useRiskAssessments(10);
  const recommendationQuery = useAllocationRecommendation();
  const current = currentQuery.data;
  const assessments = assessmentsQuery.data;
  const recommendation = recommendationQuery.data;

  return (
    <PageScaffold
      eyebrow="Risk & Allocation Engine"
      title="Risk"
      description="Risk scores, hard veto state, human approval requirements, allocation recommendations, and rebalance actions."
    >
      {/* Risk metrics */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricPanel
          label="Risk Band"
          value={current?.risk_band ?? "Loading"}
          detail={current?.reasoning_summary ?? "Reading /risk/current."}
          tone={toneFromStatus(current?.status)}
        />
        <MetricPanel
          label="Hard Veto"
          value={current?.hard_veto_status ?? "Unknown"}
          detail={current?.status_reason ?? "Execution-facing UI stays gated until risk explicitly permits action."}
          tone={current?.hard_veto_status === "active" ? "blocked" : toneFromStatus(current?.status)}
        />
        <MetricPanel
          label="Approval"
          value={current?.required_human_approval_status ?? "Unknown"}
          detail={`Recommended action: ${current?.recommended_action ?? "-"}`}
          tone={toneFromStatus(current?.status)}
        />
        <MetricPanel
          label="History"
          value={`${assessments?.assessments.length ?? 0} Recent`}
          detail={assessments?.status_reason ?? "Reading /risk/assessments."}
          tone={toneFromStatus(assessments?.status)}
        />
      </div>

      {/* Risk buckets */}
      <section className="terminal-panel p-4">
        <p className="terminal-label text-primary">Risk Buckets</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {(current?.buckets ?? []).map((bucket) => (
            <div key={bucket.bucket} className="border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-foreground">{bucket.bucket}</p>
                <span className="font-mono text-sm text-muted-foreground">{bucket.score}</span>
              </div>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">{bucket.reason}</p>
            </div>
          ))}
          {!current?.buckets?.length && (
            <p className="text-sm text-muted-foreground">Risk buckets will appear once /risk/current returns assessment data.</p>
          )}
        </div>
      </section>

      {/* Allocation metrics */}
      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <MetricPanel
          label="Recommendation"
          value={recommendation?.decision.recommended_action ?? "Loading"}
          detail={recommendation?.status_reason ?? "Reading /allocation/recommendation."}
          tone={recommendation?.decision.recommended_action === "PAUSE" ? "blocked" : toneFromStatus(recommendation?.status)}
        />
        <MetricPanel
          label="Execution Gate"
          value={recommendation?.decision.profile_name ?? "Advisory Only"}
          detail="AI output remains advisory until deterministic risk and policy checks pass."
          tone="blocked"
        />
      </div>

      {/* Rebalance actions */}
      <section className="terminal-panel p-4">
        <p className="terminal-label text-primary">Rebalance Actions</p>
        <div className="mt-3 grid gap-2">
          {(recommendation?.rebalance_actions ?? []).map((action) => (
            <div key={`${action.asset_symbol}-${action.action}`} className="flex items-center justify-between border border-border bg-surface-2 px-3 py-2">
              <span className="font-medium text-foreground">{action.asset_symbol}</span>
              <span className="font-mono text-sm text-muted-foreground">{action.action} {action.amount}</span>
            </div>
          ))}
          {!recommendation?.rebalance_actions?.length && (
            <p className="text-sm text-muted-foreground">No rebalance actions returned yet.</p>
          )}
        </div>
      </section>
    </PageScaffold>
  );
}
