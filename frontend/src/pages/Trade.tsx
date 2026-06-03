import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { mantleSepoliaTestnet } from "wagmi/chains";
import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { LoginButton } from "@/components/auth/LoginButton";
import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { WalletScopeControl } from "@/components/rwa/WalletScopeControl";
import { RiskDetailsModal } from "@/components/swap/RiskDetailsModal";
import { TransactionStatus } from "@/components/swap/TransactionStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAllocationRecommendation } from "@/hooks/useAllocation";
import { useMarketIngestionStatus, useLatestPrices, useMarketRoutes, useUsdyOracle } from "@/hooks/useMarket";
import { useCurrentPortfolio } from "@/hooks/usePortfolio";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";
import { useProposalActivity } from "@/hooks/useProposalActivity";
import { useCurrentRisk } from "@/hooks/useRisk";
import { useApproveProposal, useCreateProposal, useExecuteProposal, useProposalDetail, useProposals, useRejectProposal } from "@/hooks/useSwap";
import type { InvestmentPlanResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const assetOptions = ["USDC", "USDY", "mETH", "MNT"] as const;
const riskProfiles = ["Defensive", "Balanced", "Yield-Seeking"] as const;
const allocationModes = ["AI Suggested", "Manual"] as const;

function NetworkGuard() {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const isMantle = chainId === mantleSepoliaTestnet.id;

  return (
    <section className={cn("terminal-panel p-4", !isMantle && isConnected ? "border-warning/50 bg-warning/5" : "")}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="terminal-label text-primary">Wallet and network</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect a wallet, then switch to Mantle Sepolia before creating or approving an investment plan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-border text-muted-foreground">
            {isConnected ? `Chain ${chainId ?? "-"}` : "Wallet disconnected"}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              isMantle ? "border-success/40 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning",
            )}
          >
            {isMantle ? "Mantle Sepolia" : "Wrong network"}
          </Badge>
          <LoginButton />
        </div>
      </div>
      {isConnected && !isMantle && (
        <div className="mt-3 flex items-start gap-2 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Execution stays disabled until the connected wallet is on Mantle Sepolia.</p>
        </div>
      )}
    </section>
  );
}

function parseManualWeights(input: string) {
  const parts = input.split("/").map((value) => Number.parseFloat(value.trim()));
  if (parts.length !== 2 || parts.some((value) => !Number.isFinite(value)) || parts[0] + parts[1] <= 0) {
    return null;
  }
  const total = parts[0] + parts[1];
  return {
    USDY: parts[0] / total,
    mETH: parts[1] / total,
  };
}

export default function Trade() {
  const { isConnected } = useAccount();
  const { walletAddress } = usePortfolioWallet();
  const portfolioQuery = useCurrentPortfolio();
  const riskQuery = useCurrentRisk();
  const allocationQuery = useAllocationRecommendation();
  const marketQuery = useMarketIngestionStatus();
  const pricesQuery = useLatestPrices();
  const oracleQuery = useUsdyOracle();
  const routesQuery = useMarketRoutes();
  const proposalsQuery = useProposals();

  const createPlan = useCreateProposal();
  const approveProposal = useApproveProposal();
  const rejectProposal = useRejectProposal();
  const executeProposal = useExecuteProposal();
  const { appendEntry, getEntriesForProposal } = useProposalActivity();

  const portfolio = portfolioQuery.data;
  const risk = riskQuery.data;
  const allocation = allocationQuery.data;
  const market = marketQuery.data;
  const prices = pricesQuery.data;
  const oracle = oracleQuery.data;
  const routes = routesQuery.data;
  const proposals = useMemo(() => proposalsQuery.data?.proposals ?? [], [proposalsQuery.data?.proposals]);

  const [assetSymbol, setAssetSymbol] = useState<(typeof assetOptions)[number]>("USDY");
  const [amount, setAmount] = useState("100");
  const [riskProfile, setRiskProfile] = useState<(typeof riskProfiles)[number]>("Balanced");
  const [allocationMode, setAllocationMode] = useState<(typeof allocationModes)[number]>("AI Suggested");
  const [manualAllocation, setManualAllocation] = useState("70/30");
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [showRiskDialog, setShowRiskDialog] = useState(false);
  const [plan, setPlan] = useState<InvestmentPlanResponse | null>(null);
  const proposalDetailQuery = useProposalDetail(activeProposalId);
  const selectedAssetIngestion = useMemo(
    () => market?.assets?.find((item) => item.asset_symbol === assetSymbol) ?? null,
    [assetSymbol, market?.assets],
  );

  const availableBalance = useMemo(() => {
    const position = portfolio?.positions?.find((item) => item.asset_symbol === assetSymbol);
    const parsed = position?.balance ? Number.parseFloat(position.balance) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, [assetSymbol, portfolio?.positions]);

  const numericAmount = Number.parseFloat(amount || "0");
  const manualWeights = allocationMode === "Manual" ? parseManualWeights(manualAllocation) : null;
  const localWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!isConnected) {
      warnings.push("Connect a wallet before creating a proposal.");
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      warnings.push("Enter a valid deposit amount.");
    }
    if (allocationMode === "Manual" && !manualWeights) {
      warnings.push("Manual allocation must be provided as USDY/mETH, for example 70/30.");
    }
    if (assetSymbol === "MNT") {
      warnings.push("Native MNT deposits are blocked because wrap and unwrap execution is not implemented yet.");
    }
    if (assetSymbol !== "MNT" && market && (!selectedAssetIngestion || !selectedAssetIngestion.configured)) {
      warnings.push(`${assetSymbol} is not configured for the current Mantle Sepolia backend flow.`);
    }
    if (availableBalance !== null && Number.isFinite(numericAmount) && numericAmount > availableBalance) {
      warnings.push(`Insufficient ${assetSymbol} balance for the requested deposit.`);
    }
    return warnings;
  }, [allocationMode, assetSymbol, availableBalance, isConnected, manualWeights, market, numericAmount, selectedAssetIngestion]);

  const selectedPlanProposal = useMemo(() => {
    if (!activeProposalId) {
      return null;
    }
    return proposals.find((proposal) => proposal.proposal_id === activeProposalId) ?? null;
  }, [activeProposalId, proposals]);
  const resolvedPlan = proposalDetailQuery.data ?? plan;
  const executionRequired = Boolean((resolvedPlan?.linked_proposals ?? plan?.linked_proposals ?? []).length);

  const proposalActivity = getEntriesForProposal(activeProposalId);

  useEffect(() => {
    if (!plan?.linked_proposals.length) {
      return;
    }
    setActiveProposalId(plan.linked_proposals[0].proposal_id);
  }, [plan]);

  const handleCreatePlan = () => {
    if (localWarnings.length > 0) {
      toast.error(localWarnings[0]);
      return;
    }
    createPlan.mutate(
      {
        wallet_address: walletAddress || undefined,
        deposit_asset_symbol: assetSymbol,
        deposit_amount: numericAmount,
        risk_profile: riskProfile,
        allocation_mode: allocationMode,
        manual_target_weights: manualWeights ?? undefined,
      },
      {
        onSuccess: (response) => {
          setPlan(response);
          const firstProposalId = response.linked_proposals[0]?.proposal_id;
          if (firstProposalId) {
            appendEntry({
              proposalId: firstProposalId,
              type: "created",
              message: "Investment plan created",
              timestamp: new Date().toISOString(),
            });
          }
          toast.success(response.status_reason);
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Failed to create investment plan");
        },
      },
    );
  };

  const handleApprove = () => {
    if (!activeProposalId) {
      toast.error("Select a linked proposal before approving.");
      return;
    }
    approveProposal.mutate(activeProposalId, {
      onSuccess: () => {
        appendEntry({
          proposalId: activeProposalId,
          type: "approved",
          message: "Investment plan approved",
          timestamp: new Date().toISOString(),
        });
        toast.success("Plan approved");
      },
      onError: () => toast.error("Failed to approve plan"),
    });
  };

  const handleReject = () => {
    if (!activeProposalId) {
      return;
    }
    rejectProposal.mutate(activeProposalId, {
      onSuccess: () => {
        appendEntry({
          proposalId: activeProposalId,
          type: "rejected",
          message: "Investment plan rejected",
          timestamp: new Date().toISOString(),
        });
        toast.success("Plan rejected");
      },
      onError: () => toast.error("Failed to reject plan"),
    });
  };

  const handleExecute = () => {
    if (!activeProposalId) {
      return;
    }
    executeProposal.mutate(activeProposalId, {
      onSuccess: (data) => {
        appendEntry({
          proposalId: activeProposalId,
          type: "submitted",
          message: "Execution submitted onchain",
          timestamp: new Date().toISOString(),
          hash: data.hash,
          chainId: data.chain_id,
        });
        toast.success("Execution submitted");
      },
      onError: () => toast.error("Failed to execute plan"),
    });
  };

  const working =
    createPlan.isPending ||
    approveProposal.isPending ||
    rejectProposal.isPending ||
    executeProposal.isPending;

  const allocationMismatch =
    allocationMode === "AI Suggested" &&
    allocation?.decision?.profile_name &&
    allocation.decision.profile_name !== riskProfile;

  return (
    <PageScaffold
      eyebrow="Investment flow"
      title="Trade"
      description="Create a deposit-aware investment plan, inspect real backend guard checks, approve linked swap proposals, then execute through the connected wallet."
    >
      <NetworkGuard />
      <WalletScopeControl />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricPanel
          label="Portfolio"
          value={portfolio?.total_value_usd ? `$${portfolio.total_value_usd}` : "Loading"}
          detail={portfolio?.status_reason ?? "Reading the wallet-scoped portfolio snapshot."}
          tone={toneFromStatus(portfolio?.status)}
        />
        <MetricPanel
          label="Risk"
          value={resolvedPlan?.risk_assessment?.risk_band ?? risk?.risk_band ?? "Loading"}
          detail={resolvedPlan?.risk_assessment?.reasoning_summary ?? risk?.reasoning_summary ?? "Reading the risk engine before proposing execution."}
          tone={(resolvedPlan?.risk_assessment?.hard_veto_status ?? risk?.hard_veto_status) === "active" ? "blocked" : toneFromStatus(resolvedPlan?.risk_assessment?.status ?? risk?.status)}
        />
        <MetricPanel
          label="Market"
          value={market?.status_label ?? "Loading"}
          detail={market?.status_reason ?? "Checking market ingestion freshness and completeness."}
          tone={toneFromStatus(market?.status)}
        />
        <MetricPanel
          label="Oracle"
          value={oracle?.status ?? "Loading"}
          detail={oracle?.price ? `USDY price ${oracle.price}` : "Checking the USDY oracle feed."}
          tone={oracle?.status === "ok" ? "ready" : "degraded"}
        />
      </div>

      <section className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="terminal-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="terminal-label text-primary">Investment configuration</p>
            <Badge variant="outline" className="border-border text-muted-foreground">
              {resolvedPlan?.status_label ?? plan?.status_label ?? "draft"}
            </Badge>
          </div>

          <div className="mt-4 grid gap-4">
            <div className="grid gap-2 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-xs text-muted-foreground">Deposit asset</span>
                <Select value={assetSymbol} onValueChange={(value) => setAssetSymbol(value as typeof assetSymbol)}>
                  <SelectTrigger className="bg-surface-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {assetOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-2">
                <span className="text-xs text-muted-foreground">Deposit amount</span>
                <Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="bg-surface-2" />
              </label>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-xs text-muted-foreground">Risk profile</span>
                <Select value={riskProfile} onValueChange={(value) => setRiskProfile(value as typeof riskProfile)}>
                  <SelectTrigger className="bg-surface-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {riskProfiles.map((profile) => (
                      <SelectItem key={profile} value={profile}>
                        {profile}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-2">
                <span className="text-xs text-muted-foreground">Allocation mode</span>
                <Select value={allocationMode} onValueChange={(value) => setAllocationMode(value as typeof allocationMode)}>
                  <SelectTrigger className="bg-surface-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allocationModes.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            {allocationMode === "Manual" && (
              <label className="grid gap-2">
                <span className="text-xs text-muted-foreground">Manual split, USDY/mETH</span>
                <Input value={manualAllocation} onChange={(event) => setManualAllocation(event.target.value)} placeholder="70/30" className="bg-surface-2 font-mono" />
              </label>
            )}

            <div className="grid gap-3 rounded border border-border bg-surface-2 p-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Wallet balance</p>
                <p className="mt-1 font-mono text-sm text-foreground">{availableBalance !== null ? availableBalance.toFixed(4) : "unknown"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Routes</p>
                <p className="mt-1 font-mono text-sm text-foreground">{routes?.routes.length ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Price snapshots</p>
                <p className="mt-1 font-mono text-sm text-foreground">{prices?.prices.length ?? 0}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleCreatePlan} disabled={working || localWarnings.length > 0}>
                {createPlan.isPending ? "Creating plan..." : "Create investment plan"}
              </Button>
              <Button variant="outline" onClick={() => setShowRiskDialog(true)} disabled={!resolvedPlan?.risk_assessment && !risk}>
                View risk details
              </Button>
            </div>

            {localWarnings.length > 0 && (
              <div className="space-y-2 rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                {localWarnings.map((warning) => (
                  <div key={warning} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{warning}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="terminal-panel p-4">
          <p className="terminal-label text-primary">Investment proposal</p>
          <div className="mt-3 space-y-3">
            {!plan && (
              <div className="rounded border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
                Create a plan to see allocation targets, guard checks, linked proposals, and transaction steps.
              </div>
            )}

            {plan && (
              <>
                <div className="rounded border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {resolvedPlan?.deposit_amount ?? plan.deposit_amount} {resolvedPlan?.deposit_asset_symbol ?? plan.deposit_asset_symbol}
                    </p>
                    <Badge
                      variant="outline"
                      className={
                        (resolvedPlan?.approval_enabled ?? plan.approval_enabled)
                          ? "border-success/40 bg-success/10 text-success"
                          : executionRequired
                            ? "border-warning/40 bg-warning/10 text-warning"
                            : "border-border text-muted-foreground"
                      }
                    >
                      {(resolvedPlan?.approval_enabled ?? plan.approval_enabled)
                        ? "approval ready"
                        : executionRequired
                          ? "blocked"
                          : "no swap required"}
                    </Badge>
                  </div>
                    <p className="mt-2 text-sm text-muted-foreground">{resolvedPlan?.status_reason ?? plan.status_reason}</p>
                  {(resolvedPlan?.estimated_gas_native ?? plan.estimated_gas_native) && (
                    <p className="mt-2 text-xs text-muted-foreground">Estimated gas indicator: {resolvedPlan?.estimated_gas_native ?? plan.estimated_gas_native}</p>
                  )}
                </div>

                <div className="grid gap-2 rounded border border-border bg-surface-2 p-3">
                  <p className="font-medium text-foreground">Selected allocation</p>
                  {(resolvedPlan?.selected_target_allocations ?? plan.selected_target_allocations).map((allocationItem) => (
                    <div key={`${allocationItem.asset_symbol}-${allocationItem.source}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{allocationItem.asset_symbol}</span>
                      <span className="font-mono text-foreground">
                        {(allocationItem.percentage * 100).toFixed(2)}% / {allocationItem.amount.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="grid gap-2 rounded border border-border bg-surface-2 p-3">
                  <p className="font-medium text-foreground">Guard checks</p>
                  {(resolvedPlan?.guard_checks ?? plan.guard_checks).map((check) => (
                    <div key={check.code} className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-b-0 last:pb-0">
                      <div>
                        <p className="text-sm text-foreground">{check.label}</p>
                        <p className="text-xs text-muted-foreground">{check.message}</p>
                      </div>
                      <span className={check.passed ? "text-success" : check.blocking ? "text-destructive" : "text-warning"}>
                        {check.passed ? "pass" : check.blocking ? "block" : "pending"}
                      </span>
                    </div>
                  ))}
                </div>

                {(((resolvedPlan?.approval_blockers ?? plan.approval_blockers).length > 0) || ((resolvedPlan?.warning_messages ?? plan.warning_messages).length > 0) || allocationMismatch) && (
                  <div className="space-y-2 rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                    {allocationMismatch && <p>The active UI risk profile differs from the last backend recommendation profile.</p>}
                    {(resolvedPlan?.warning_messages ?? plan.warning_messages).map((warning) => <p key={warning}>{warning}</p>)}
                    {(resolvedPlan?.approval_blockers ?? plan.approval_blockers).map((blocker) => <p key={blocker}>{blocker}</p>)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="terminal-panel p-4">
          <p className="terminal-label text-primary">Transaction sequence</p>
          <div className="mt-3 space-y-2">
            {(resolvedPlan?.transaction_steps ?? plan?.transaction_steps ?? []).map((step) => (
              <div key={`${step.step_index}-${step.step_type}`} className="rounded border border-border bg-surface-2 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">
                    Step {step.step_index}: {step.step_type}
                  </p>
                  <span className="text-xs text-muted-foreground">{step.requires_user_action ? "user action" : "informational"}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{step.description}</p>
              </div>
            ))}
            {!(resolvedPlan?.transaction_steps ?? plan?.transaction_steps)?.length && (
              <div className="rounded border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
                No transaction sequence is available until a plan is created.
              </div>
            )}
          </div>
        </div>

        <div className="terminal-panel p-4">
          <p className="terminal-label text-primary">Linked proposals</p>
          <div className="mt-3 space-y-3">
            {(resolvedPlan?.linked_proposals ?? plan?.linked_proposals ?? []).map((proposal) => {
              const liveRecord = proposals.find((item) => item.proposal_id === proposal.proposal_id);
              return (
                <button
                  key={proposal.proposal_id}
                  type="button"
                  onClick={() => setActiveProposalId(proposal.proposal_id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded border border-border bg-surface-2 px-3 py-3 text-left text-sm transition-colors hover:border-primary",
                    activeProposalId === proposal.proposal_id ? "border-primary/70 bg-primary/5" : "",
                  )}
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {proposal.token_in_symbol} <ArrowRight className="mx-1 inline h-3.5 w-3.5" /> {proposal.token_out_symbol}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Amount {proposal.amount.toFixed(4)} / status {liveRecord?.status_code ?? proposal.status_code}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{proposal.proposal_id.slice(0, 12)}...</span>
                </button>
              );
            })}

            {!(resolvedPlan?.linked_proposals ?? plan?.linked_proposals)?.length && (
              <div className="rounded border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
                No linked swap proposals are available for the current plan.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleApprove} disabled={!activeProposalId || working || !(resolvedPlan?.approval_enabled ?? plan?.approval_enabled)}>
                {approveProposal.isPending ? "Approving..." : "Approve investment plan"}
              </Button>
              <Button variant="outline" onClick={handleReject} disabled={!activeProposalId || working}>
                Reject plan
              </Button>
              <Button onClick={handleExecute} disabled={!activeProposalId || working || selectedPlanProposal?.status_code !== "PROPOSAL_APPROVED"}>
                {executeProposal.isPending ? "Executing..." : "Execute selected proposal"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="terminal-panel p-4">
        <p className="terminal-label text-primary">Proposal activity</p>
        <div className="mt-3">
          <TransactionStatus
            entries={proposalActivity}
            emptyLabel="No approval or execution activity has been recorded for the selected proposal yet."
          />
        </div>
      </section>

      <RiskDetailsModal
        open={showRiskDialog}
        onOpenChange={setShowRiskDialog}
        risk={resolvedPlan?.risk_assessment ?? risk}
      />
    </PageScaffold>
  );
}
