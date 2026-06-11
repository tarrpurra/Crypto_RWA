import type { AllocationDecisionResponse } from "@/lib/api/types";

interface AllocationProposalProps {
  allocation: AllocationDecisionResponse | undefined;
  isLoading: boolean;
}

interface WeightBarProps {
  label: string;
  current: number;
  target: number;
}

function WeightBar({ label, current, target }: WeightBarProps) {
  const maxWidth = Math.max(current, target, 1);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/70">{label}</span>
        <span className="font-mono text-xs text-white/50">
          {current.toFixed(1)}% → {target.toFixed(1)}%
        </span>
      </div>
      <div className="relative h-5">
        <div className="absolute inset-0 flex items-center">
          <div className="h-2 w-full rounded-full bg-white/10">
            <div className="h-2 rounded-full bg-white/20" style={{ width: `${(current / maxWidth) * 100}%` }} />
          </div>
        </div>
        <div className="absolute inset-0 flex items-center">
          <div
            className="h-2 rounded-full bg-yellow-500/60"
            style={{ width: `${(target / maxWidth) * 100}%` }}
          />
        </div>
        <div
          className="absolute top-0 h-5 w-0.5 bg-yellow-400"
          style={{ left: `${(target / maxWidth) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function AllocationProposal({ allocation, isLoading }: AllocationProposalProps) {
  if (isLoading) {
    return (
      <section className="rounded-xl border border-white/10 bg-black/40 p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-yellow-500">Proposed Allocation</p>
        <p className="mt-3 text-sm text-white/50">Computing target weights...</p>
      </section>
    );
  }

  const currentWeights = allocation?.decision?.current_weights ?? {};
  const targetWeights = allocation?.decision?.target_weights ?? {};
  const allAssets = [...new Set([...Object.keys(currentWeights), ...Object.keys(targetWeights)])];
  const reasoning = allocation?.decision?.reasoning;

  return (
    <section className="rounded-xl border border-white/10 bg-black/40 p-5">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.18em] text-yellow-500">Proposed Allocation</p>
        {reasoning && <p className="mt-1 text-xs text-white/50">{reasoning}</p>}
      </div>

      <div className="space-y-3">
        {allAssets.map((asset) => (
          <WeightBar
            key={asset}
            label={asset}
            current={(currentWeights[asset] ?? 0) * 100}
            target={(targetWeights[asset] ?? 0) * 100}
          />
        ))}
      </div>
    </section>
  );
}
