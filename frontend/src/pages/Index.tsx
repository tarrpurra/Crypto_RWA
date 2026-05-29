import { Link } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  DatabaseZap,
  FileCheck2,
  PieChart,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { MetricPanel, PageScaffold, StatusPill, toneFromStatus } from "@/components/rwa/PageScaffold";
import { WalletScopeControl } from "@/components/rwa/WalletScopeControl";
import { useAllocationRecommendation } from "@/hooks/useAllocation";
import { useMarketIngestionStatus } from "@/hooks/useMarket";
import { useCurrentPortfolio } from "@/hooks/usePortfolio";
import { useCurrentRisk } from "@/hooks/useRisk";
import { useChainStatus, useSystemHealth } from "@/hooks/useSystem";

const workflow = [
  {
    title: "Portfolio",
    detail: "Read balances, valuations, and target drift.",
    to: "/portfolio",
    icon: PieChart,
  },
  {
    title: "Risk",
    detail: "Score current state and block unsafe recommendations.",
    to: "/risk",
    icon: ShieldCheck,
  },
  {
    title: "Allocation",
    detail: "Explain advisory recommendations and rebalance intent.",
    to: "/allocation",
    icon: BarChart3,
  },
  {
    title: "Approvals",
    detail: "Prepare human review before execution-facing proposals.",
    to: "/approvals",
    icon: FileCheck2,
  },
];

const dataSources = [
  "Mantle chain status",
  "RWA asset registry",
  "Pyth and Ondo oracle freshness",
  "AGNI and Merchant Moe route quotes",
  "Portfolio snapshots",
  "Risk assessment history",
];

function StatusRow({
  label,
  value,
  detail,
  ok,
}: {
  label: string;
  value: string;
  detail: string;
  ok: boolean;
}) {
  const Icon = ok ? CheckCircle2 : TriangleAlert;
  return (
    <div className="flex items-start justify-between gap-3 border border-border bg-surface-2 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-1 text-xs leading-4 text-muted-foreground">{detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
        <Icon className={ok ? "h-4 w-4 text-success" : "h-4 w-4 text-warning"} />
      </div>
    </div>
  );
}

const Index = () => {
  const healthQuery = useSystemHealth();
  const chainQuery = useChainStatus();
  const portfolioQuery = useCurrentPortfolio();
  const riskQuery = useCurrentRisk();
  const allocationQuery = useAllocationRecommendation();
  const marketQuery = useMarketIngestionStatus();

  const health = healthQuery.data;
  const chain = chainQuery.data;
  const portfolio = portfolioQuery.data;
  const risk = riskQuery.data;
  const allocation = allocationQuery.data;
  const market = marketQuery.data;
  const hardVetoActive = risk?.hard_veto_status === "active";
  const portfolioReady = portfolio?.status === "ok" && Boolean(portfolio.total_value_usd);
  const recommendationPaused = allocation?.decision.recommended_action === "PAUSE";

  return (
    <div data-testid="overview-page" className="flex min-h-screen flex-1 flex-col">
      <PageScaffold
        eyebrow="RWA Agent"
        title="Dashboard"
        description="The operating surface for AIxRWA: portfolio analytics, risk gates, market data quality, and advisory allocation decisions."
      >
        <WalletScopeControl />

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
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <MetricPanel
            label="Chain"
            value={chain?.latest_block ? `Block ${chain.latest_block}` : chain?.status_label ?? "Loading"}
            detail={chain?.status_reason ?? "Reading /chain/status and configured contract states."}
            tone={toneFromStatus(chain?.status)}
          />
          <MetricPanel
            label="Recommendation"
            value={allocation?.decision.recommended_action ?? allocation?.status_label ?? "Loading"}
            detail={allocation?.status_reason ?? "Reading /allocation/recommendation."}
            tone={allocation?.decision.recommended_action === "PAUSE" ? "blocked" : toneFromStatus(allocation?.status)}
          />
        </div>

        <section className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="terminal-panel p-4">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <p className="terminal-label text-primary">Workflow</p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">
                  Risk-gated advisory loop
                </h2>
              </div>
              <StatusPill tone={hardVetoActive || recommendationPaused ? "blocked" : "degraded"}>
                {hardVetoActive ? "risk veto" : recommendationPaused ? "paused" : "live APIs"}
              </StatusPill>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {workflow.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex min-h-32 flex-col justify-between border border-border bg-surface-2 p-4 transition-colors hover:border-primary"
                >
                  <div className="flex items-start justify-between gap-3">
                    <item.icon className="h-5 w-5 text-primary" />
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="terminal-panel p-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <DatabaseZap className="h-5 w-5 text-primary" />
              <div>
                <p className="terminal-label text-primary">Data Quality</p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">Readiness checks</h2>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <StatusRow
                label="API health"
                value={health?.status_label ?? "-"}
                detail={health?.status_reason ?? "Health response has not loaded."}
                ok={health?.status === "ok"}
              />
              <StatusRow
                label="Chain RPC"
                value={chain?.status_label ?? "-"}
                detail={chain?.rpc_error ?? chain?.status_reason ?? "Chain status has not loaded."}
                ok={chain?.status === "ok"}
              />
              <StatusRow
                label="Portfolio valuation"
                value={portfolio?.status_label ?? "-"}
                detail={portfolio?.status_reason ?? "Portfolio response has not loaded."}
                ok={portfolioReady}
              />
              <StatusRow
                label="Risk gate"
                value={risk?.hard_veto_status ?? "-"}
                detail={risk?.status_reason ?? "Risk response has not loaded."}
                ok={Boolean(risk) && !hardVetoActive}
              />
              <StatusRow
                label="Market ingestion"
                value={market?.status_label ?? "-"}
                detail={market?.status_reason ?? "Market ingestion response has not loaded."}
                ok={market?.status === "ok"}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="terminal-panel p-4">
            <p className="terminal-label text-primary">Decision Context</p>
            <div className="mt-4 grid gap-2">
              <StatusRow
                label="Recommended action"
                value={allocation?.decision.recommended_action ?? "-"}
                detail={allocation?.decision.reasoning ?? allocation?.status_reason ?? "Allocation recommendation has not loaded."}
                ok={Boolean(allocation) && !recommendationPaused}
              />
              <StatusRow
                label="Human approval"
                value={risk?.required_human_approval_status ?? "-"}
                detail="Execution-facing paths remain blocked unless this status and policy gates allow action."
                ok={risk?.required_human_approval_status === "not_required"}
              />
            </div>
          </div>

          <div className="terminal-panel p-4">
            <p className="terminal-label text-primary">Data Sources</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {dataSources.map((source) => (
                <div
                  key={source}
                  className="flex items-center justify-between gap-3 border border-border bg-surface-2 px-3 py-2"
                >
                  <span className="text-sm text-foreground">{source}</span>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </PageScaffold>
    </div>
  );
};

export default Index;
