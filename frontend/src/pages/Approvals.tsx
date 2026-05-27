import { MetricPanel, PageScaffold } from "@/components/rwa/PageScaffold";

export default function Approvals() {
  return (
    <PageScaffold
      eyebrow="Human Review"
      title="Approvals"
      description="Proposal queue, policy checks, risk gates, and execution lifecycle once proposal APIs are ready."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <MetricPanel
          label="Queue"
          value="No Proposals"
          detail="The approval center starts read-only until backend proposal surfaces are available."
        />
        <MetricPanel
          label="Risk Gate"
          value="Required"
          detail="Every proposal will carry hard veto and human approval status before action buttons appear."
          tone="blocked"
        />
        <MetricPanel
          label="Contracts"
          value="Chain Context"
          detail="Execution details will include environment, contract addresses, and transaction state."
          tone="ready"
        />
      </div>
    </PageScaffold>
  );
}

