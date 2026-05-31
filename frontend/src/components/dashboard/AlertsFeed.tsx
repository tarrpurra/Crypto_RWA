import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useArbBots, useArbRates } from "@/hooks/useArb";
import {
  useAuthStatus,
  useSystemHealth,
  useSystemWorkerHealth,
} from "@/hooks/useSystem";
import { useTpslSessions } from "@/hooks/useTpsl";

type AlertLevel = "warning" | "success" | "error" | "info";

type AlertItem = {
  type: AlertLevel;
  msg: string;
  updatedAt?: number;
};

const iconMap = {
  warning: <AlertTriangle className="w-3.5 h-3.5 text-warning" />,
  success: <CheckCircle2 className="w-3.5 h-3.5 text-success" />,
  error: <XCircle className="w-3.5 h-3.5 text-danger" />,
  info: <Info className="w-3.5 h-3.5 text-primary" />,
};

function ageLabel(updatedAt?: number): string {
  if (!updatedAt) return "-";
  const seconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function AlertsFeed() {
  const healthQuery = useSystemHealth();
  const workerHealthQuery = useSystemWorkerHealth();
  const authQuery = useAuthStatus();
  const ratesQuery = useArbRates();
  const botsQuery = useArbBots();
  const sessionsQuery = useTpslSessions();

  const runningBots = (botsQuery.data?.bots ?? []).filter(
    (bot) => bot.status === "running",
  ).length;
  const activeSessions = (sessionsQuery.data?.sessions ?? []).filter(
    (session) => session.status === "active",
  ).length;
  const symbolCount = Object.keys(ratesQuery.data?.rates ?? {}).length;

  const alerts: AlertItem[] = [];

  if (healthQuery.isError) {
    alerts.push({
      type: "error",
      msg: "API health check failed.",
      updatedAt: healthQuery.errorUpdatedAt,
    });
  } else if (healthQuery.data?.status === "ok") {
    alerts.push({
      type: "success",
      msg: "API health check passed.",
      updatedAt: healthQuery.dataUpdatedAt,
    });
  }

  if (workerHealthQuery.isError) {
    alerts.push({
      type: "warning",
      msg: "Worker health endpoint unavailable.",
      updatedAt: workerHealthQuery.errorUpdatedAt,
    });
  } else if (workerHealthQuery.data) {
    alerts.push({
      type: workerHealthQuery.data.status === "ok" ? "success" : "warning",
      msg: `Worker health: ${workerHealthQuery.data.status} (${workerHealthQuery.data.worker_count} workers).`,
      updatedAt: workerHealthQuery.dataUpdatedAt,
    });
  }

  if (authQuery.isError) {
    alerts.push({
      type: "warning",
      msg: "Auth status endpoint unavailable.",
      updatedAt: authQuery.errorUpdatedAt,
    });
  } else if (authQuery.data) {
    alerts.push({
      type: "info",
      msg: `Auth required: ${authQuery.data.auth_required ? "yes" : "no"}.`,
      updatedAt: authQuery.dataUpdatedAt,
    });
  }

  if (ratesQuery.isSuccess) {
    alerts.push({
      type: "info",
      msg: `Funding rates active for ${symbolCount} symbols.`,
      updatedAt: ratesQuery.dataUpdatedAt,
    });
  }

  if (runningBots > 0) {
    alerts.push({
      type: "success",
      msg: `${runningBots} arbitrage bot${runningBots === 1 ? "" : "s"} running.`,
      updatedAt: botsQuery.dataUpdatedAt,
    });
  } else if (botsQuery.isSuccess) {
    alerts.push({
      type: "warning",
      msg: "No arbitrage bots are currently running.",
      updatedAt: botsQuery.dataUpdatedAt,
    });
  }

  if (activeSessions > 0) {
    alerts.push({
      type: "info",
      msg: `${activeSessions} active TP/SL session${activeSessions === 1 ? "" : "s"}.`,
      updatedAt: sessionsQuery.dataUpdatedAt,
    });
  }

  const visibleAlerts = alerts.slice(0, 8);

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Alerts</h3>
        <span className="text-2xs text-muted-foreground">Live</span>
      </div>
      <div className="max-h-48 overflow-y-auto scrollbar-thin">
        {visibleAlerts.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            No events yet.
          </div>
        ) : (
          visibleAlerts.map((alert, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 px-4 py-2.5 border-b border-border/30 hover:bg-surface-2 transition-colors"
            >
              <div className="mt-0.5">{iconMap[alert.type]}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground/90 leading-relaxed">
                  {alert.msg}
                </p>
              </div>
              <span className="text-2xs text-muted-foreground whitespace-nowrap">
                {ageLabel(alert.updatedAt)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function SystemHealth() {
  const healthQuery = useSystemHealth();
  const workerHealthQuery = useSystemWorkerHealth();
  const authQuery = useAuthStatus();
  const ratesQuery = useArbRates();
  const botsQuery = useArbBots();
  const sessionsQuery = useTpslSessions();

  const runDiagnostics = async () => {
    await Promise.all([
      healthQuery.refetch(),
      workerHealthQuery.refetch(),
      authQuery.refetch(),
      ratesQuery.refetch(),
      botsQuery.refetch(),
      sessionsQuery.refetch(),
    ]);
  };

  const ratesCount = Object.keys(ratesQuery.data?.rates ?? {}).length;
  const runningBots = (botsQuery.data?.bots ?? []).filter(
    (bot) => bot.status === "running",
  ).length;
  const activeSessions = (sessionsQuery.data?.sessions ?? []).filter(
    (session) => session.status === "active",
  ).length;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">System Health</h3>
      </div>
      <div className="p-4 space-y-2.5">
        <HealthRow
          label="API Status"
          status={healthQuery.data?.status === "ok" ? "connected" : "error"}
          detail={ageLabel(healthQuery.dataUpdatedAt)}
        />
        <HealthRow
          label="Auth Status"
          status={authQuery.isError ? "error" : "connected"}
          detail={
            authQuery.data
              ? `required: ${authQuery.data.auth_required ? "yes" : "no"}`
              : "-"
          }
        />
        <HealthRow
          label="Worker Health"
          status={workerHealthQuery.data?.status === "ok" ? "connected" : "error"}
          detail={workerHealthQuery.data?.status ?? "-"}
        />
        <HealthRow
          label="Rate Polling"
          status={ratesQuery.isError ? "error" : "connected"}
          detail={ratesQuery.isSuccess ? `${ratesCount} symbols` : "-"}
        />
        <HealthRow
          label="Bot Sync"
          status={botsQuery.isError ? "error" : "connected"}
          detail={botsQuery.isSuccess ? `${runningBots} running` : "-"}
        />
        <HealthRow
          label="TP/SL Sync"
          status={sessionsQuery.isError ? "error" : "connected"}
          detail={sessionsQuery.isSuccess ? `${activeSessions} active` : "-"}
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-3 text-xs h-8"
          onClick={() => void runDiagnostics()}
        >
          <Activity className="w-3 h-3 mr-1.5" />
          Run Diagnostics
        </Button>
      </div>
    </div>
  );
}

function HealthRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: "connected" | "error";
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        {detail && <span className="text-2xs text-muted-foreground">{detail}</span>}
        <div
          className={`w-2 h-2 rounded-full ${
            status === "connected" ? "bg-success" : "bg-danger"
          }`}
        />
      </div>
    </div>
  );
}
