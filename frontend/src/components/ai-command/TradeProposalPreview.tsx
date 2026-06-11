import { ArrowRight, Clock, Route } from "lucide-react";
import type { AllocationDecisionResponse } from "@/lib/api/types";

interface TradeProposalPreviewProps {
  allocation: AllocationDecisionResponse | undefined;
  isLoading: boolean;
}

export function TradeProposalPreview({ allocation, isLoading }: TradeProposalPreviewProps) {
  const action = allocation?.rebalance_actions?.[0];

  if (isLoading) {
    return (
      <section className="rounded-xl border border-white/10 bg-black/40 p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-yellow-500">Trade Proposal Preview</p>
        <p className="mt-3 text-sm text-white/50">Building proposal...</p>
      </section>
    );
  }

  if (!action) {
    return (
      <section className="rounded-xl border border-white/10 bg-black/40 p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-yellow-500">Trade Proposal Preview</p>
        <p className="mt-3 text-sm text-white/50">No active proposal. AI is monitoring portfolio.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-yellow-900/40 bg-black/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-yellow-500">Trade Proposal Preview</p>
        <span className="rounded-md border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 font-mono text-[10px] text-yellow-400">
          #{allocation?.decision?.decision_id?.slice(0, 8) ?? "N/A"}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-white/80">{action.token_in_symbol ?? action.asset_symbol}</span>
            <ArrowRight className="h-4 w-4 text-yellow-500" />
            <span className="font-mono text-sm text-white/80">{action.token_out_symbol ?? action.asset_symbol}</span>
          </div>
          <span className="font-mono text-sm text-yellow-400">
            {action.action} {action.amount.toFixed(4)}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-white/40">
              <Route className="h-3 w-3" /> Route
            </div>
            <p className="mt-0.5 font-mono text-xs text-white/70">{action.route_id ?? "Auto"}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-white/40">
              <Clock className="h-3 w-3" /> Slippage
            </div>
            <p className="mt-0.5 font-mono text-xs text-white/70">0.75%</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">Execution</p>
            <p className="mt-0.5 font-mono text-xs text-yellow-400">Human approval required</p>
          </div>
        </div>
      </div>
    </section>
  );
}
