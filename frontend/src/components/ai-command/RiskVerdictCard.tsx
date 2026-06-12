import { Shield, ShieldCheck, ShieldAlert } from "lucide-react";
import type { RiskAssessmentResponse } from "@/lib/api/types";

interface RiskVerdictCardProps {
  risk: RiskAssessmentResponse | undefined;
  isLoading: boolean;
}

export function RiskVerdictCard({ risk, isLoading }: RiskVerdictCardProps) {
  if (isLoading) {
    return (
      <section className="rounded-xl border border-white/10 bg-black/40 p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-yellow-500">Risk Engine Verdict</p>
        <p className="mt-3 text-sm text-white/50">Calculating risk score...</p>
      </section>
    );
  }

  const score = risk?.risk_score ?? 0;
  const band = risk?.risk_band ?? "UNKNOWN";
  const veto = risk?.hard_veto_status === "active";
  const confidence = risk?.confidence ?? 0;
  const buckets = risk?.buckets ?? [];

  const SeverityIcon = veto ? ShieldAlert : score < 40 ? ShieldCheck : Shield;

  return (
    <section className="rounded-xl border border-white/10 bg-black/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-yellow-500">Risk Engine Verdict</p>
        <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs ${veto ? "border border-red-500/30 text-red-400" : "border border-emerald-500/30 text-emerald-400"}`}>
          <SeverityIcon className="h-3.5 w-3.5" />
          <span>{veto ? "Hard Veto Active" : "No Veto"}</span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">Total Score</p>
          <p className={`font-mono text-lg ${score < 30 ? "text-emerald-400" : score < 60 ? "text-yellow-400" : "text-red-400"}`}>
            {score} / 100
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">Action Band</p>
          <p className="font-mono text-sm text-white/80">{band.replace(/_/g, " ")}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">Confidence</p>
          <p className="font-mono text-sm text-emerald-400">{Math.round(confidence * 100)}%</p>
        </div>
      </div>

      {buckets.length > 0 && (
        <>
          <p className="mb-2 text-[10px] uppercase tracking-[0.12em] text-white/40">Top Risk Contributors</p>
          <div className="space-y-1.5">
            {buckets.slice(0, 4).map((bucket) => (
              <div key={bucket.bucket} className="flex items-center justify-between rounded px-2 py-1">
                <span className="text-sm capitalize text-white/70">{bucket.bucket.replace(/_/g, " ")}</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${bucket.score < 30 ? "bg-emerald-500" : bucket.score < 60 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${bucket.score}%` }}
                    />
                  </div>
                  <span className={`font-mono text-xs ${bucket.score < 30 ? "text-emerald-400" : bucket.score < 60 ? "text-yellow-400" : "text-red-400"}`}>
                    {bucket.score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
