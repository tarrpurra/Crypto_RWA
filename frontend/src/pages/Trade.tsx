import { useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { mantleSepoliaTestnet } from "wagmi/chains";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";

import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { LoginButton } from "@/components/auth/LoginButton";
import { WalletScopeControl } from "@/components/rwa/WalletScopeControl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentPortfolio } from "@/hooks/usePortfolio";
import { useCurrentRisk } from "@/hooks/useRisk";
import { useAllocationRecommendation } from "@/hooks/useAllocation";
import { useMarketIngestionStatus, useLatestPrices, useMarketRoutes, useUsdyOracle } from "@/hooks/useMarket";
import { useApproveProposal, useCreateProposal, useExecuteProposal, useProposals, useRejectProposal, useSwapQuote } from "@/hooks/useSwap";
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
            Connect a wallet, then switch to Mantle Sepolia before reviewing or approving a plan.
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

export default function Trade() {
  const { isConnected } = useAccount();
  const portfolioQuery = useCurrentPortfolio();
  const riskQuery = useCurrentRisk();
  const allocationQuery = useAllocationRecommendation();
  const marketQuery = useMarketIngestionStatus();
  const pricesQuery = useLatestPrices();
  const oracleQuery = useUsdyOracle();
  const routesQuery = useMarketRoutes();
  const proposalsQuery = useProposals();

  const createProposal = useCreateProposal();
  const approveProposal = useApproveProposal();
  const rejectProposal = useRejectProposal();
  const executeProposal = useExecuteProposal();

  const portfolio = portfolioQuery.data;
  const risk = riskQuery.data;
  const allocation = allocationQuery.data;
  const market = marketQuery.data;
  const prices = pricesQuery.data;
  const oracle = oracleQuery.data;
  const routes = routesQuery.data;
  const proposals = useMemo(() => proposalsQuery.data?.proposals ?? [], [proposalsQuery.data?.proposals]);

  const [assetSymbol, setAssetSymbol] = useState<(typeof assetOptions)[number]>("USDC");
  const [amount, setAmount] = useState("100");
  const [riskProfile, setRiskProfile] = useState<(typeof riskProfiles)[number]>("Balanced");
  const [allocationMode, setAllocationMode] = useState<(typeof allocationModes)[number]>("AI Suggested");
  const [manualAllocation, setManualAllocation] = useState("70/30");
  const [stage, setStage] = useState<"configure" | "review" | "approved" | "executed">("configure");
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [showPlanDialog, setShowPlanDialog] = useState(false);

  const quoteQuery = useSwapQuote(assetSymbol, "USDY");

  const selectedProposal = useMemo(
    () => proposals.find((proposal) => proposal.proposal_id === activeProposalId) ?? null,
    [activeProposalId, proposals],
  );

  const availableBalance = useMemo(() => {
    const position = portfolio?.positions?.find((item) => item.asset_symbol === assetSymbol);
    const parsed = position?.balance ? Number.parseFloat(position.balance) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, [assetSymbol, portfolio?.positions]);

  const derivedPlan = useMemo(() => {
    const targetProfile = riskProfile === "Defensive"
      ? { usdy: 0.45, meth: 0.15, reserve: 0.4 }
      : riskProfile === "Yield-Seeking"
        ? { usdy: 0.35, meth: 0.45, reserve: 0.2 }
        : { usdy: 0.45, meth: 0.3, reserve: 0.25 };

    const manual = manualAllocation
      .split("/")
      .map((part) => Number.parseFloat(part.trim()))
      .filter((value) => Number.isFinite(value));

    const target = allocationMode === "Manual" && manual.length === 2 && manual[0] + manual[1] > 0
      ? { usdy: manual[0] / (manual[0] + manual[1]), meth: manual[1] / (manual[0] + manual[1]), reserve: 0 }
      : targetProfile;

    const numericAmount = Number.parseFloat(amount || "0");
    const amountIsValid = Number.isFinite(numericAmount) && numericAmount > 0;
    return {
      amountIsValid,
      numericAmount,
      target,
      targetUsdY: amountIsValid ? numericAmount * target.usdy : 0,
      targetMeth: amountIsValid ? numericAmount * target.meth : 0,
      reserveAmount: amountIsValid ? numericAmount * target.reserve : 0,
    };
  }, [allocationMode, amount, manualAllocation, riskProfile]);

  const planWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!isConnected) {
      warnings.push("Connect a wallet before creating a proposal.");
    }
    if (risk?.hard_veto_status === "active") {
      warnings.push("Risk engine is blocking execution.");
    }
    if (oracle?.status !== "ok") {
      warnings.push("USDY oracle freshness is not healthy.");
    }
    if (market?.status !== "ok") {
      warnings.push("Market ingestion is degraded.");
    }
    if (!derivedPlan.amountIsValid) {
      warnings.push("Enter a valid deposit amount.");
    }
    if (availableBalance !== null && derivedPlan.amountIsValid && derivedPlan.numericAmount > availableBalance) {
      warnings.push(`Insufficient ${assetSymbol} balance for the requested deposit.`);
    }
    return warnings;
  }, [assetSymbol, availableBalance, derivedPlan.amountIsValid, derivedPlan.numericAmount, isConnected, market?.status, oracle?.status, risk?.hard_veto_status]);

  const planReady = planWarnings.length === 0 && !createProposal.isPending;
  const approvalReady = Boolean(selectedProposal) && risk?.hard_veto_status !== "active" && oracle?.status === "ok";

  const handleCreatePlan = () => {
    if (!planReady) {
      toast.error(planWarnings[0] ?? "Plan is not ready for proposal creation");
      return;
    }

    createProposal.mutate(
      {
        asset_symbol: assetSymbol,
        action: "SELL",
        amount: derivedPlan.numericAmount,
      },
      {
        onSuccess: (response) => {
          setActiveProposalId(response.proposal.proposal_id);
          setStage("review");
          setShowPlanDialog(true);
          toast.success("Investment plan created");
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Failed to create investment plan");
        },
      },
    );
  };

  const handleApprovePlan = () => {
    if (!selectedProposal) {
      toast.error("Select a created proposal first");
      return;
    }

    approveProposal.mutate(selectedProposal.proposal_id, {
      onSuccess: () => {
        setStage("approved");
        toast.success("Plan approved");
      },
      onError: () => toast.error("Failed to approve plan"),
    });
  };

  const handleRejectPlan = () => {
    if (!selectedProposal) {
      return;
    }
    rejectProposal.mutate(selectedProposal.proposal_id, {
      onSuccess: () => {
        setStage("configure");
        setActiveProposalId(null);
        toast.success("Plan rejected");
      },
      onError: () => toast.error("Failed to reject plan"),
    });
  };

  const handleExecutePlan = () => {
    if (!selectedProposal) {
      return;
    }
    executeProposal.mutate(selectedProposal.proposal_id, {
      onSuccess: () => {
        setStage("executed");
        toast.success("Execution submitted");
      },
      onError: () => toast.error("Failed to execute proposal"),
    });
  };

  const working =
    createProposal.isPending ||
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
      description="Configure the deposit, review the risk and allocation summary, approve the plan, then send the execution payload from the connected wallet."
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
          value={risk?.risk_band ?? "Loading"}
          detail={risk?.reasoning_summary ?? "Reading the risk engine before proposing execution."}
          tone={risk?.hard_veto_status === "active" ? "blocked" : toneFromStatus(risk?.status)}
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

      <section className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="terminal-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="terminal-label text-primary">Investment configuration</p>
            <Badge variant="outline" className="border-border text-muted-foreground">
              {stage}
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
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="bg-surface-2"
                />
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
                <Input
                  value={manualAllocation}
                  onChange={(event) => setManualAllocation(event.target.value)}
                  placeholder="70/30"
                  className="bg-surface-2 font-mono"
                />
              </label>
            )}

            <div className="grid gap-3 rounded border border-border bg-surface-2 p-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Target USDY</p>
                <p className="mt-1 font-mono text-sm text-foreground">{derivedPlan.targetUsdY.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Target mETH</p>
                <p className="mt-1 font-mono text-sm text-foreground">{derivedPlan.targetMeth.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Stable reserve</p>
                <p className="mt-1 font-mono text-sm text-foreground">{derivedPlan.reserveAmount.toFixed(4)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleCreatePlan} disabled={!planReady || working}>
                {createProposal.isPending ? "Creating plan..." : "Create investment plan"}
              </Button>
              <Button variant="outline" onClick={() => setStage("configure")} disabled={working}>
                Reset stage
              </Button>
            </div>

            {planWarnings.length > 0 && (
              <div className="space-y-2 rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                {planWarnings.map((warning) => (
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
          <p className="terminal-label text-primary">Proposal review</p>
          <div className="mt-3 space-y-3">
            {selectedProposal ? (
              <>
                <div className="rounded border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {selectedProposal.token_in} to {selectedProposal.token_out}
                    </p>
                    <Badge variant="outline" className="border-border text-muted-foreground">
                      {selectedProposal.status_code}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between gap-2">
                      <span>Proposal ID</span>
                      <span className="font-mono text-foreground">{selectedProposal.proposal_id.slice(0, 12)}...</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Max amount in</span>
                      <span className="font-mono text-foreground">{selectedProposal.max_amount_in}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Min amount out</span>
                      <span className="font-mono text-foreground">{selectedProposal.min_amount_out}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Route selector</span>
                      <span className="font-mono text-foreground">{selectedProposal.selector}</span>
                    </div>
                  </div>
                </div>

          <div className="grid gap-2 rounded border border-border bg-surface-2 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Risk gate</span>
                    <span className={risk?.hard_veto_status === "active" ? "text-destructive" : "text-success"}>
                      {risk?.hard_veto_status ?? "unknown"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Approval gate</span>
                    <span className={approvalReady ? "text-success" : "text-warning"}>
                      {approvalReady ? "ready" : "blocked"}
                    </span>
                  </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Route freshness</span>
                  <span className={quoteQuery.data?.freshness_status === "fresh" ? "text-success" : "text-warning"}>
                    {quoteQuery.data?.freshness_status ?? "unknown"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Wallet balance</span>
                  <span className={availableBalance !== null && derivedPlan.numericAmount > availableBalance ? "text-destructive" : "text-success"}>
                    {availableBalance !== null ? availableBalance.toFixed(4) : "unknown"}
                  </span>
                </div>
              </div>

              {allocationMismatch && (
                  <div className="flex items-start gap-2 rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>The chosen allocation mode does not match the active recommendation profile.</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleApprovePlan} disabled={!approvalReady || working}>
                    {approveProposal.isPending ? "Approving..." : "Approve investment plan"}
                  </Button>
                  <Button variant="outline" onClick={handleRejectPlan} disabled={working || !selectedProposal}>
                    Reject plan
                  </Button>
                  <Button
                    onClick={handleExecutePlan}
                    disabled={working || stage !== "approved" || !selectedProposal}
                    className="gap-2"
                  >
                    {executeProposal.isPending ? "Executing..." : "Execute plan"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
                Create a proposal to see the investment plan, risk gate, and execution payload.
              </div>
            )}

            <div className="rounded border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Plan sequence</p>
              <ol className="mt-2 space-y-1.5">
                <li>1. Create the proposal from the selected deposit asset and profile.</li>
                <li>2. Review risk, allocation, and route freshness before approval.</li>
                <li>3. Approve the plan, then submit execution through the wallet.</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-4">
        <MetricPanel
          label="Latest quote"
          value={quoteQuery.data?.amount_out ?? "Loading"}
          detail={quoteQuery.data?.status_reason ?? "Sampling the current route quote."}
          tone={toneFromStatus(quoteQuery.data?.status)}
        />
        <MetricPanel
          label="Routes"
          value={`${routes?.routes.length ?? 0}`}
          detail={routes?.status_reason ?? "Checking approved route coverage for execution."}
          tone={toneFromStatus(routes?.status)}
        />
        <MetricPanel
          label="Proposals"
          value={`${proposals.length}`}
          detail={proposalsQuery.data?.status_reason ?? "Reading the proposal queue."}
          tone={toneFromStatus(proposalsQuery.data?.status)}
        />
        <MetricPanel
          label="Oracle price"
          value={oracle?.price ?? "Loading"}
          detail={oracle?.status === "ok" ? "Fresh enough for guarded execution." : "Oracle freshness needs attention."}
          tone={oracle?.status === "ok" ? "ready" : "degraded"}
        />
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="terminal-panel p-4">
          <p className="terminal-label text-primary">Current state</p>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <p>Risk band: <span className="text-foreground">{risk?.risk_band ?? "-"}</span></p>
            <p>Risk score: <span className="text-foreground">{risk?.risk_score ?? "-"}</span></p>
            <p>Portfolio status: <span className="text-foreground">{portfolio?.status_reason ?? "-"}</span></p>
            <p>Market status: <span className="text-foreground">{market?.status_reason ?? "-"}</span></p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Asset</th>
                  <th className="py-2 pr-3 font-medium">Balance</th>
                  <th className="py-2 pr-3 font-medium">Value</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(portfolio?.positions ?? []).map((position) => (
                  <tr key={`${position.asset_key}-${position.chain_id}`} className="border-b border-border/60">
                    <td className="py-2 pr-3 text-foreground">{position.asset_symbol}</td>
                    <td className="py-2 pr-3 font-mono text-muted-foreground">{position.balance ?? "-"}</td>
                    <td className="py-2 pr-3 font-mono text-muted-foreground">{position.value_usd ?? "-"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{position.status_code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="terminal-panel p-4">
          <p className="terminal-label text-primary">Execution log</p>
          <div className="mt-3 space-y-3">
            {selectedProposal ? (
              <div className="space-y-3 rounded border border-border bg-surface-2 p-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span>Proposal prepared for guarded execution.</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ShieldAlert className="h-4 w-4 text-warning" />
                  <span>Hard guards stay enabled until the router payload is submitted.</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock3 className="h-4 w-4 text-primary" />
                  <span>Transactions will appear here after approval and execution.</span>
                </div>
              </div>
            ) : (
              <div className="rounded border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
                No execution logged yet. The workflow is intentionally paused until a proposal exists and the human gate is passed.
              </div>
            )}

            <div className="space-y-2">
              {proposals.slice(0, 5).map((proposal) => (
                <button
                  key={proposal.proposal_id}
                  type="button"
                  onClick={() => setActiveProposalId(proposal.proposal_id)}
                  className={cn(
                    "flex w-full items-center justify-between border border-border bg-surface-2 px-3 py-2 text-left text-sm transition-colors hover:border-primary",
                    activeProposalId === proposal.proposal_id ? "border-primary/70 bg-primary/5" : "",
                  )}
                >
                  <span className="min-w-0 truncate text-foreground">
                    {proposal.token_in} to {proposal.token_out}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {proposal.status_code}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Dialog open={showPlanDialog && Boolean(selectedProposal)} onOpenChange={setShowPlanDialog}>
        <DialogContent className="max-w-2xl border-border bg-background">
          <DialogHeader>
            <DialogTitle>Investment plan review</DialogTitle>
            <DialogDescription>
              Review the proposal, balance check, and route assumptions before approving execution.
            </DialogDescription>
          </DialogHeader>

          {selectedProposal && (
            <div className="grid gap-3 text-sm">
              <div className="grid gap-2 rounded border border-border bg-surface-2 p-3 md:grid-cols-2">
                <p className="text-muted-foreground">Deposit asset</p>
                <p className="font-medium text-foreground">{selectedProposal.token_in}</p>
                <p className="text-muted-foreground">Target asset</p>
                <p className="font-medium text-foreground">{selectedProposal.token_out}</p>
                <p className="text-muted-foreground">Requested amount</p>
                <p className="font-mono text-foreground">{derivedPlan.numericAmount.toFixed(4)}</p>
                <p className="text-muted-foreground">Available balance</p>
                <p className="font-mono text-foreground">{availableBalance !== null ? availableBalance.toFixed(4) : "unknown"}</p>
              </div>
              <div className="grid gap-2 rounded border border-border bg-surface-2 p-3">
                <p className="font-medium text-foreground">Risk notes</p>
                <p className="text-muted-foreground">{risk?.reasoning_summary ?? "No risk summary returned yet."}</p>
                <p className="text-muted-foreground">
                  {risk?.notes?.length ? risk.notes.join(" ") : "No additional notes returned by the risk engine."}
                </p>
              </div>
              <div className="grid gap-2 rounded border border-border bg-surface-2 p-3">
                <p className="font-medium text-foreground">Execution sequence</p>
                <ol className="space-y-1 text-muted-foreground">
                  <li>1. Create proposal.</li>
                  <li>2. Human approval.</li>
                  <li>3. Onchain execution through the connected wallet.</li>
                </ol>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageScaffold>
  );
}
