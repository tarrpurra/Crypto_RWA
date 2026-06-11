import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BellRing, ChevronDown, ChevronUp, Cpu } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { AllocationDecisionResponse, RiskAssessmentResponse, RecommendationResponse } from "@/lib/api/types";

interface SwapRecommendation {
  action: string;
  amount: number;
  asset_symbol: string;
  token_in_symbol?: string;
  token_out_symbol?: string;
  swap_pair_label?: string;
}

interface AISwapPanelProps {
  allocation: AllocationDecisionResponse | undefined;
  risk: RiskAssessmentResponse | undefined;
  decisions: RecommendationResponse | undefined;
  isLoading: boolean;
  hasConnectedWallet: boolean;
  aiDecisionMakerEnabled: boolean;
  onAiAccessChange: (enabled: boolean) => void;
  isAiAccessPending: boolean;
  swapRecommendations: SwapRecommendation[];
  depositAmountReady: boolean;
  onReviewSwap: () => void;
  onOpenTradePage: () => void;
}

function ReasoningBlock({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-primary/10 bg-card p-4">
      <div className="mb-2 flex items-center gap-3">
        <span className="font-mono text-xs text-primary">{number}</span>
        <h3 className="text-sm font-medium text-cream">{title}</h3>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}

export function AISwapPanel({
  allocation,
  risk,
  decisions,
  isLoading,
  hasConnectedWallet,
  aiDecisionMakerEnabled,
  onAiAccessChange,
  isAiAccessPending,
  swapRecommendations,
  depositAmountReady,
  onReviewSwap,
  onOpenTradePage,
}: AISwapPanelProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const decision = allocation?.decision;
  const confidence = decision?.confidence ?? risk?.confidence ?? decisions?.confidence ?? 0;
  const action = decision?.recommended_action ?? risk?.recommended_action ?? decisions?.recommended_action ?? "MONITOR";
  const primarySwapRecommendation = swapRecommendations[0] ?? null;
  const primarySwapPairLabel = primarySwapRecommendation
    ? primarySwapRecommendation.swap_pair_label
      ?? (primarySwapRecommendation.token_in_symbol && primarySwapRecommendation.token_out_symbol
        ? `${primarySwapRecommendation.token_in_symbol} -> ${primarySwapRecommendation.token_out_symbol}`
        : primarySwapRecommendation.asset_symbol)
    : null;
  const hasMultipleSwapLegs = swapRecommendations.length > 1;

  if (isLoading) {
    return (
      <section className="ai-reasoning-panel rounded-xl p-5">
        <div className="flex items-center gap-3 text-primary">
          <Cpu className="h-4 w-4 animate-pulse" />
          <span className="text-xs uppercase tracking-[0.18em]">AI Reasoning</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Analyzing portfolio...</p>
      </section>
    );
  }

  return (
    <section className="ai-reasoning-panel rounded-xl">
      {hasConnectedWallet && primarySwapRecommendation && (
        <div className="border-b border-primary/20 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded border border-primary/25 bg-primary/10 p-2 text-primary">
                <BellRing className="h-4 w-4" />
              </div>
              <div>
                <p className="terminal-label text-primary">Swap recommendation ready</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {aiDecisionMakerEnabled
                    ? "Full access AI is active. The trade flow will auto-approve and execute linked proposals after the plan is created."
                    : "Recommendation only is active. Review the prefilled swap details before you approve or execute anything."}
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="rounded border border-border bg-surface-2 px-3 py-2">
                    <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                      {hasMultipleSwapLegs ? "Primary leg" : "Swap asset"}
                    </p>
                    <p className="mt-1 font-mono text-sm text-foreground">
                      {primarySwapPairLabel ?? primarySwapRecommendation.asset_symbol} {primarySwapRecommendation.action === "BUY" ? "buy" : primarySwapRecommendation.action}
                    </p>
                  </div>
                  <div className="rounded border border-border bg-surface-2 px-3 py-2">
                    <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                      {hasMultipleSwapLegs ? "Swap legs" : "Suggested amount"}
                    </p>
                    <p className="mt-1 font-mono text-sm text-foreground">
                      {hasMultipleSwapLegs ? `${swapRecommendations.length} legs` : primarySwapRecommendation.amount.toFixed(4)}
                    </p>
                  </div>
                  <div className="rounded border border-border bg-surface-2 px-3 py-2">
                    <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Confidence</p>
                    <p className="mt-1 font-mono text-sm text-foreground">
                      {allocation ? `${(allocation.decision.confidence * 100).toFixed(1)}%` : "-"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  The trade page opens with the suggested context already filled and can review every generated swap leg, including WMNT, USDY, and mETH routes.
                </p>
              </div>
            </div>
            {!aiDecisionMakerEnabled ? (
              <div className="flex flex-wrap gap-2 md:justify-end">
                <Button onClick={onReviewSwap} disabled={!depositAmountReady}>
                  Review swap
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={onOpenTradePage} disabled={!depositAmountReady}>
                  Open trade page
                </Button>
              </div>
            ) : (
              <div className="rounded border border-success/40 bg-emerald-bg px-3 py-2 text-sm text-success md:max-w-sm md:justify-end">
                Full access AI is opening the trade flow and executing the scoped swap automatically. No manual review is required in this mode.
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-primary/[0.03]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Cpu className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-primary">AI Reasoning Summary</p>
            <p className="mt-0.5 text-sm font-medium text-cream">
              {action === "REBALANCE"
                ? `${decision?.reasoning ?? "Rebalance recommended based on portfolio drift."}`
                : action === "PAUSE"
                  ? "Risk constraints require pausing new allocations."
                  : "Portfolio is within acceptable parameters."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasConnectedWallet && (
            <div className="flex items-center gap-2 pr-3">
              <span className="whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-muted-foreground">AI access</span>
              <Switch
                checked={aiDecisionMakerEnabled ?? false}
                disabled={isAiAccessPending}
                onCheckedChange={(v) => {
                  if (v && !aiDecisionMakerEnabled) {
                    setShowWarning(true);
                  } else {
                    onAiAccessChange?.(false);
                  }
                }}
                className="scale-75"
              />
            </div>
          )}
          <span className="rounded-full border border-success/30 px-3 py-1 text-xs text-success">
            {Math.round(confidence * 100)}%
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {showWarning && (
        <div className="border-t border-primary/20 px-5 pb-5 pt-4">
          <div className="rounded-lg border border-destructive/30 bg-crimson-bg p-4">
            <p className="text-sm font-medium text-destructive">Warning: Full AI Access</p>
            <p className="mt-2 text-sm leading-6 text-cream">
              AI will get full access to execute trades and manage your portfolio automatically.
              AI can make mistakes. Review all actions carefully and monitor performance regularly.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => {
                  onAiAccessChange(true);
                  setShowWarning(false);
                }}
                className="rounded-md bg-destructive/20 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/30"
              >
                Accept & Enable
              </button>
              <button
                onClick={() => setShowWarning(false)}
                className="rounded-md border border-primary/20 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/[0.04]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {expanded && (
        <div className="border-t border-primary/20 px-5 pb-5 pt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <ReasoningBlock
              number="01"
              title="Observation"
              text={
                allocation?.decision?.reasoning
                  ? `Portfolio analysis indicates ${allocation.decision.reasoning.toLowerCase()}`
                  : "Current portfolio allocation is being evaluated against target weights. Market conditions and position sizes are within normal parameters."
              }
            />
            <ReasoningBlock
              number="02"
              title="Risk Interpretation"
              text={
                risk?.reasoning_summary
                  ? risk.reasoning_summary
                  : risk
                    ? `Risk score is ${risk.risk_score}/100. Band: ${risk.risk_band}. ${risk.hard_veto_status === "active" ? "Hard veto is active - no trades can execute." : "No hard veto triggered."}`
                    : "Risk engine is loading or unavailable."
              }
            />
            <ReasoningBlock
              number="03"
              title="Recommendation"
              text={
                action === "REBALANCE"
                  ? `Recommended action: ${action}. ${decision?.reasoning ?? "Adjust allocations to match target weights."}`
                  : action === "PAUSE"
                    ? "All trading paused. Risk constraints are active."
                    : "No action needed. Portfolio is within target ranges."
              }
            />
            <ReasoningBlock
              number="04"
              title="Execution Constraint"
              text={
                risk?.required_human_approval_status === "required" || risk?.required_human_approval_status === "not_required"
                  ? `Human approval: ${risk.required_human_approval_status === "required" ? "Required" : "Not required"}. ${risk.hard_veto_status === "active" ? "Hard veto is active - execution blocked." : "Execution path is clear."}`
                  : "Execution constraints are being evaluated."
              }
            />
          </div>
        </div>
      )}
    </section>
  );
}
