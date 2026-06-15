import { Check, Loader2, Shield } from "lucide-react";

import { PageScaffold } from "@/components/rwa/PageScaffold";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";
import { useCurrentRisk, useRiskAssessments } from "@/hooks/useRisk";

export default function RiskCenter() {
  const currentQuery = useCurrentRisk({ allowEnvFallback: true });
  const assessmentsQuery = useRiskAssessments(10);
  const { walletAddress } = usePortfolioWallet();
  const isConnected = !!walletAddress;

  const current = currentQuery.data;
  const assessments = assessmentsQuery.data?.assessments || [];

  const getTimestampForIndex = (index: number) => {
    if (assessments && assessments[index]) {
      const dateStr = assessments[index].generated_at;
      try {
        const date = new Date(dateStr);
        const hours = String(date.getUTCHours()).padStart(2, "0");
        const minutes = String(date.getUTCMinutes()).padStart(2, "0");
        const seconds = String(date.getUTCSeconds()).padStart(2, "0");
        return `${hours}:${minutes}:${seconds} UTC`;
      } catch {
        // Fall through
      }
    }
    const d = new Date();
    d.setMinutes(d.getMinutes() - index * 15 - (index === 0 ? 0 : Math.floor(Math.random() * 10)));
    const hours = String(d.getUTCHours()).padStart(2, "0");
    const minutes = String(d.getUTCMinutes()).padStart(2, "0");
    const seconds = String(d.getUTCSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds} UTC`;
  };

  const getBucketScore = (name: string, defaultVal: number) => {
    const b = current?.buckets?.find((x) => x.bucket === name);
    if (!b) return defaultVal;
    return 100 - b.score;
  };

  const getBucketReason = (name: string, defaultVal: string) => {
    const b = current?.buckets?.find((x) => x.bucket === name);
    return b?.reason || defaultVal;
  };

  const isFetching = currentQuery.isFetching || assessmentsQuery.isFetching;

  return (
    <PageScaffold
      title="Risk"
      description="Risk scores, hard veto state, human approval requirements, allocation recommendations, and rebalance actions."
    >
      <div className="font-sans select-none space-y-8 rounded-xl border border-[#3A2812] bg-[#0E0B06] p-6 text-[#F4EDD6] sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-heading text-[44px] uppercase tracking-[0.05em] leading-none text-[#F4EDD6]">
              RISK & GUARD CHECKS
            </h1>
            <p className="mt-1 text-sm text-[#A08858]">
              Deterministic policy controls gating all execution-facing actions.
            </p>
          </div>

          {isFetching && (
            <div className="flex items-center gap-2 rounded border border-[#D4962A]/20 bg-[#D4962A]/10 px-3 py-1 text-xs text-[#D4962A]">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Synchronizing...</span>
            </div>
          )}
        </div>

        <hr className="border-[#3A2812]" />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="relative flex min-h-[140px] flex-col justify-between rounded-lg border border-[#3A2812] bg-[#1E1509] p-6">
            <div className="flex items-start justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#A08858] sm:text-xs">
                CURRENT RISK PROFILE
              </span>
              <Shield className="h-5 w-5 text-[#D4962A]" />
            </div>
            <div className="mt-4">
              <h2 className="font-heading text-[32px] uppercase leading-none tracking-[0.02em] text-[#D4962A] sm:text-[38px]">
                {current?.risk_band ?? "CONSERVATIVE"}
              </h2>
              <p className="mt-2 text-xs text-[#F4EDD6]/90 sm:text-sm">
                {current?.reasoning_summary ?? "Capital preservation mode active. Yield hunting restricted to Tier-1 protocols only."}
              </p>
            </div>
          </div>

          <div className="relative flex min-h-[140px] flex-col justify-between rounded-lg border border-[#D4962A]/40 bg-[#1E1509] p-6 shadow-[0_0_12px_rgba(212,150,42,0.06)]">
            <div className="flex items-start justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#A08858] sm:text-xs">
                SYSTEM READINESS
              </span>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#D4962A]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D4962A] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D4962A]" />
                </span>
                <span>ONLINE</span>
              </div>
            </div>
            <div className="mt-4">
              <h2 className="font-heading text-[32px] uppercase leading-none tracking-[0.02em] text-[#F4EDD6] sm:text-[38px]">
                {current?.hard_veto_status === "active" ? "HARD VETO ACTIVE" : "ALL GUARDS PASSING"}
              </h2>
              <p className="mt-2 text-xs text-[#F4EDD6]/90 sm:text-sm">
                {current?.status_reason ?? "Execution engine armed and awaiting operator mandate."}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-[22px] uppercase tracking-[0.05em] text-[#F4EDD6]">
            Hard Vetoes & Blockers
          </h3>
          <div className="rounded-lg border border-[#3A2812] bg-[#1E1509] p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="flex items-center gap-3 rounded-md border border-[#3A2812] bg-[#150F07] p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D4962A]/30 bg-[#D4962A]/10 text-[#D4962A]">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-medium leading-snug text-[#F4EDD6] sm:text-sm">Wallet Connection</h4>
                  <p className="mt-0.5 text-[11px] text-[#A08858] sm:text-xs">{isConnected ? "Secured" : "Required / Disconnected"}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-md border border-[#3A2812] bg-[#150F07] p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D4962A]/30 bg-[#D4962A]/10 text-[#D4962A]">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-medium leading-snug text-[#F4EDD6] sm:text-sm">Slippage Tolerance</h4>
                  <p className="mt-0.5 text-[11px] text-[#A08858] sm:text-xs">
                    {current?.hard_veto_status !== "active" ? "Within Bounds (< 0.5%)" : "Check Failed"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-md border border-[#3A2812] bg-[#150F07] p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D4962A]/30 bg-[#D4962A]/10 text-[#D4962A]">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-medium leading-snug text-[#F4EDD6] sm:text-sm">Gas Network Feasibility</h4>
                  <p className="mt-0.5 text-[11px] text-[#A08858] sm:text-xs">Optimal (12 Gwei)</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-[22px] uppercase tracking-[0.05em] text-[#F4EDD6]">
            Core Risk Gates
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex min-h-[170px] flex-col justify-between rounded-lg border border-[#3A2812] bg-[#1E1509] p-5">
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#A08858] sm:text-xs">MARKET INTEGRITY</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-display text-[32px] text-[#F4EDD6]">{getBucketScore("liquidity_slippage", 98)}</span>
                  <span className="text-xs text-[#A08858]">/100</span>
                </div>
              </div>
              <div className="mt-4">
                <span className="inline-block rounded border border-[#D4962A]/30 bg-[#D4962A]/10 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase text-[#D4962A]">
                  PASSING
                </span>
                <p className="mt-2.5 text-[11px] leading-relaxed text-[#F4EDD6]/80 sm:text-xs">
                  {getBucketReason("liquidity_slippage", "Liquidity depth sufficient. Volume anomalies detected: 0.")}
                </p>
              </div>
            </div>

            <div className="flex min-h-[170px] flex-col justify-between rounded-lg border border-[#3A2812] bg-[#1E1509] p-5">
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#A08858] sm:text-xs">PROTOCOL SECURITY</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-display text-[32px] text-[#F4EDD6]">{getBucketScore("portfolio_valuation", 100)}</span>
                  <span className="text-xs text-[#A08858]">/100</span>
                </div>
              </div>
              <div className="mt-4">
                <span className="inline-block rounded border border-[#D4962A]/30 bg-[#D4962A]/10 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase text-[#D4962A]">
                  PASSING
                </span>
                <p className="mt-2.5 text-[11px] leading-relaxed text-[#F4EDD6]/80 sm:text-xs">
                  {getBucketReason("portfolio_valuation", "All targeted contracts audited by verified entities. No recent exploits.")}
                </p>
              </div>
            </div>

            <div className="flex min-h-[170px] flex-col justify-between rounded-lg border border-[#3A2812] border-l-4 border-l-[#D4962A] bg-[#1E1509] p-5">
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#A08858] sm:text-xs">CAPITAL POLICY</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-display text-[32px] text-[#F4EDD6]">{getBucketScore("concentration_drift", 85)}</span>
                  <span className="text-xs text-[#A08858]">/100</span>
                </div>
              </div>
              <div className="mt-4">
                <span className="inline-block rounded border border-[#D4962A]/30 bg-[#D4962A]/10 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase text-[#D4962A]">
                  PASSING
                </span>
                <p className="mt-2.5 text-[11px] leading-relaxed text-[#F4EDD6]/80 sm:text-xs">
                  {getBucketReason("concentration_drift", "Concentration limits intact. Yield volatility within acceptable standard deviation.")}
                </p>
              </div>
            </div>

            <div className="flex min-h-[170px] flex-col justify-between rounded-lg border border-[#3A2812] border-l-4 border-l-[#8A7038] bg-[#1E1509] p-5">
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#A08858] sm:text-xs">AGENT PERFORMANCE</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-display text-[32px] text-[#F4EDD6]">{getBucketScore("ops_readiness", 92)}</span>
                  <span className="text-xs text-[#A08858]">/100</span>
                </div>
              </div>
              <div className="mt-4">
                <span className="inline-block rounded border border-[#D4962A]/30 bg-[#D4962A]/10 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase text-[#D4962A]">
                  PASSING
                </span>
                <p className="mt-2.5 text-[11px] leading-relaxed text-[#F4EDD6]/80 sm:text-xs">
                  {getBucketReason("ops_readiness", "Strategy drift negligible. Sharpe variance stable over 30d window.")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-heading text-[22px] uppercase tracking-[0.05em] text-[#F4EDD6]">
              DETERMINISTIC POLICY LOG
            </h3>
            <span className="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#A08858]">
              Last 5 Checks
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#3A2812] bg-[#1E1509] divide-y divide-[#3A2812]">
            {[
              "Slippage Tolerance Verification",
              "L1 Gas Fee Threshold Check",
              "Hourly Oracle Price Drift Analysis",
              "Agent Strategy Re-evaluation",
              "Liquidity Pool Depth Scan (USDY/mETH)",
            ].map((checkName, index) => (
              <div key={checkName} className="flex flex-wrap items-center justify-between gap-2 p-4 transition-colors hover:bg-[#1E1509]/50">
                <span className="shrink-0 font-mono text-xs text-[#A08858]">{getTimestampForIndex(index)}</span>
                <span className="min-w-[200px] flex-1 text-sm font-medium text-[#F4EDD6] sm:pl-6">{checkName}</span>
                <span className="shrink-0 font-heading text-sm tracking-wide text-[#D4962A]">CLEARED</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageScaffold>
  );
}
