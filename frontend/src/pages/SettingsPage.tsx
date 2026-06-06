import { Download } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { useChainStatus, useServiceStatus, useSystemHealth } from "@/hooks/useSystem";
import { useSettings, useUpdateSettings } from "@/hooks/useSystem";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";
import { useInvestmentScope } from "@/hooks/useInvestmentScope";
import { useInvestmentReport } from "@/hooks/useReports";
import { reportsApi } from "@/lib/api/reports";
import { downloadTextFile } from "@/lib/download";

const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000");
const appEnv = /localhost|127\.0\.0\.1/i.test(apiBaseUrl) ? "Local" : "Remote";

export default function SettingsPage() {
  const healthQuery = useSystemHealth();
  const statusQuery = useServiceStatus();
  const chainQuery = useChainStatus();
  const settingsQuery = useSettings();
  const updateSettings = useUpdateSettings();
  const { effectiveWalletAddress } = usePortfolioWallet();
  const { scope } = useInvestmentScope();
  const reportQuery = useInvestmentReport();
  const health = healthQuery.data;
  const status = statusQuery.data;
  const chain = chainQuery.data;
  const settings = settingsQuery.data;
  const report = reportQuery.data;
  const aiDecisionMakerEnabled = settings?.ai_decision_maker_enabled ?? false;

  const networkLabel =
    status?.target_chain === "mantle_sepolia" || chain?.target_chain === "mantle_sepolia"
      ? "Mantle Sepolia Testnet"
      : status?.target_chain === "mantle_mainnet" || chain?.target_chain === "mantle_mainnet"
        ? "Mantle Mainnet"
        : status?.runtime_mode ?? appEnv;

  const handleAiAccessChange = (enabled: boolean) => {
    updateSettings.mutate({ ai_decision_maker_enabled: enabled });
  };

  const handleDownloadReport = async () => {
    try {
      const freshReport = await reportsApi.latest(
        effectiveWalletAddress,
        scope
          ? {
              deposit_asset_symbol: scope.depositAssetSymbol,
              deposit_amount: scope.depositAmount,
              risk_profile: scope.riskProfile,
              allocation_mode: scope.allocationMode,
            }
          : null,
      );
      downloadTextFile(freshReport.markdown, freshReport.download_name, "text/markdown;charset=utf-8");
      toast.success("Investment report downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download the investment report.");
    }
  };

  return (
    <PageScaffold
      eyebrow="Operations"
      title="Settings"
      description="Environment visibility, diagnostics, and runtime configuration for the RWA agent frontend."
    >
      <div className="grid gap-3 md:grid-cols-4">
        <MetricPanel
          label="API Base URL"
          value={apiBaseUrl}
          detail="Frontend requests use this backend origin. Phase 2 adds typed diagnostics around this connection."
          tone="ready"
        />
        <MetricPanel
          label="Environment"
          value={networkLabel}
          detail={status?.status_reason ?? "Live, local, and simulation-only states are shown explicitly throughout the app."}
          tone={toneFromStatus(status?.status)}
        />
        <MetricPanel
          label="Backend Health"
          value={health?.status_label ?? "Loading"}
          detail={health?.status_reason ?? "Reading /health from the backend."}
          tone={toneFromStatus(health?.status)}
        />
        <MetricPanel
          label="AI Access"
          value={aiDecisionMakerEnabled ? "Full access AI" : "Recommendation only"}
          detail="Recommendation only keeps approvals manual. Full access AI auto-approves and executes linked proposals."
          tone={aiDecisionMakerEnabled ? "ready" : "neutral"}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <MetricPanel
          label="Chain"
          value={chain?.chain_id ? String(chain.chain_id) : chain?.status_label ?? "Loading"}
          detail={
            chain?.rpc_error
            ?? chain?.status_reason
            ?? "Reading /chain/status."
          }
          tone={toneFromStatus(chain?.status)}
        />
        <MetricPanel
          label="Contracts"
          value={`${Object.values(status?.configured_contracts ?? {}).filter(Boolean).length} Configured`}
          detail="Configured contract addresses are read from /status and should match the active environment."
          tone={Object.values(status?.configured_contracts ?? {}).some(Boolean) ? "ready" : "neutral"}
        />
      </div>

      <section className="terminal-panel p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="terminal-label text-primary">AI access</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Recommendation only keeps the operator in the loop. Full access AI can approve linked proposals and execute the flow automatically.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Recommendation only</span>
            <Switch checked={aiDecisionMakerEnabled} disabled={updateSettings.isPending} onCheckedChange={handleAiAccessChange} />
            <span className="text-xs text-muted-foreground">Full access AI</span>
          </div>
        </div>
      </section>

      <section className="terminal-panel p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="terminal-label text-primary">Detailed report</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Download a markdown report that summarizes the wallet snapshot, risk view, allocation recommendation, market health, and execution queue.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              The report refreshes on demand and is generated from the live backend state.
            </p>
            {report?.data_gaps?.length ? (
              <div className="mt-3 rounded border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Missing data we could not fetch</p>
                <ul className="mt-2 space-y-1">
                  {report.data_gaps.map((gap) => (
                    <li key={gap} className="break-words">
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-sm text-success">No report data gaps are currently flagged.</p>
            )}
          </div>
          <Button onClick={handleDownloadReport} disabled={updateSettings.isPending || reportQuery.isFetching} className="md:self-start">
            <Download className="mr-2 h-4 w-4" />
            {reportQuery.isFetching ? "Generating report..." : "Download report"}
          </Button>
        </div>
      </section>

      <section className="terminal-panel p-4">
        <p className="terminal-label text-primary">Configured Contracts</p>
        <div className="mt-3 grid gap-2">
          {Object.entries(status?.configured_contracts ?? {}).map(([key, value]) => (
            <div key={key} className="grid gap-2 border border-border bg-surface-2 px-3 py-2 text-sm md:grid-cols-[180px_1fr]">
              <span className="font-medium text-foreground">{key}</span>
              <span className="break-all font-mono text-muted-foreground">{value ?? "not configured"}</span>
            </div>
          ))}
          {!status?.configured_contracts && (
            <p className="text-sm text-muted-foreground">Service status has not loaded yet.</p>
          )}
        </div>
      </section>
    </PageScaffold>
  );
}
