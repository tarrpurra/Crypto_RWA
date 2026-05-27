import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { useLatestPrices, useMarketIngestionStatus, useMarketRoutes, useUsdyOracle } from "@/hooks/useMarket";

export default function MarketData() {
  const ingestionQuery = useMarketIngestionStatus();
  const pricesQuery = useLatestPrices();
  const oracleQuery = useUsdyOracle();
  const routesQuery = useMarketRoutes();
  const ingestion = ingestionQuery.data;
  const prices = pricesQuery.data;
  const oracle = oracleQuery.data;
  const routes = routesQuery.data;

  return (
    <PageScaffold
      eyebrow="Market Data"
      title="Market"
      description="Oracle freshness, USDY redemption source status, route quotes, and ingestion health."
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricPanel
          label="Ingestion"
          value={ingestion?.status_label ?? "Loading"}
          detail={ingestion?.status_reason ?? "Reading /market/ingestion/status."}
          tone={toneFromStatus(ingestion?.status)}
        />
        <MetricPanel
          label="Prices"
          value={`${prices?.prices.length ?? 0} Assets`}
          detail={prices?.status_reason ?? "Reading /market/prices/latest."}
          tone={toneFromStatus(prices?.status)}
        />
        <MetricPanel
          label="USDY Oracle"
          value={oracle?.status ?? "Loading"}
          detail={oracle?.price ? `Oracle price ${oracle.price}` : "Reading /market/oracles/usdy."}
          tone={oracle?.status === "ok" ? "ready" : "degraded"}
        />
        <MetricPanel
          label="Routes"
          value={`${routes?.routes.length ?? 0} Routes`}
          detail={routes?.status_reason ?? "Reading /market/routes."}
          tone={toneFromStatus(routes?.status)}
        />
      </div>
      <section className="terminal-panel p-4">
        <p className="terminal-label text-primary">Latest Prices</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {(prices?.prices ?? []).map((price) => (
            <div key={price.snapshot_id} className="border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-foreground">{price.asset_symbol}</p>
                <span className="font-mono text-sm text-muted-foreground">{price.price_usd ?? "-"}</span>
              </div>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">{price.status_reason}</p>
            </div>
          ))}
          {!prices?.prices?.length && (
            <p className="text-sm text-muted-foreground">No price snapshots returned yet.</p>
          )}
        </div>
      </section>
    </PageScaffold>
  );
}
