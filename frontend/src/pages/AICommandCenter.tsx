import { useState } from "react";
import { PageScaffold } from "@/components/rwa/PageScaffold";
import { AIStatusHeader } from "@/components/ai-command/AIStatusHeader";
import { DataIntakePanel } from "@/components/ai-command/DataIntakePanel";
import { ReasoningStream } from "@/components/ai-command/ReasoningStream";
import { RiskVerdictCard } from "@/components/ai-command/RiskVerdictCard";
import { AllocationProposal } from "@/components/ai-command/AllocationProposal";
import { TradeProposalPreview } from "@/components/ai-command/TradeProposalPreview";
import { ApprovalGate } from "@/components/ai-command/ApprovalGate";
import { ExecutionTimeline } from "@/components/ai-command/ExecutionTimeline";
import { useCurrentRisk } from "@/hooks/useRisk";
import { useAllocationRecommendation } from "@/hooks/useAllocation";
import { useDecisions } from "@/hooks/useDecisions";
import { useSettings, useUpdateSettings } from "@/hooks/useSystem";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";
import { useCurrentPortfolio } from "@/hooks/usePortfolio";

const liveDataSources = [
  { label: "Wallet balances", status: "fresh" as const },
  { label: "USDY reference price", status: "fresh" as const },
  { label: "mETH market quote", status: "fresh" as const },
  { label: "AGNI route quote", status: "fresh" as const },
  { label: "Merchant Moe liquidity", status: "fresh" as const },
  { label: "Pyth freshness", status: "fresh" as const },
  { label: "RPC latency", status: "fresh" as const },
];

const reasoningLines = [
  "Analyzing current portfolio allocation against target weights...",
  "USDY allocation is below the Balanced target by 6.2%.",
  "mETH volatility is elevated over the last window.",
  "Route liquidity is acceptable but not deep enough for a full rebalance.",
  "Risk score computed: 38 / 100 — Band: Smaller clips allowed.",
  "No hard veto triggered. Oracle freshness is healthy.",
  "Recommendation: execute smaller USDY clip only after human approval.",
];

const defaultLogs = [
  { time: "10:41:02", event: "AI scanned portfolio", status: "done" as const },
  { time: "10:41:06", event: "Risk score computed: 38", status: "done" as const },
  { time: "10:41:08", event: "Proposal created", status: "done" as const },
  { time: "10:41:20", event: "Waiting for user approval", status: "active" as const },
  { time: "10:41:25", event: "Transaction submitted", status: "pending" as const },
  { time: "10:41:31", event: "Swap confirmed", status: "pending" as const },
  { time: "10:41:34", event: "Portfolio snapshot updated", status: "pending" as const },
];

const preChecks = [
  { label: "Router whitelisted", passed: true },
  { label: "Oracle fresh", passed: true },
  { label: "Slippage within limit", passed: true },
  { label: "Concentration cap respected", passed: true },
  { label: "Proposal not expired", passed: true },
];

export default function AICommandCenter() {
  const riskQuery = useCurrentRisk();
  const allocationQuery = useAllocationRecommendation();
  const decisionsQuery = useDecisions();
  const settingsQuery = useSettings();
  const portfolioQuery = useCurrentPortfolio();
  const updateSettings = useUpdateSettings();
  const { effectiveWalletAddress } = usePortfolioWallet();

  const risk = riskQuery.data;
  const allocation = allocationQuery.data;
  const decisions = decisionsQuery.data;
  const settings = settingsQuery.data;

  const [isPaused, setIsPaused] = useState(false);
  const [logs, setLogs] = useState(defaultLogs);

  const health = { runtime_mode: settings?.ai_decision_maker_enabled ? "Full Access AI" : "Recommendation Only" };
  const confidence = allocation?.decision?.confidence ?? risk?.confidence ?? decisions?.confidence ?? 0;
  const status = isPaused ? "Paused" : allocation?.decision?.recommended_action ? "Proposal Ready" : "Scanning";
  const hasProposal = Boolean(allocation?.rebalance_actions?.length);

  const handleApprove = () => {
    setLogs((prev) =>
      prev.map((entry) =>
        entry.event === "Waiting for user approval"
          ? { ...entry, status: "done" as const }
          : entry.event === "Transaction submitted"
            ? { ...entry, status: "active" as const }
            : entry,
      ),
    );
  };

  const handleReject = () => {
    setLogs((prev) => [
      ...prev.slice(0, 3),
      { time: new Date().toLocaleTimeString(), event: "User rejected proposal", status: "done" as const },
      ...prev.slice(4).map((e) => ({ ...e, status: "pending" as const })),
    ]);
  };

  const handleSimulate = () => {
    setLogs((prev) => [
      ...prev.slice(0, 3),
      { time: new Date().toLocaleTimeString(), event: "Simulation completed — no errors", status: "done" as const },
      ...prev.slice(4),
    ]);
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
    if (!isPaused) {
      setLogs((prev) => [
        ...prev,
        { time: new Date().toLocaleTimeString(), event: "AI paused by user", status: "done" as const },
      ]);
    } else {
      setLogs((prev) => [
        ...prev,
        { time: new Date().toLocaleTimeString(), event: "AI resumed by user", status: "active" as const },
      ]);
    }
  };

  return (
    <div data-testid="ai-command-page" className="flex min-h-screen flex-1 flex-col bg-[radial-gradient(circle_at_50%_15%,rgba(214,184,63,0.15),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(214,184,63,0.05),transparent_40%),linear-gradient(180deg,rgba(9,7,5,0.12),rgba(5,4,3,0.35))]">
      <PageScaffold
        eyebrow="AIYield"
        title="AI Command Center"
        description="Full AI decision flow: data intake → reasoning → risk check → proposal → approval → execution."
      >
        {/* 1. AI Status Header */}
        <AIStatusHeader
          mode={health.runtime_mode}
          confidence={confidence}
          status={status}
          lastDecision={allocation?.decision?.recommended_action ?? "Monitoring"}
        />

        {/* 2 + 3. Data Intake + Reasoning Stream */}
        <section className="grid gap-4 md:grid-cols-2">
          <DataIntakePanel sources={liveDataSources} />
          <ReasoningStream lines={reasoningLines} isActive={!isPaused} />
        </section>

        {/* 4. Risk Engine Verdict */}
        <RiskVerdictCard risk={risk} isLoading={riskQuery.isLoading} />

        {/* 5 + 6. Allocation + Trade Proposal */}
        <section className="grid gap-4 md:grid-cols-2">
          <AllocationProposal allocation={allocation} isLoading={allocationQuery.isLoading} />
          <TradeProposalPreview allocation={allocation} isLoading={allocationQuery.isLoading} />
        </section>

        {/* 7. Human Approval Gate */}
        <ApprovalGate
          preChecks={preChecks}
          onApprove={handleApprove}
          onReject={handleReject}
          onSimulate={handleSimulate}
          onPause={handlePause}
          isPaused={isPaused}
          hasProposal={hasProposal}
        />

        {/* 8. Execution Timeline */}
        <ExecutionTimeline logs={logs} />
      </PageScaffold>
    </div>
  );
}
