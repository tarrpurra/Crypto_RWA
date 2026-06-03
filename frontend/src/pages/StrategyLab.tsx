import { Activity, BarChart3, ShieldAlert, Target } from "lucide-react";

import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { useAllocationRecommendation } from "@/hooks/useAllocation";
import { useCurrentRisk } from "@/hooks/useRisk";
import { useSystemHealth } from "@/hooks/useSystem";

const reviewCards = [
  {
    title: "Risk posture",
    description: "Check the current band, veto state, and approval requirement before changing exposure.",
    icon: ShieldAlert,
  },
  {
    title: "Allocation intent",
    description: "Compare current and target weights, then validate whether the recommendation is actionable.",
    icon: Target,
  },
  {
    title: "Portfolio evidence",
    description: "Use wallet-scoped positions, valuation status, and data freshness as the review baseline.",
    icon: BarChart3,
  },
];

export default function StrategyLab() {
  const healthQuery = useSystemHealth();
  const riskQuery = useCurrentRisk();
  const allocationQuery = useAllocationRecommendation();

  const health = healthQuery.data;
  const risk = riskQuery.data;
  const allocation = allocationQuery.data;

  return (
    <PageScaffold
      eyebrow="Strategy Lab"
      title="Strategy Lab"
      description="A focused review workspace for allocation intent, risk controls, and portfolio evidence."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <MetricPanel
          label="Agent Runtime"
          value={health?.runtime_mode ?? "Loading"}
          detail={health?.status_reason ?? "Reading backend health and runtime posture."}
          tone={toneFromStatus(health?.status)}
        />
        <MetricPanel
          label="Risk Gate"
          value={risk?.risk_band ?? "Loading"}
          detail={risk?.reasoning_summary ?? "Reading current risk posture before running strategy work."}
          tone={risk?.hard_veto_status === "active" ? "blocked" : toneFromStatus(risk?.status)}
        />
        <MetricPanel
          label="Allocation Bias"
          value={allocation?.decision.recommended_action ?? "Loading"}
          detail={allocation?.status_reason ?? "Reading allocation recommendation for the active wallet scope."}
          tone={allocation?.decision.recommended_action === "PAUSE" ? "blocked" : toneFromStatus(allocation?.status)}
        />
      </div>

      <section className="terminal-panel p-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-primary">Operator Review</p>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className="border border-border bg-surface-2 p-4">
            <p className="font-medium text-foreground">Confirm data state</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Start with wallet-scoped positions, market ingestion status, and backend runtime health.
            </p>
          </div>
          <div className="border border-border bg-surface-2 p-4">
            <p className="font-medium text-foreground">Read the controls</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Review hard vetoes, risk band, confidence, and approval requirements before acting.
            </p>
          </div>
          <div className="border border-border bg-surface-2 p-4">
            <p className="font-medium text-foreground">Validate next action</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Compare allocation intent with the proposal queue and execution readiness.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-3">
        {reviewCards.map((card) => (
          <div key={card.title} className="terminal-panel flex flex-col justify-between p-4">
            <div>
              <div className="flex items-center gap-2">
                <card.icon className="h-4 w-4 text-primary" />
                <p className="font-medium text-foreground">{card.title}</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{card.description}</p>
            </div>
          </div>
        ))}
      </section>
    </PageScaffold>
  );
}
