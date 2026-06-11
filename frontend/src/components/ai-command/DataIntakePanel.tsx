import { CheckCircle2, AlertCircle, Clock, XCircle } from "lucide-react";

interface DataSource {
  label: string;
  status: "fresh" | "stale" | "warning" | "failed";
}

interface DataIntakePanelProps {
  sources: DataSource[];
}

const statusConfig = {
  fresh: { icon: CheckCircle2, color: "text-emerald-400", label: "Fresh" },
  stale: { icon: Clock, color: "text-yellow-500", label: "Stale" },
  warning: { icon: AlertCircle, color: "text-orange-500", label: "Warning" },
  failed: { icon: XCircle, color: "text-red-500", label: "Failed" },
};

export function DataIntakePanel({ sources }: DataIntakePanelProps) {
  return (
    <section className="rounded-xl border border-white/10 bg-black/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-yellow-500">Data Intake</p>
        <span className="text-[10px] text-white/40">{sources.filter((s) => s.status === "fresh").length}/{sources.length} fresh</span>
      </div>
      <div className="space-y-2">
        {sources.map((source) => {
          const cfg = statusConfig[source.status];
          const Icon = cfg.icon;
          return (
            <div
              key={source.label}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
            >
              <span className="text-sm text-white/70">{source.label}</span>
              <div className="flex items-center gap-2">
                <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
