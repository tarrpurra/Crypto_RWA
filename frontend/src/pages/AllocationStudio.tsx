import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { useAllocationRecommendation } from "@/hooks/useAllocation";

export default function AllocationStudio() {
  const recommendationQuery = useAllocationRecommendation();
  const recommendation = recommendationQuery.data;

  return (
    <PageScaffold
      eyebrow="Allocation Engine"
      title="Allocation"
      description="Target profiles, recommended action, confidence, rebalance actions, and deterministic risk gates."
    >
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
