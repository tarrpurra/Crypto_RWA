import { Cpu } from "lucide-react";

interface AIStatusHeaderProps {
  mode: string;
  confidence: number;
  status: string;
  lastDecision: string;
}

const statusAnimations: Record<string, string> = {
  idle: "border-white/10",
  scanning: "border-yellow-500/40 animate-pulse",
  analyzing: "border-yellow-500/50 animate-pulse",
  "risk checking": "border-orange-500/40 animate-pulse",
  "proposal ready": "border-emerald-500/40",
  "waiting for approval": "border-blue-500/40 animate-pulse",
  executing: "border-emerald-500/60 animate-pulse",
  paused: "border-red-500/40",
};

export function AIStatusHeader({ mode, confidence, status, lastDecision }: AIStatusHeaderProps) {
  const statusKey = status.toLowerCase();
  const borderClass = statusAnimations[statusKey] ?? "border-white/10";

  return (
    <section className={`rounded-xl border bg-black/40 p-5 ${borderClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-yellow-500/30 bg-yellow-500/10">
            <Cpu className="h-5 w-5 text-yellow-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-white">YieldMind AI</span>
              <span className="flex h-2 w-2 rounded-full bg-emerald-500">
                <span className="h-2 w-2 animate-ping rounded-full bg-emerald-500" />
              </span>
            </div>
            <p className="text-xs text-white/50">
              Status: <span className="font-medium text-yellow-400">{status}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">Mode</p>
            <p className="font-mono text-sm text-white/80">{mode}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">Confidence</p>
            <p className="font-mono text-sm text-emerald-400">{Math.round(confidence * 100)}%</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">Last Decision</p>
            <p className="font-mono text-sm text-white/60">{lastDecision}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
