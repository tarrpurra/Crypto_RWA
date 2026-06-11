import { CheckCircle2, Circle, Clock, ArrowRight } from "lucide-react";

interface LogEntry {
  time: string;
  event: string;
  status: "done" | "pending" | "active";
}

interface ExecutionTimelineProps {
  logs: LogEntry[];
}

export function ExecutionTimeline({ logs }: ExecutionTimelineProps) {
  return (
    <section className="rounded-xl border border-white/10 bg-black/40 p-5">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.18em] text-yellow-500">Decision Log</p>
      </div>
      <div className="space-y-0">
        {logs.map((entry, i) => {
          const Icon = entry.status === "done" ? CheckCircle2 : entry.status === "active" ? ArrowRight : Circle;
          return (
            <div key={i} className="flex items-start gap-3 border-l-2 border-white/10 pb-3 pl-4 last:border-transparent last:pb-0">
              <Icon
                className={`mt-0.5 h-3.5 w-3.5 ${entry.status === "done" ? "text-emerald-400" : entry.status === "active" ? "text-yellow-400" : "text-white/30"}`}
              />
              <div className="flex-1">
                <p className={`text-sm ${entry.status === "done" ? "text-white/60" : entry.status === "active" ? "text-yellow-400" : "text-white/30"}`}>
                  {entry.event}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-white/30">{entry.time}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
