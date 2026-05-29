import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { WalletScopeControl } from "@/components/rwa/WalletScopeControl";
import { useCurrentPortfolio, usePortfolioSnapshots } from "@/hooks/usePortfolio";

export default function Portfolio() {
  const currentQuery = useCurrentPortfolio();
  const snapshotsQuery = usePortfolioSnapshots(10);
  const current = currentQuery.data;
  const snapshots = snapshotsQuery.data;

  return (
    <PageScaffold
      eyebrow="Portfolio Analytics"
      title="Portfolio"
      description="Current RWA holdings, valuation quality, target drift, and historical snapshots will live here."
    >
      <WalletScopeControl />
      <div className="grid gap-3 md:grid-cols-3">
        <MetricPanel
          label="Current Snapshot"
          value={current?.total_value_usd ? `$${current.total_value_usd}` : current?.status_label ?? "Loading"}
          detail={current?.status_reason ?? "Reading /portfolio/current."}
          tone={toneFromStatus(current?.status)}
        />
        <MetricPanel
          label="Target Drift"
          value={`${current?.positions?.filter((position) => position.weight_drift !== null).length ?? 0} Assets`}
          detail="Positions with target weights expose drift and valuation status as backend data becomes available."
          tone={current?.positions?.length ? toneFromStatus(current.status) : "degraded"}
        />
        <MetricPanel
          label="Snapshots"
          value={`${snapshots?.snapshots.length ?? 0} Recent`}
          detail={snapshots?.status_reason ?? "Reading /portfolio/snapshots."}
          tone={toneFromStatus(snapshots?.status)}
        />
      </div>
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
              {(current?.positions ?? []).map((position) => (
                <tr key={`${position.asset_key}-${position.chain_id}`} className="border-b border-border/60">
                  <td className="py-2 pr-3 text-foreground">{position.asset_symbol}</td>
                  <td className="py-2 pr-3 font-mono text-muted-foreground">{position.balance ?? "-"}</td>
                  <td className="py-2 pr-3 font-mono text-muted-foreground">{position.price_usd ?? "-"}</td>
                  <td className="py-2 pr-3 font-mono text-muted-foreground">{position.value_usd ?? "-"}</td>
                  <td className="py-2 pr-3 font-mono text-muted-foreground">{position.weight ?? "-"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{position.status_code}</td>
                </tr>
              ))}
              {!current?.positions?.length && (
                <tr>
                  <td className="py-4 text-muted-foreground" colSpan={6}>
                    {current?.status_reason ?? "No portfolio positions loaded yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PageScaffold>
  );
}
