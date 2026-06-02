import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { useChainStatus, useServiceStatus, useSystemHealth } from "@/hooks/useSystem";

const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000");
const appEnv = /localhost|127\.0\.0\.1/i.test(apiBaseUrl) ? "Local" : "Remote";

export default function SettingsPage() {
  const healthQuery = useSystemHealth();
  const statusQuery = useServiceStatus();
  const chainQuery = useChainStatus();
  const health = healthQuery.data;
  const status = statusQuery.data;
  const chain = chainQuery.data;

  return (
    <PageScaffold
      eyebrow="Operations"
      title="Settings"
      description="Environment visibility, diagnostics, and runtime configuration for the RWA agent frontend."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <MetricPanel
          label="API Base URL"
          value={apiBaseUrl}
          detail="Frontend requests use this backend origin. Phase 2 adds typed diagnostics around this connection."
          tone="ready"
        />
        <MetricPanel
          label="Environment"
          value={status?.runtime_mode ?? appEnv}
          detail={status?.status_reason ?? "Live, local, and simulation-only states are shown explicitly throughout the app."}
          tone={toneFromStatus(status?.status)}
        />
        <MetricPanel
          label="Backend Health"
          value={health?.status_label ?? "Loading"}
          detail={health?.status_reason ?? "Reading /health from the backend."}
          tone={toneFromStatus(health?.status)}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <MetricPanel
          label="Chain"
          value={chain?.chain_id ? String(chain.chain_id) : chain?.status_label ?? "Loading"}
          detail={chain?.rpc_error ?? chain?.status_reason ?? "Reading /chain/status."}
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
