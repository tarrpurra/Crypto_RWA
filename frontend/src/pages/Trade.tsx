import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccount, useBalance, useChainId } from "wagmi";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMarketIngestionStatus, useLatestPrices, useMarketRoutes, useUsdyOracle } from "@/hooks/useMarket";
import { useCurrentPortfolio } from "@/hooks/usePortfolio";
import { useInvestmentScope } from "@/hooks/useInvestmentScope";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";
import { useProposalActivity } from "@/hooks/useProposalActivity";
import { useCurrentRisk } from "@/hooks/useRisk";
import { useApproveProposal, useCreateProposal, useExecuteProposal, useProposalDetail, useProposals, useRejectProposal, useWrapMnt } from "@/hooks/useSwap";
import { useSettings } from "@/hooks/useSystem";
import type { InvestmentPlanResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const assetOptions = ["USDY", "mETH", "MNT"] as const;
const riskProfiles = ["Defensive", "Balanced", "Yield-Seeking"] as const;
const allocationModes = ["AI Suggested", "Manual"] as const;

function NetworkGuard({ aiDecisionMakerEnabled }: { aiDecisionMakerEnabled: boolean }) {
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
          <Badge
            variant="outline"
            className={cn(
              aiDecisionMakerEnabled ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground",
            )}
          >
            {aiDecisionMakerEnabled ? "Full access AI" : "Recommendation only"}
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
  const [searchParams] = useSearchParams();
  const { isConnected } = useAccount();
  const { walletAddress, effectiveWalletAddress, isSupportedChain } = usePortfolioWallet();
  const { scope, setScope, clearScope } = useInvestmentScope();
  const portfolioQuery = useCurrentPortfolio();
  const riskQuery = useCurrentRisk();
  const marketQuery = useMarketIngestionStatus();
  const pricesQuery = useLatestPrices();
  const oracleQuery = useUsdyOracle();
  const routesQuery = useMarketRoutes();
  const proposalsQuery = useProposals();
  const settingsQuery = useSettings();

  const createPlan = useCreateProposal();
  const approveProposal = useApproveProposal();
  const rejectProposal = useRejectProposal();
  const executeProposal = useExecuteProposal();
  const wrapMnt = useWrapMnt();
  const { appendEntry, getEntriesForProposal } = useProposalActivity();

  const portfolio = portfolioQuery.data;
  const risk = riskQuery.data;
  const market = marketQuery.data;
  const prices = pricesQuery.data;
  const oracle = oracleQuery.data;
  const routes = routesQuery.data;
  const settings = settingsQuery.data;
  const proposals = useMemo(() => proposalsQuery.data?.proposals ?? [], [proposalsQuery.data?.proposals]);
  const aiDecisionMakerEnabled = settings?.ai_decision_maker_enabled ?? false;
  const routeHasInvestmentParams = searchParams.has("asset") || searchParams.has("amount") || searchParams.has("risk");
  const autoExecutionPlanIdRef = useRef<string | null>(null);
  const autoCreatePlanRef = useRef<string | null>(null);
  const wrappedPlanIdRef = useRef<string | null>(null);
  const amountTouchedRef = useRef(false);

  const initialAssetSymbol = searchParams.get("asset");
  const initialAmount = searchParams.get("amount");
  const initialRiskProfile = searchParams.get("risk");
  const [assetSymbol, setAssetSymbol] = useState<(typeof assetOptions)[number]>(
    assetOptions.includes(initialAssetSymbol as (typeof assetOptions)[number]) ? (initialAssetSymbol as (typeof assetOptions)[number]) : "MNT",
  );
  const [amount, setAmount] = useState(initialAmount ?? "");
  const [riskProfile, setRiskProfile] = useState<(typeof riskProfiles)[number]>(
    riskProfiles.includes(initialRiskProfile as (typeof riskProfiles)[number])
      ? (initialRiskProfile as (typeof riskProfiles)[number])
      : "Balanced",
  );
  const [allocationMode, setAllocationMode] = useState<(typeof allocationModes)[number]>("AI Suggested");
  const [manualAllocation, setManualAllocation] = useState("70/30");
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [showRiskDialog, setShowRiskDialog] = useState(false);
  const [plan, setPlan] = useState<InvestmentPlanResponse | null>(null);
  const [autoExecutionPlanId, setAutoExecutionPlanId] = useState<string | null>(null);
  const [executionConfirmPending, setExecutionConfirmPending] = useState(false);
  const [executionCancelled, setExecutionCancelled] = useState(false);
  const proposalDetailQuery = useProposalDetail(activeProposalId);
  const selectedAssetIngestion = useMemo(
    () => market?.assets?.find((item) => item.asset_symbol === assetSymbol) ?? null,
    [assetSymbol, market?.assets],
  );
  const nativeBalanceQuery = useBalance({
    address: effectiveWalletAddress ? (effectiveWalletAddress as `0x${string}`) : undefined,
    chainId: mantleSepoliaTestnet.id,
    query: { enabled: Boolean(effectiveWalletAddress) },
  });
  const nativeMntBalance = nativeBalanceQuery.data ? Number.parseFloat(nativeBalanceQuery.data.formatted) : NaN;
  const selectedPortfolioBalance = useMemo(() => {
    const candidates = portfolio?.positions ?? [];
    const position = candidates.find((item) => item.asset_symbol === assetSymbol)
      ?? (assetSymbol === "MNT" ? candidates.find((item) => item.asset_symbol === "WMNT") : undefined)
      ?? (assetSymbol === "WMNT" ? candidates.find((item) => item.asset_symbol === "MNT") : undefined);
    return position?.balance?.trim() ?? "";
  }, [assetSymbol, portfolio?.positions]);
  const selectedPortfolioBalanceValue = Number.parseFloat(selectedPortfolioBalance || "0");
  const nativeWalletBalanceValue = Number.isFinite(nativeMntBalance) ? nativeMntBalance : Number.parseFloat(nativeBalanceQuery.data?.formatted || "0");
  const walletBalanceAmount =
    Number.isFinite(selectedPortfolioBalanceValue) && selectedPortfolioBalanceValue > 0
      ? selectedPortfolioBalance
      : Number.isFinite(nativeWalletBalanceValue) && nativeWalletBalanceValue > 0 && assetSymbol === "MNT"
        ? nativeBalanceQuery.data?.formatted || ""
        : "";
  const availableBalance = useMemo(() => {
    if (!walletBalanceAmount) {
      return null;
    }
    const parsed = Number.parseFloat(walletBalanceAmount);
    return Number.isFinite(parsed) ? parsed : null;
  }, [walletBalanceAmount]);
  const resolvedAmount = walletBalanceAmount || amount;
  const numericAmount = Number.parseFloat(resolvedAmount || "0");
  const manualWeights = allocationMode === "Manual" ? parseManualWeights(manualAllocation) : null;
  const mntWrapConfigured = Boolean(settings?.native_mnt_enabled && settings?.sepolia_wmnt_address);
  const localWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!isConnected) {
      warnings.push("Connect a wallet before creating a proposal.");
    }
    if (!walletAddress) {
      warnings.push("No connected wallet is available for proposal creation.");
    }
    if (!effectiveWalletAddress) {
      warnings.push("No wallet address is available for portfolio reads.");
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      warnings.push("Enter a valid wallet balance to deploy.");
    }
    if (allocationMode === "Manual" && !manualWeights) {
      warnings.push("Manual allocation must be provided as USDY/mETH, for example 70/30.");
    }
    if (assetSymbol === "MNT" && !mntWrapConfigured) {
      warnings.push("Native MNT wrapping is not configured. Set NATIVE_MNT_ENABLED=true and configure SEPOLIA_WMNT_ADDRESS in the backend.");
    }
    if (assetSymbol !== "MNT" && market && (!selectedAssetIngestion || !selectedAssetIngestion.configured)) {
      warnings.push(`${assetSymbol} is not configured for the current Mantle Sepolia backend flow.`);
    }
    if (availableBalance !== null && Number.isFinite(numericAmount) && numericAmount > availableBalance) {
      warnings.push(`Insufficient ${assetSymbol} balance for the requested deposit.`);
    }
    return warnings;
  }, [allocationMode, assetSymbol, availableBalance, isConnected, manualWeights, market, mntWrapConfigured, numericAmount, selectedAssetIngestion]);

  const selectedPlanProposal = useMemo(() => {
    if (!activeProposalId) {
      return null;
    }
    return proposals.find((proposal) => proposal.proposal_id === activeProposalId) ?? null;
  }, [activeProposalId, proposals]);
  const resolvedPlan = proposalDetailQuery.data ?? plan;
  const executionInputSymbol = (resolvedPlan?.deposit_asset_symbol ?? plan?.deposit_asset_symbol ?? assetSymbol) === "MNT"
    ? "WMNT"
    : (resolvedPlan?.deposit_asset_symbol ?? plan?.deposit_asset_symbol ?? assetSymbol);
  const executionRequired = Boolean((resolvedPlan?.linked_proposals ?? plan?.linked_proposals ?? []).length);
  const autoExecutionActive = autoExecutionPlanId === plan?.plan_id;
  const activePlanForExecution = resolvedPlan ?? plan;

  const proposalActivity = getEntriesForProposal(activeProposalId);

  const executeNativeWrapIfNeeded = async () => {
    const wrapStep = activePlanForExecution?.transaction_steps.find((step) => step.step_type === "wrap");
    if (!wrapStep || wrappedPlanIdRef.current === activePlanForExecution?.plan_id) {
      return;
    }
    if (!settings?.sepolia_wmnt_address) {
      throw new Error("WMNT contract address is not configured in backend settings.");
    }
    console.info("[frontend][trade] wrapping native MNT before swap", {
      plan_id: activePlanForExecution?.plan_id ?? null,
      amount: wrapStep.amount ?? String(activePlanForExecution.deposit_amount),
      wmnt_address: settings.sepolia_wmnt_address,
    });
    await wrapMnt.mutateAsync({
      wmntAddress: settings.sepolia_wmnt_address as `0x${string}`,
      amount: wrapStep.amount ?? String(activePlanForExecution.deposit_amount),
    });
    if (activePlanForExecution?.plan_id) {
      wrappedPlanIdRef.current = activePlanForExecution.plan_id;
    }
  };

  useEffect(() => {
    if (!plan?.linked_proposals.length) {
      return;
    }
    setActiveProposalId(plan.linked_proposals[0].proposal_id);
  }, [plan]);

  useEffect(() => {
    amountTouchedRef.current = false;
  }, [assetSymbol]);

  useEffect(() => {
    if (amountTouchedRef.current) {
      return;
    }
    setAmount(walletBalanceAmount);
  }, [walletBalanceAmount]);

  useEffect(() => {
    if (!aiDecisionMakerEnabled || !plan?.linked_proposals.length || !plan.approval_enabled) {
      return;
    }
    if (autoExecutionPlanIdRef.current === plan.plan_id) {
      return;
    }
    if (executionCancelled) {
      return;
    }

    autoExecutionPlanIdRef.current = plan.plan_id;
    setAutoExecutionPlanId(plan.plan_id);
    setExecutionCancelled(false);
    toast.info("Full access AI is approving the current plan.");

    const run = async () => {
      try {
        for (const proposal of plan.linked_proposals) {
          await approveProposal.mutateAsync(proposal.proposal_id);
          appendEntry({
            proposalId: proposal.proposal_id,
            type: "approved",
            message: "Full access AI approved proposal",
            timestamp: new Date().toISOString(),
          });
        }
        setExecutionConfirmPending(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Full access AI failed to approve the current plan.");
        setAutoExecutionPlanId(null);
      }
    };

    void run();
  }, [aiDecisionMakerEnabled, appendEntry, approveProposal, plan, executionCancelled]);

  useEffect(() => {
    const asset = searchParams.get("asset");
    const nextAmount = searchParams.get("amount");
    const nextRisk = searchParams.get("risk");

    if (asset && assetOptions.includes(asset as (typeof assetOptions)[number])) {
      setAssetSymbol(asset as (typeof assetOptions)[number]);
    }
    if (nextAmount) {
      setAmount(nextAmount);
    }
    if (nextRisk && riskProfiles.includes(nextRisk as (typeof riskProfiles)[number])) {
      setRiskProfile(nextRisk as (typeof riskProfiles)[number]);
    }
  }, [searchParams]);

  useEffect(() => {
    if (isConnected && aiDecisionMakerEnabled && !walletBalanceAmount) {
      clearScope();
      return;
    }
    if (!isSupportedChain || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      clearScope();
      return;
    }
    setScope({
      depositAssetSymbol: assetSymbol,
      depositAmount: numericAmount,
      riskProfile,
      allocationMode,
      chainId: mantleSepoliaTestnet.id,
    });
  }, [allocationMode, assetSymbol, aiDecisionMakerEnabled, clearScope, isConnected, isSupportedChain, numericAmount, riskProfile, setScope, walletBalanceAmount]);

  const handleCreatePlan = async () => {
    console.info("[frontend][trade] create plan requested", {
      asset_symbol: assetSymbol,
      amount: amount,
      numeric_amount: numericAmount,
      risk_profile: riskProfile,
      allocation_mode: allocationMode,
      wallet_address: walletAddress ?? null,
      warnings: localWarnings,
    });
    if (localWarnings.length > 0) {
      console.warn("[frontend][trade] create plan blocked by local warnings", localWarnings);
      toast.error(localWarnings[0]);
      return;
    }
    if (!walletAddress) {
      toast.error("Connect a wallet before creating a plan.");
      return;
    }

    const GAS_RESERVE_MNT = 0.5;
    const deployAmountRaw = numericAmount;
    const planDepositAmount = Math.max(0, deployAmountRaw - GAS_RESERVE_MNT);
    const planManualWeights = manualWeights ?? undefined;

    createPlan.mutate(
      {
        wallet_address: walletAddress,
        deposit_asset_symbol: assetSymbol,
        deposit_amount: planDepositAmount,
        risk_profile: riskProfile,
        allocation_mode: allocationMode,
        manual_target_weights: planManualWeights,
      },
      {
        onSuccess: (response) => {
          console.info("[frontend][trade] investment plan created", {
            plan_id: response.plan_id,
            status_code: response.status_code,
            approval_enabled: response.approval_enabled,
            linked_proposals: response.linked_proposals.map((proposal) => ({
              proposal_id: proposal.proposal_id,
              token_in_symbol: proposal.token_in_symbol,
              token_out_symbol: proposal.token_out_symbol,
              action: proposal.action,
            })),
          });
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

  useEffect(() => {
    console.info("[frontend][trade] auto-create evaluation", {
      aiDecisionMakerEnabled,
      routeHasInvestmentParams,
      hasScope: Boolean(scope),
      hasPlan: Boolean(plan?.plan_id),
      createPending: createPlan.isPending,
      wrapPending: wrapMnt.isPending,
      autoExecutionActive,
      walletBalanceAmount,
      localWarnings,
    });
    if (!aiDecisionMakerEnabled || !routeHasInvestmentParams || !scope || plan?.plan_id || createPlan.isPending || wrapMnt.isPending || autoExecutionActive) {
      if (!aiDecisionMakerEnabled || !routeHasInvestmentParams || plan?.plan_id) {
        autoCreatePlanRef.current = null;
      }
      return;
    }
    if (aiDecisionMakerEnabled && !walletBalanceAmount) {
      return;
    }
    if (!walletAddress || localWarnings.length > 0) {
      return;
    }

    const scopeKey = `${scope.depositAssetSymbol}:${scope.depositAmount}:${scope.riskProfile}:${scope.allocationMode}`;
    if (autoCreatePlanRef.current === scopeKey) {
      return;
    }

    autoCreatePlanRef.current = scopeKey;
    console.info("[frontend][trade] auto-create triggered", { scopeKey, scope });
    toast.info("Full access AI is creating the investment plan and executing it automatically.");
    void handleCreatePlan();
  }, [
    aiDecisionMakerEnabled,
    autoExecutionActive,
    createPlan.isPending,
    handleCreatePlan,
    localWarnings.length,
    plan?.plan_id,
    routeHasInvestmentParams,
    scope,
    walletAddress,
    wrapMnt.isPending,
    walletBalanceAmount,
  ]);

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

  const hasBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!routes?.routes?.length) {
      blockers.push("No swap routes available");
    }
    if (risk?.risk_band === "RISK_VETO" || risk?.risk_band === "RISK_PAUSE_REQUIRED") {
      blockers.push(`Risk band is ${risk.risk_band}`);
    }
    if (risk?.hard_veto_status === "active") {
      blockers.push("Risk hard veto is active");
    }
    if ((market?.status_code ?? "") === "DATA_MISSING") {
      blockers.push(`Market data status is ${market?.status_code}`);
    }
    return blockers;
  }, [routes?.routes?.length, risk?.risk_band, risk?.hard_veto_status, market?.status_code]);

  const handleExecute = () => {
    if (!activeProposalId) {
      return;
    }
    console.info("[frontend][trade] execute proposal requested", {
      proposal_id: activeProposalId,
      blockers: hasBlockers,
      status_code: selectedPlanProposal?.status_code ?? null,
    });
    if (hasBlockers.length > 0) {
      toast.error(`Cannot execute: ${hasBlockers.join("; ")}.`);
      return;
    }
    void (async () => {
      try {
        await executeNativeWrapIfNeeded();
        const data = await executeProposal.mutateAsync(activeProposalId);
        appendEntry({
          proposalId: activeProposalId,
          type: "submitted",
          message: "Execution submitted onchain",
          timestamp: new Date().toISOString(),
          hash: data.hash,
          chainId: data.chain_id,
        });
        toast.success("Execution submitted");
      } catch {
        toast.error("Failed to execute plan");
      }
    })();
  };

  const handleConfirmExecution = async () => {
    console.info("[frontend][trade] confirm execution requested", {
      plan_id: plan?.plan_id ?? null,
      linked_proposals: plan?.linked_proposals.map((proposal) => proposal.proposal_id) ?? [],
      blockers: hasBlockers,
    });
    setExecutionConfirmPending(false);
    if (!plan) {
      setAutoExecutionPlanId(null);
      return;
    }
    if (hasBlockers.length > 0) {
      toast.error(`Cannot execute: ${hasBlockers.join("; ")}.`);
      setAutoExecutionPlanId(null);
      return;
    }
    try {
      await executeNativeWrapIfNeeded();
      for (const proposal of plan.linked_proposals) {
        await executeProposal.mutateAsync(proposal.proposal_id);
        appendEntry({
          proposalId: proposal.proposal_id,
          type: "submitted",
          message: "Execution submitted via operator confirmation",
          timestamp: new Date().toISOString(),
        });
      }
      toast.success("Full access AI completed the current plan.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Full access AI failed to execute the current plan.");
    } finally {
      setAutoExecutionPlanId(null);
    }
  };

  const handleCancelExecution = () => {
    setExecutionConfirmPending(false);
    setExecutionCancelled(true);
    setAutoExecutionPlanId(null);
    toast.info("Execution cancelled by operator.");
  };

  const working =
    wrapMnt.isPending ||
    createPlan.isPending ||
    approveProposal.isPending ||
    rejectProposal.isPending ||
    executeProposal.isPending ||
    autoExecutionActive ||
    executionConfirmPending;

  return (
    <PageScaffold
      eyebrow="Investment flow"
      title="Trade"
      description="Create an AI-managed investment plan from the connected wallet balance, inspect real backend guard checks, approve linked swap proposals, then execute through the connected wallet."
    >
      <NetworkGuard aiDecisionMakerEnabled={aiDecisionMakerEnabled} />
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
                <span className="text-xs text-muted-foreground">Wallet balance to deploy</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  readOnly={aiDecisionMakerEnabled}
                  onChange={(event) => {
                    amountTouchedRef.current = true;
                    setAmount(event.target.value);
                  }}
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

            {assetSymbol === "MNT" && (
                <div className="rounded border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
                  Native MNT deposits are wrapped to WMNT when the plan executes. The AI uses the connected wallet balance instead of asking for more funds.
                </div>
              )}

            {settings?.sepolia_meth_is_test_token && (
              <div className="rounded border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
                The <span className="font-medium text-foreground">mETH</span> sleeve is currently backed by a Sepolia demo asset. Wallet transactions, AGNI routes, and balance reconciliation are live; risk valuation uses the configured <span className="font-mono">{settings.sepolia_meth_price_mode}</span> price mode.
              </div>
            )}

            {!aiDecisionMakerEnabled ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleCreatePlan} disabled={working || localWarnings.length > 0}>
                  {createPlan.isPending ? "Creating plan..." : "Create investment plan"}
                </Button>
                <Button variant="outline" onClick={() => setShowRiskDialog(true)} disabled={!resolvedPlan?.risk_assessment && !risk}>
                  View risk details
                </Button>
              </div>
              ) : (
              <div className="space-y-2">
                <div className="rounded border border-success/40 bg-success/10 p-3 text-sm text-success">
                  Full access AI will prepare the plan, approve linked proposals, then request your confirmation before executing the swap.
                </div>
                <Button variant="outline" onClick={() => setShowRiskDialog(true)} disabled={!resolvedPlan?.risk_assessment && !risk}>
                  View risk details
                </Button>
              </div>
            )}

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
                        ? aiDecisionMakerEnabled
                          ? "auto-execution ready"
                          : "approval ready"
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
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">{allocationItem.asset_symbol}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {executionInputSymbol} <ArrowRight className="mx-0.5 inline h-3 w-3" /> {allocationItem.asset_symbol}
                        </span>
                      </div>
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
                        {check.passed ? "pass" : check.blocking ? "block" : "warn"}
                      </span>
                    </div>
                  ))}
                </div>

                {(((resolvedPlan?.approval_blockers ?? plan.approval_blockers).length > 0) || ((resolvedPlan?.warning_messages ?? plan.warning_messages).length > 0)) && (
                  <div className="space-y-2 rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
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
                  <span className="text-xs text-muted-foreground">
                    {aiDecisionMakerEnabled ? "AI managed" : step.requires_user_action ? "user action" : "informational"}
                  </span>
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

            {aiDecisionMakerEnabled && !autoExecutionActive && !executionConfirmPending && (resolvedPlan?.approval_enabled ?? plan?.approval_enabled) && (
              <div className="rounded border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
                Full access AI is enabled. Linked proposals will auto-approve, then request confirmation before execution.
              </div>
            )}
            {autoExecutionActive && !executionConfirmPending && (
              <div className="rounded border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
                Full access AI is approving the linked proposals.
              </div>
            )}
            {executionConfirmPending && (
              <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                All proposals approved. Confirm execution to submit the swap transaction.
              </div>
            )}
            {!aiDecisionMakerEnabled ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleApprove} disabled={!activeProposalId || working || autoExecutionActive || !(resolvedPlan?.approval_enabled ?? plan?.approval_enabled)}>
                  {approveProposal.isPending ? "Approving..." : "Approve investment plan"}
                </Button>
                <Button variant="outline" onClick={handleReject} disabled={!activeProposalId || working || autoExecutionActive}>
                  Reject plan
                </Button>
                <Button onClick={handleExecute} disabled={!activeProposalId || working || autoExecutionActive || selectedPlanProposal?.status_code !== "PROPOSAL_APPROVED" || hasBlockers.length > 0}>
                  {executeProposal.isPending ? "Executing..." : "Execute selected proposal"}
                </Button>
              </div>
            ) : (
              <div className="rounded border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
                Full access AI will approve linked proposals, then request confirmation before execution.
              </div>
            )}
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

      <Dialog open={executionConfirmPending} onOpenChange={(open) => { if (!open) handleCancelExecution(); }}>
        <DialogContent className="max-w-lg border-border bg-background">
          <DialogHeader>
            <DialogTitle>Confirm execution</DialogTitle>
            <DialogDescription>
              Full access AI has approved the plan. Review the swap details below, then confirm in your connected wallet to submit the transaction.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {plan?.linked_proposals.map((proposal) => (
              <div key={proposal.proposal_id} className="flex items-center justify-between rounded border border-border bg-surface-2 px-3 py-2">
                <div>
                  <span className="font-medium text-foreground">{proposal.token_in_symbol}</span>
                  <ArrowRight className="mx-1 inline h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-foreground">{proposal.token_out_symbol}</span>
                </div>
                <span className="font-mono text-muted-foreground">{proposal.amount.toFixed(4)} {proposal.token_in_symbol}</span>
              </div>
            ))}
            {plan?.risk_profile && (
              <div className="flex items-center justify-between rounded border border-border bg-surface-2 px-3 py-2">
                <span className="text-muted-foreground">Risk profile</span>
                <span className="font-medium text-foreground">{plan.risk_profile}</span>
              </div>
            )}
            <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              A wallet transaction prompt (MetaMask or equivalent) will open after you confirm. Review and sign it to complete the swap.
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancelExecution} disabled={executeProposal.isPending}>
              Cancel
            </Button>
            <Button onClick={handleConfirmExecution} disabled={executeProposal.isPending}>
              {executeProposal.isPending ? "Executing..." : "Confirm execution"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageScaffold>
  );
}
