import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { useCurrentRisk, useRiskAssessments } from "@/hooks/useRisk";

export default function RiskCenter() {
  const currentQuery = useCurrentRisk();
  const assessmentsQuery = useRiskAssessments(10);
  const current = currentQuery.data;
  const assessments = assessmentsQuery.data;

  return (
    <PageScaffold
      eyebrow="Risk Engine"
      title="Risk Center"
      description="Risk score, hard veto state, human approval requirements, and bucket reasons for every recommendation."
    >
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
      <section className="terminal-panel p-4">
        <p className="terminal-label text-primary">Buckets</p>
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
    </PageScaffold>
  );
}
