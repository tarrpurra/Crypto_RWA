import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { AISidePanel } from "@/components/dashboard/AISidePanel";
import { PortfolioAllocationChart } from "@/components/dashboard/PortfolioAllocationChart";
import { RiskBucketChart } from "@/components/dashboard/RiskBucketChart";
import { WalletScopeControl } from "@/components/rwa/WalletScopeControl";
import { useMarketIngestionStatus } from "@/hooks/useMarket";
import { useCurrentPortfolio, usePortfolioSnapshots } from "@/hooks/usePortfolio";
import { useCurrentRisk } from "@/hooks/useRisk";
import { useSystemHealth } from "@/hooks/useSystem";

const Index = () => {
  const healthQuery = useSystemHealth();
  const portfolioQuery = useCurrentPortfolio();
  const riskQuery = useCurrentRisk();
  const marketQuery = useMarketIngestionStatus();
  const snapshotsQuery = usePortfolioSnapshots(10);

  const health = healthQuery.data;
  const portfolio = portfolioQuery.data;
  const risk = riskQuery.data;
  const market = marketQuery.data;
  const snapshots = snapshotsQuery.data;

  return (
    <div data-testid="overview-page" className="flex min-h-screen flex-1 flex-col">
      <PageScaffold
        eyebrow="AIYield"
        title="Dashboard"
        description="AI-powered yield optimization with real-time risk management for RWA portfolios."
      >
        <WalletScopeControl />
        {/* Top Metrics Row */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricPanel
            label="Agent Mode"
            value={health?.runtime_mode ?? "Loading"}
            detail={health?.status_reason ?? "Reading /health from the RWA agent service."}
            tone={toneFromStatus(health?.status)}
          />
          <MetricPanel
            label="Portfolio"
            value={portfolio?.total_value_usd ? `$${portfolio.total_value_usd}` : portfolio?.status_label ?? "Loading"}
            detail={portfolio?.status_reason ?? "Reading /portfolio/current with explicit missing-data handling."}
            tone={toneFromStatus(portfolio?.status)}
          />
          <MetricPanel
            label="Target Drift"
            value={`${portfolio?.positions?.filter((p) => p.weight_drift !== null).length ?? 0} Assets`}
            detail="Positions with target weights expose drift and valuation status as backend data becomes available."
            tone={portfolio?.positions?.length ? toneFromStatus(portfolio?.status) : "neutral"}
          />
          <MetricPanel
            label="Risk"
            value={risk ? `${risk.risk_band} / ${risk.risk_score}` : "Loading"}
            detail={risk?.reasoning_summary ?? "Reading /risk/current before displaying allocation decisions."}
            tone={risk?.hard_veto_status === "active" ? "blocked" : toneFromStatus(risk?.status)}
          />
          <MetricPanel
            label="Market Data"
            value={market?.status_label ?? "Loading"}
            detail={market?.status_reason ?? "Reading /market/ingestion/status."}
            tone={toneFromStatus(market?.status)}
          />
          <MetricPanel
            label="Snapshots"
            value={`${snapshots?.snapshots.length ?? 0} Recent`}
            detail={snapshots?.status_reason ?? "Reading /portfolio/snapshots."}
            tone={toneFromStatus(snapshots?.status)}
          />
        </div>

        {/* Charts row */}
        <section className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
          <PortfolioAllocationChart portfolio={portfolio} isLoading={portfolioQuery.isLoading} />
          <RiskBucketChart risk={risk} isLoading={riskQuery.isLoading} />
        </section>

        {/* Positions table */}
        <section className="terminal-panel p-4">
          <p className="terminal-label text-primary">Positions</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Asset</th>
                  <th className="py-2 pr-3 font-medium">Balance</th>
                  <th className="py-2 pr-3 font-medium">Price</th>
                  <th className="py-2 pr-3 font-medium">Value</th>
                  <th className="py-2 pr-3 font-medium">Weight</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(portfolio?.positions ?? []).map((position) => (
                  <tr key={`${position.asset_key}-${position.chain_id}`} className="border-b border-border/60">
                    <td className="py-2 pr-3 text-foreground">{position.asset_symbol}</td>
                    <td className="py-2 pr-3 font-mono text-muted-foreground">{position.balance ?? "-"}</td>
                    <td className="py-2 pr-3 font-mono text-muted-foreground">{position.price_usd ?? "-"}</td>
                    <td className="py-2 pr-3 font-mono text-muted-foreground">{position.value_usd ?? "-"}</td>
                    <td className="py-2 pr-3 font-mono text-muted-foreground">{position.weight ?? "-"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{position.status_code === "DATA_FRESH" ? "Active" : position.status_code}</td>
                  </tr>
                ))}
                {!portfolio?.positions?.length && (
                  <tr>
                    <td className="py-4 text-muted-foreground" colSpan={6}>
                      No positions available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </PageScaffold>
      <AISidePanel />
    </div>
  );
};

export default Index;
