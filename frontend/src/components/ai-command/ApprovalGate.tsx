import { useState } from "react";
import { CheckCircle2, XCircle, Play, Pause, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PreCheck {
  label: string;
  passed: boolean;
}

interface ApprovalGateProps {
  preChecks: PreCheck[];
  onApprove: () => void;
  onReject: () => void;
  onSimulate: () => void;
  onPause: () => void;
  isPaused: boolean;
  hasProposal: boolean;
}

export function ApprovalGate({ preChecks, onApprove, onReject, onSimulate, onPause, isPaused, hasProposal }: ApprovalGateProps) {
  const allPassed = preChecks.every((c) => c.passed);

  return (
    <section className="rounded-xl border border-white/10 bg-black/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-yellow-500">Human Approval Gate</p>
        {isPaused && (
          <span className="flex items-center gap-1.5 rounded-full border border-red-500/30 px-3 py-1 text-xs text-red-400">
            <Pause className="h-3 w-3" /> Paused
          </span>
        )}
      </div>

      <div className="mb-4 space-y-1.5">
        {preChecks.map((check) => (
          <div key={check.label} className="flex items-center gap-2 rounded px-2 py-1">
            {check.passed ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
            )}
            <span className={`text-sm ${check.passed ? "text-white/60" : "text-yellow-400"}`}>{check.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={onApprove}
          disabled={!allPassed || !hasProposal || isPaused}
          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
        >
          <CheckCircle2 className="mr-1.5 h-4 w-4" />
          Approve Proposal
        </Button>
        <Button
          onClick={onReject}
          disabled={!hasProposal || isPaused}
          variant="outline"
          className="border-red-500/30 text-red-400 hover:bg-red-500/10"
        >
          <XCircle className="mr-1.5 h-4 w-4" />
          Reject Proposal
        </Button>
        <Button
          onClick={onSimulate}
          disabled={!hasProposal || isPaused}
          variant="outline"
          className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
        >
          <Play className="mr-1.5 h-4 w-4" />
          Simulate First
        </Button>
        <Button
          onClick={onPause}
          variant="outline"
          className={`ml-auto ${isPaused ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" : "border-red-500/30 text-red-400 hover:bg-red-500/10"}`}
        >
          {isPaused ? (
            <>
              <Play className="mr-1.5 h-4 w-4" /> Resume AI
            </>
          ) : (
            <>
              <Pause className="mr-1.5 h-4 w-4" /> Pause AI
            </>
          )}
        </Button>
      </div>
    </section>
  );
}
