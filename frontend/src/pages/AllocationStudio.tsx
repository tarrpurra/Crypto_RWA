import { useMemo } from "react";
import { toast } from "sonner";

import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { WalletScopeControl } from "@/components/rwa/WalletScopeControl";
import { Button } from "@/components/ui/button";
import { useAllocationRecommendation, useUpdateAllocationProfile } from "@/hooks/useAllocation";
import { useCurrentPortfolio } from "@/hooks/usePortfolio";

const profiles = ["Sepolia Test", "Balanced", "Defensive", "Yield-Seeking"] as const;

export default function AllocationStudio() {
  const portfolioQuery = useCurrentPortfolio();
  const recommendationQuery = useAllocationRecommendation();
  const updateProfile = useUpdateAllocationProfile();

  const portfolio = portfolioQuery.data;
  const recommendation = recommendationQuery.data;
  const decision = recommendation?.decision;
  const actions = recommendation?.rebalance_actions ?? [];

  const currentWeights = useMemo(
    () =>
      Object.entries(decision?.current_weights ?? {}).sort((left, right) => right[1] - left[1]),
    [decision?.current_weights],
  );

  const targetWeights = useMemo(
    () =>
      Object.entries(decision?.target_weights ?? {}).sort((left, right) => right[1] - left[1]),
    [decision?.target_weights],
  );

  const handleProfileChange = (profileName: string) => {
    updateProfile.mutate(profileName, {
      onSuccess: () => toast.success(`Allocation profile set to ${profileName}`),
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Failed to update allocation profile"),
    });
  };

  return (
    <PageScaffold
      eyebrow="Allocation Engine"
      title="Allocation Studio"
      description="Target weights, recommendation logic, rebalance clips, and operator profile control for the active wallet scope."
    >
      <WalletScopeControl />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricPanel
          label="Profile"
          value={decision?.profile_name ?? "Loading"}
          detail="The active profile defines the target basket the allocator is steering toward."
          tone={toneFromStatus(recommendation?.status)}
        />
        <MetricPanel
          label="Action"
          value={decision?.recommended_action ?? "Loading"}
          detail={decision?.reasoning ?? "Reading /allocation/recommendation."}
          tone={decision?.recommended_action === "PAUSE" ? "blocked" : toneFromStatus(recommendation?.status)}
        />
        <MetricPanel
          label="Confidence"
          value={decision ? `${Math.round(decision.confidence * 100)}%` : "Loading"}
          detail="AI output remains advisory until deterministic policy and risk checks pass."
          tone={toneFromStatus(recommendation?.status)}
        />
        <MetricPanel
          label="Live Positions"
          value={`${portfolio?.positions.length ?? 0} Assets`}
          detail={portfolio?.status_reason ?? "Reading wallet-scoped holdings for drift context."}
          tone={toneFromStatus(portfolio?.status)}
        />
      </div>

      <section className="terminal-panel p-4">
        <p className="terminal-label text-primary">Profile Control</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {profiles.map((profileName) => {
            const isActive = decision?.profile_name === profileName;
            return (
              <Button
                key={profileName}
                type="button"
                variant={isActive ? "default" : "outline"}
                disabled={updateProfile.isPending}
                onClick={() => handleProfileChange(profileName)}
                className={isActive ? "bg-lp-gold-bg text-lp-gold border-lp-gold hover:bg-lp-gold/20 hover:text-lp-gold" : "text-muted-foreground hover:text-lp-gold"}
              >
                {profileName}
              </Button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <div className="terminal-panel p-4">
          <p className="terminal-label text-primary">Current Weights</p>
          <div className="mt-3 space-y-2">
            {currentWeights.length === 0 && (
              <p className="text-sm text-muted-foreground">No current weight data returned yet.</p>
            )}
            {currentWeights.map(([asset, weight]) => (
              <div key={asset} className="flex items-center justify-between border border-border bg-surface-2 px-3 py-2">
                <span className="font-medium text-foreground">{asset}</span>
                <span className="font-mono text-sm text-muted-foreground">{(weight * 100).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="terminal-panel p-4">
          <p className="terminal-label text-primary">Target Weights</p>
          <div className="mt-3 space-y-2">
            {targetWeights.length === 0 && (
              <p className="text-sm text-muted-foreground">No target weight data returned yet.</p>
            )}
            {targetWeights.map(([asset, weight]) => (
              <div key={asset} className="flex items-center justify-between border border-border bg-surface-2 px-3 py-2">
                <span className="font-medium text-foreground">{asset}</span>
                <span className="font-mono text-sm text-muted-foreground">{(weight * 100).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="terminal-panel p-4">
        <p className="terminal-label text-primary">Rebalance Clips</p>
        <div className="mt-3 space-y-2">
          {actions.length === 0 && (
            <p className="text-sm text-muted-foreground">No rebalance actions returned yet.</p>
          )}
          {actions.map((action) => (
            <div
              key={`${action.asset_symbol}-${action.action}`}
              className="grid gap-2 border border-border bg-surface-2 px-3 py-3 md:grid-cols-[1fr_auto_auto]"
            >
              <span className="font-medium text-foreground">{action.asset_symbol}</span>
              <span className="font-mono text-sm text-muted-foreground">{action.action}</span>
              <span className="font-mono text-sm text-muted-foreground">{action.amount}</span>
            </div>
          ))}
        </div>
      </section>
    </PageScaffold>
  );
}
