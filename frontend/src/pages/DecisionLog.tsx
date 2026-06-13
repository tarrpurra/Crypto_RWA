import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccount, useBalance } from "wagmi";
import { mantleSepoliaTestnet } from "wagmi/chains";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { PageScaffold } from "@/components/rwa/PageScaffold";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMarketIngestionStatus, useLatestPrices, useMarketRoutes } from "@/hooks/useMarket";
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
const GAS_RESERVE_MNT = 1.0;

const proposalStatusTone: Record<string, string> = {
  PROPOSAL_PENDING_APPROVAL: "border-warning/35 bg-warning/10 text-warning",
  PROPOSAL_APPROVED: "border-success/35 bg-success/10 text-success",
  PROPOSAL_EXECUTING: "border-primary/35 bg-primary/10 text-primary",
  PROPOSAL_EXECUTED: "border-success/35 bg-success/10 text-success",
  PROPOSAL_REJECTED: "border-destructive/35 bg-destructive/10 text-destructive",
};

function shortHash(value: string | null | undefined) {
  if (!value) {
    return "Not submitted";
  }
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Pending";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatSessionTime(value: string | null | undefined) {
  if (!value) {
    return "Pending";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatUnixDateTime(value: number | null | undefined) {
  if (!value) {
    return "Not recorded";
  }
  const parsed = new Date(value * 1000);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleString();
}

function formatDecisionStatus(value: string | null | undefined) {
  if (!value) {
    return "Draft";
  }
  return value.replaceAll("_", " ").toLowerCase();
}

function formatCompactLabel(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function resolveTokenLabel(token: string, tokenLabelsByAddress: Map<string, string>) {
  if (/^0x[a-fA-F0-9]{40}$/.test(token)) {
    return tokenLabelsByAddress.get(token.toLowerCase()) ?? `${token.slice(0, 6)}...${token.slice(-4)}`;
  }
  return token;
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

export default function DecisionLog() {
  const [searchParams] = useSearchParams();
  const { isConnected } = useAccount();
  const { walletAddress, effectiveWalletAddress, isSupportedChain } = usePortfolioWallet();
  const { scope, setScope, clearScope } = useInvestmentScope();
  const portfolioQuery = useCurrentPortfolio();
  const riskQuery = useCurrentRisk();
  const marketQuery = useMarketIngestionStatus();
  const pricesQuery = useLatestPrices();
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
  const routes = routesQuery.data;
  const settings = settingsQuery.data;
  const proposals = useMemo(() => proposalsQuery.data?.proposals ?? [], [proposalsQuery.data?.proposals]);
  const aiDecisionMakerEnabled = settings?.ai_decision_maker_enabled ?? false;
  const routeHasInvestmentParams = searchParams.has("asset") || searchParams.has("amount") || searchParams.has("risk");
  const reviewModeRequested = searchParams.get("review") === "1";
  const autoExecutionPlanIdRef = useRef<string | null>(null);
  const autoCreatePlanRef = useRef<string | null>(null);
  const reviewCreatePlanRef = useRef<string | null>(null);
  const wrappedPlanIdRef = useRef<string | null>(null);

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
  const [activeSessionTab, setActiveSessionTab] = useState("summary");
  const [showOlderSessions, setShowOlderSessions] = useState(false);
  const [showRiskDialog, setShowRiskDialog] = useState(false);
  const [plan, setPlan] = useState<InvestmentPlanResponse | null>(null);
  const [autoExecutionPlanId, setAutoExecutionPlanId] = useState<string | null>(null);
  const [executionConfirmPending, setExecutionConfirmPending] = useState(false);
  const [executionInProgress, setExecutionInProgress] = useState(false);
  const [executionCancelled, setExecutionCancelled] = useState(false);
  const proposalDetailQuery = useProposalDetail(activeProposalId);
  const suppressExecutionCancelRef = useRef(false);
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
    Number.isFinite(selectedPortfolioBalanceValue)
      ? selectedPortfolioBalance
      : Number.isFinite(nativeWalletBalanceValue) && assetSymbol === "MNT"
        ? nativeBalanceQuery.data?.formatted ?? ""
        : "";
  const availableBalance = useMemo(() => {
    if (!walletBalanceAmount) {
      return null;
    }
    const parsed = Number.parseFloat(walletBalanceAmount);
    return Number.isFinite(parsed) ? parsed : null;
  }, [walletBalanceAmount]);
  const numericAmount = Number.parseFloat(amount.trim() || "0");
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
      warnings.push("Enter a valid deposit amount.");
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
  const autoExecutionActive = autoExecutionPlanId === plan?.plan_id;
  const activePlanForExecution = resolvedPlan ?? plan;

  const proposalActivity = getEntriesForProposal(activeProposalId);
  const allActivity = useMemo(
    () => [...proposals.flatMap((proposal) => getEntriesForProposal(proposal.proposal_id))]
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()),
    [getEntriesForProposal, proposals],
  );
  const tokenLabelsByAddress = useMemo(() => {
    const labels = new Map<string, string>();
    if (settings?.sepolia_usdy_address) {
      labels.set(settings.sepolia_usdy_address.toLowerCase(), "USDY");
    }
    if (settings?.sepolia_meth_address) {
      labels.set(settings.sepolia_meth_address.toLowerCase(), "mETH");
    }
    if (settings?.sepolia_wmnt_address) {
      labels.set(settings.sepolia_wmnt_address.toLowerCase(), "WMNT");
    }
    return labels;
  }, [settings?.sepolia_meth_address, settings?.sepolia_usdy_address, settings?.sepolia_wmnt_address]);
  const sortedProposals = useMemo(
    () => [...proposals].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()),
    [proposals],
  );
  const visibleProposals = useMemo(
    () => showOlderSessions ? sortedProposals : sortedProposals.slice(0, 5),
    [showOlderSessions, sortedProposals],
  );
  const hiddenProposalCount = Math.max(sortedProposals.length - visibleProposals.length, 0);
  const selectedProposalLog = useMemo(
    () => sortedProposals.find((proposal) => proposal.proposal_id === activeProposalId) ?? null,
    [activeProposalId, sortedProposals],
  );
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
    if (activeProposalId || !sortedProposals.length) {
      return;
    }
    setActiveProposalId(sortedProposals[0].proposal_id);
  }, [activeProposalId, sortedProposals]);

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
  }, [allocationMode, assetSymbol, clearScope, isConnected, isSupportedChain, numericAmount, riskProfile, setScope]);

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

    const deployAmountRaw = numericAmount;
    const planDepositAmount = assetSymbol === "MNT" ? Math.max(0, deployAmountRaw - GAS_RESERVE_MNT) : deployAmountRaw;
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
      reviewModeRequested,
      routeHasInvestmentParams,
      hasScope: Boolean(scope),
      hasPlan: Boolean(plan?.plan_id),
      createPending: createPlan.isPending,
      wrapPending: wrapMnt.isPending,
      autoExecutionActive,
      walletBalanceAmount,
      localWarnings,
    });
    if (!aiDecisionMakerEnabled || !scope || plan?.plan_id || createPlan.isPending || wrapMnt.isPending || autoExecutionActive) {
      if (!aiDecisionMakerEnabled || plan?.plan_id) {
        autoCreatePlanRef.current = null;
      }
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
    reviewModeRequested,
    routeHasInvestmentParams,
    scope,
    walletAddress,
    wrapMnt.isPending,
  ]);

  useEffect(() => {
    console.info("[frontend][trade] review-create evaluation", {
      aiDecisionMakerEnabled,
      reviewModeRequested,
      routeHasInvestmentParams,
      hasScope: Boolean(scope),
      hasPlan: Boolean(plan?.plan_id),
      createPending: createPlan.isPending,
      wrapPending: wrapMnt.isPending,
      autoExecutionActive,
      walletBalanceAmount,
      localWarnings,
    });
    if (aiDecisionMakerEnabled || !reviewModeRequested || !routeHasInvestmentParams || !scope || plan?.plan_id || createPlan.isPending || wrapMnt.isPending || autoExecutionActive) {
      if (!reviewModeRequested || plan?.plan_id) {
        reviewCreatePlanRef.current = null;
      }
      return;
    }
    if (!walletAddress || localWarnings.length > 0) {
      return;
    }

    const scopeKey = `${scope.depositAssetSymbol}:${scope.depositAmount}:${scope.riskProfile}:${scope.allocationMode}:review`;
    if (reviewCreatePlanRef.current === scopeKey) {
      return;
    }

    reviewCreatePlanRef.current = scopeKey;
    console.info("[frontend][trade] review-create triggered", { scopeKey, scope });
    toast.info("Preparing swap details for review.");
    void handleCreatePlan();
  }, [
    aiDecisionMakerEnabled,
    autoExecutionActive,
    createPlan.isPending,
    handleCreatePlan,
    localWarnings.length,
    plan?.plan_id,
    reviewModeRequested,
    routeHasInvestmentParams,
    scope,
    walletAddress,
    wrapMnt.isPending,
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
    const approvalBlockers = resolvedPlan?.approval_blockers ?? plan?.approval_blockers ?? [];
    if (approvalBlockers.length > 0) {
      blockers.push(...approvalBlockers);
    }
    return blockers;
  }, [market?.status_code, plan?.approval_blockers, resolvedPlan?.approval_blockers, risk?.hard_veto_status, risk?.risk_band, routes?.routes?.length]);

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
    if (!plan) {
      setAutoExecutionPlanId(null);
      return;
    }
    if (hasBlockers.length > 0) {
      toast.error(`Cannot execute: ${hasBlockers.join("; ")}.`);
      setAutoExecutionPlanId(null);
      return;
    }
    setExecutionInProgress(true);
    try {
      for (const proposal of plan.linked_proposals) {
        console.info("[frontend][trade] executing approved proposal", {
          plan_id: plan.plan_id,
          proposal_id: proposal.proposal_id,
        });
        await executeProposal.mutateAsync(proposal.proposal_id);
        appendEntry({
          proposalId: proposal.proposal_id,
          type: "submitted",
          message: "Execution submitted via operator confirmation",
          timestamp: new Date().toISOString(),
        });
      }
      suppressExecutionCancelRef.current = true;
      setExecutionConfirmPending(false);
      toast.success("Full access AI completed the current plan.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Full access AI failed to execute the current plan.");
    } finally {
      setExecutionInProgress(false);
      setAutoExecutionPlanId(null);
    }
  };

  const handleCancelExecution = () => {
    setExecutionConfirmPending(false);
    setExecutionCancelled(true);
    setAutoExecutionPlanId(null);
    toast.info("Execution cancelled by operator.");
  };

  const handleRefreshChecks = () => {
    setActiveSessionTab("checks");
    toast.info("Refreshing guard checks.");
    void riskQuery.refetch();
    void proposalDetailQuery.refetch();
    void proposalsQuery.refetch();
  };

  const working =
    wrapMnt.isPending ||
    createPlan.isPending ||
    approveProposal.isPending ||
    rejectProposal.isPending ||
    executeProposal.isPending ||
    autoExecutionActive ||
    executionConfirmPending ||
    executionInProgress;

  const selectedSessionPlan = resolvedPlan ?? plan;
  const selectedLinkedProposals = selectedSessionPlan?.linked_proposals ?? [];
  const activeLinkedProposal =
    selectedLinkedProposals.find((proposal) => proposal.proposal_id === activeProposalId) ??
    selectedLinkedProposals[0] ??
    null;
  const selectedGuardChecks = selectedSessionPlan?.guard_checks ?? [];
  const selectedAllocations = selectedSessionPlan?.selected_target_allocations ?? [];
  const selectedAiAllocations = selectedSessionPlan?.ai_target_allocations ?? [];
  const selectedSteps = selectedSessionPlan?.transaction_steps ?? [];
  const selectedWarnings = selectedSessionPlan?.warning_messages ?? [];
  const selectedApprovalBlockers = selectedSessionPlan?.approval_blockers ?? [];
  const latestProposalActivity = proposalActivity[0];
  const selectedStatusText = selectedProposalLog?.status_code
    ? formatDecisionStatus(selectedProposalLog.status_code)
    : selectedSessionPlan?.status_label ?? "Draft";
  const selectedGuardBlocked = selectedProposalLog?.status_code === "PROPOSAL_REJECTED" || !selectedSessionPlan?.approval_enabled;
  const selectedGuardState = selectedSessionPlan
    ? selectedGuardBlocked
      ? "Guardrail hold"
      : "Approval ready"
    : "No active draft";
  const selectedRouteLabel = selectedProposalLog
    ? `${resolveTokenLabel(selectedProposalLog.token_in, tokenLabelsByAddress)} to ${resolveTokenLabel(selectedProposalLog.token_out, tokenLabelsByAddress)}`
    : activeLinkedProposal
      ? `${activeLinkedProposal.token_in_symbol} to ${activeLinkedProposal.token_out_symbol}`
      : `${executionInputSymbol} to target allocation`;
  const selectedAmountLabel = selectedSessionPlan
    ? `${selectedSessionPlan.deposit_amount} ${selectedSessionPlan.deposit_asset_symbol}`
    : activeLinkedProposal
      ? `${activeLinkedProposal.amount.toFixed(4)} ${activeLinkedProposal.token_in_symbol}`
      : amount
        ? `${amount} ${assetSymbol}`
        : "No amount selected";
  const selectedMainReason = selectedProposalLog?.status_code === "PROPOSAL_REJECTED"
    ? "Proposal rejected by operator."
    : selectedSessionPlan?.status_reason ??
      selectedSessionPlan?.risk_assessment?.reasoning_summary ??
      risk?.reasoning_summary ??
      "Create a decision draft to review the AI recommendation.";
  const selectedCurrentBlocker = selectedProposalLog?.status_code === "PROPOSAL_REJECTED"
    ? "Execution cannot continue until a new approved proposal is created."
    : hasBlockers[0] ??
      selectedApprovalBlockers[0] ??
      (selectedSessionPlan?.approval_enabled
        ? "No current blocker. The selected proposal can move through approval or execution."
        : "Create a decision draft before execution can continue.");
  const selectedRecommendedAction =
    selectedSessionPlan?.risk_assessment?.recommended_action ??
    risk?.recommended_action ??
    "Create decision draft";
  const selectedRiskLabel = formatCompactLabel(
    selectedSessionPlan?.risk_assessment?.recommended_action ??
    selectedSessionPlan?.risk_assessment?.risk_band ??
    risk?.recommended_action ??
    risk?.risk_band,
  );
  const selectedExecutionLabel = hasBlockers.length > 0 || selectedProposalLog?.status_code === "PROPOSAL_REJECTED"
    ? "Execution blocked"
    : selectedPlanProposal?.status_code === "PROPOSAL_EXECUTED"
      ? "Executed"
      : selectedPlanProposal?.status_code === "PROPOSAL_APPROVED"
        ? "Ready to execute"
        : "Review pending";
  const selectedSessionId = selectedProposalLog?.proposal_id
    ? shortHash(selectedProposalLog.proposal_id)
    : selectedSessionPlan?.plan_id
      ? shortHash(selectedSessionPlan.plan_id)
      : "No session";
  const runtimeModeLabel = formatCompactLabel(
    selectedSessionPlan?.risk_assessment?.runtime_mode ??
    risk?.runtime_mode ??
    "Local mode",
  );
  const selectedEvidenceItems = [
    { label: "Proposal hash", value: selectedProposalLog?.plan_hash ?? selectedSessionPlan?.plan_id ?? "Not recorded" },
    { label: "Calldata hash", value: "Not submitted" },
    { label: "Router", value: selectedProposalLog?.router ?? "Not recorded" },
    { label: "Selector", value: selectedProposalLog?.selector ?? "Not recorded" },
    { label: "Token in", value: selectedProposalLog ? resolveTokenLabel(selectedProposalLog.token_in, tokenLabelsByAddress) : activeLinkedProposal?.token_in_symbol ?? "Not recorded" },
    { label: "Token out", value: selectedProposalLog ? resolveTokenLabel(selectedProposalLog.token_out, tokenLabelsByAddress) : activeLinkedProposal?.token_out_symbol ?? "Not recorded" },
    { label: "Recipient", value: selectedProposalLog?.recipient ?? "Not recorded" },
    { label: "Max input", value: selectedProposalLog?.max_amount_in ?? "Not recorded" },
    { label: "Min amount out", value: selectedProposalLog?.min_amount_out ?? "Not recorded" },
    { label: "Native value", value: selectedProposalLog?.native_value ?? "Not recorded" },
    { label: "Deadline", value: formatUnixDateTime(selectedProposalLog?.deadline) },
    { label: "Expiry", value: formatUnixDateTime(selectedProposalLog?.proposal_expiry) },
    { label: "Nonce", value: selectedProposalLog?.nonce ?? "Not recorded" },
    { label: "Risk snapshot", value: selectedProposalLog?.risk_snapshot_id ?? selectedSessionPlan?.risk_assessment?.generated_at ?? "Not recorded" },
    { label: "Tx hash", value: latestProposalActivity?.hash ?? "Not submitted" },
  ];

  return (
    <PageScaffold
      eyebrow="Decision Control"
      title="Decision Log"
      description="Review the latest portfolio decisions, inspect guardrails, approve or reject qualified proposals, and track execution from one audit surface."
    >
      <header className="space-y-3">
        <div>
          <h1 className="font-display text-2xl text-foreground">Decision Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent AI decision sessions only. Older logs are hidden by default.
          </p>
        </div>
        <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 border border-primary/20 bg-background/80 px-4 py-2 text-sm">
          <span className="font-medium text-foreground">{sortedProposals.length} Proposals</span>
          <span className="text-muted-foreground">Selected: <span className="text-foreground">{formatCompactLabel(selectedProposalLog?.status_code ?? selectedSessionPlan?.status_label)}</span></span>
          <span className="text-muted-foreground">Risk: <span className="text-foreground">{selectedRiskLabel}</span></span>
          <span className="text-muted-foreground">Execution: <span className="text-foreground">{selectedExecutionLabel}</span></span>
          <span className="text-muted-foreground">Activity: <span className="text-foreground">{allActivity.length}</span></span>
          <span className="text-muted-foreground">Mode: <span className="text-foreground">{runtimeModeLabel}</span></span>
        </div>
      </header>

      <section className="grid min-h-[620px] gap-3 xl:h-[calc(100vh-12rem)] xl:grid-cols-[340px_minmax(0,1fr)] xl:overflow-hidden">
        <aside className="terminal-panel flex min-h-0 flex-col">
          <div className="border-b border-border/70 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="terminal-label text-primary">Recent sessions</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {showOlderSessions ? "Showing all recorded AI runs." : "Showing latest 5 only."}
                </p>
              </div>
              <Badge variant="outline" className="border-border/70 text-muted-foreground">
                {aiDecisionMakerEnabled ? "AI" : "Operator"}
              </Badge>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {visibleProposals.map((proposal) => {
              const proposalActivityEntries = getEntriesForProposal(proposal.proposal_id);
              const latestActivity = proposalActivityEntries[0];
              const approvalBlocked = (proposal.approval_blockers?.length ?? 0) > 0 || proposal.approval_enabled === false;
              const sessionAmount = Number.parseFloat(proposal.max_amount_in || "0");
              return (
                <button
                  key={proposal.proposal_id}
                  type="button"
                  onClick={() => setActiveProposalId(proposal.proposal_id)}
                  className={cn(
                    "w-full border-b border-border/60 px-4 py-3 text-left transition-colors",
                    activeProposalId === proposal.proposal_id ? "bg-primary/6" : "bg-transparent hover:bg-surface-2/70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">
                      {resolveTokenLabel(proposal.token_in, tokenLabelsByAddress)}
                      <ArrowRight className="mx-1 inline h-3.5 w-3.5 text-muted-foreground" />
                      {resolveTokenLabel(proposal.token_out, tokenLabelsByAddress)}
                    </p>
                    <span className={cn(
                      "shrink-0 text-[11px] font-semibold",
                      proposal.status_code === "PROPOSAL_REJECTED"
                        ? "text-destructive"
                        : proposal.status_code === "PROPOSAL_APPROVED" || proposal.status_code === "PROPOSAL_EXECUTED"
                          ? "text-success"
                          : "text-muted-foreground",
                    )}>
                      {formatCompactLabel(proposal.status_code)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatSessionTime(proposal.updated_at)} - {Number.isFinite(sessionAmount) && sessionAmount > 0 ? `${sessionAmount.toFixed(4)} ${resolveTokenLabel(proposal.token_in, tokenLabelsByAddress)}` : "Amount pending"}
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    {approvalBlocked
                      ? proposal.approval_blockers?.[0] ?? "Guard checks are still preventing approval."
                      : latestActivity?.message ?? "Ready for operator review."}
                  </p>
                </button>
              );
            })}

            {!sortedProposals.length && (
              <div className="px-4 py-4 text-sm text-muted-foreground">
                No proposals have been recorded yet. Create a new decision draft to start the review flow.
              </div>
            )}
          </div>

          {hiddenProposalCount > 0 && (
            <div className="border-t border-border/70 p-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowOlderSessions(true)}
              >
                View older sessions
              </Button>
            </div>
          )}
        </aside>

        <section className="terminal-panel flex min-h-0 flex-col overflow-hidden">
          <header className="border-b border-border/70 px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="terminal-label text-primary">Selected session</p>
                <p className="mt-3 text-2xl font-semibold uppercase tracking-[0.06em] text-foreground">
                  {selectedStatusText}
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {selectedRouteLabel} - {selectedAmountLabel}
                </p>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {selectedMainReason}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                    Risk: {selectedRiskLabel}
                  </span>
                  <span className="rounded-full bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning">
                    {selectedExecutionLabel}
                  </span>
                </div>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-xs text-muted-foreground">Session</p>
                <p className="font-mono text-sm text-foreground">{selectedSessionId}</p>
                <p className="text-xs text-muted-foreground">{selectedGuardState}</p>
              </div>
            </div>
          </header>

          <Tabs value={activeSessionTab} onValueChange={setActiveSessionTab} className="flex min-h-0 flex-1 flex-col">
            <div className="overflow-x-auto border-b border-border/70 px-5 py-2">
              <TabsList className="h-auto justify-start gap-1 rounded-none bg-transparent p-0">
                <TabsTrigger value="summary" className="rounded-full px-2.5 py-1 text-[12px] data-[state=active]:bg-primary/12 data-[state=active]:shadow-none">Summary</TabsTrigger>
                <TabsTrigger value="checks" className="rounded-full px-2.5 py-1 text-[12px] data-[state=active]:bg-primary/12 data-[state=active]:shadow-none">Checks</TabsTrigger>
                <TabsTrigger value="reasoning" className="rounded-full px-2.5 py-1 text-[12px] data-[state=active]:bg-primary/12 data-[state=active]:shadow-none">Reasoning</TabsTrigger>
                <TabsTrigger value="allocation" className="rounded-full px-2.5 py-1 text-[12px] data-[state=active]:bg-primary/12 data-[state=active]:shadow-none">Allocation</TabsTrigger>
                <TabsTrigger value="transaction" className="rounded-full px-2.5 py-1 text-[12px] data-[state=active]:bg-primary/12 data-[state=active]:shadow-none">Transaction</TabsTrigger>
                <TabsTrigger value="evidence" className="rounded-full px-2.5 py-1 text-[12px] data-[state=active]:bg-primary/12 data-[state=active]:shadow-none">Evidence</TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
              <TabsContent value="summary" className="m-0 space-y-4">
                <div className="max-w-3xl space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Decision summary</p>
                    <div className="mt-2 space-y-1 text-sm leading-6 text-muted-foreground">
                      <p>The AI proposed swapping {selectedAmountLabel} into {selectedRouteLabel.split(" to ").at(-1) ?? "the target asset"}.</p>
                      <p>{selectedMainReason}</p>
                      <p>{selectedCurrentBlocker}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                    <span>Status: <span className="text-foreground">{formatCompactLabel(selectedStatusText)}</span></span>
                    <span>Risk: <span className="text-foreground">{selectedRiskLabel}</span></span>
                    <span>Route: <span className="text-foreground">{selectedRouteLabel}</span></span>
                    <span>Amount: <span className="text-foreground">{selectedAmountLabel}</span></span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
                  <Button onClick={handleCreatePlan} disabled={working || localWarnings.length > 0}>
                    {createPlan.isPending ? "Creating..." : "Create draft"}
                  </Button>
                  <Button variant="outline" onClick={handleRefreshChecks}>
                    Re-run checks
                  </Button>
                  <Button variant="outline" onClick={() => setActiveSessionTab("evidence")}>
                    View evidence
                  </Button>
                  <Button variant="outline" onClick={() => setShowRiskDialog(true)} disabled={!selectedSessionPlan?.risk_assessment && !risk}>
                    View risk details
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!aiDecisionMakerEnabled ? (
                    <>
                      <Button onClick={handleApprove} disabled={!activeProposalId || working || autoExecutionActive || !selectedSessionPlan?.approval_enabled}>
                        {approveProposal.isPending ? "Approving..." : "Approve plan"}
                      </Button>
                      <Button variant="outline" onClick={handleReject} disabled={!activeProposalId || working || autoExecutionActive}>
                        Reject plan
                      </Button>
                      <Button onClick={handleExecute} disabled={!activeProposalId || working || autoExecutionActive || selectedPlanProposal?.status_code !== "PROPOSAL_APPROVED" || hasBlockers.length > 0}>
                        {executeProposal.isPending ? "Executing..." : "Execute proposal"}
                      </Button>
                    </>
                  ) : (
                    <div className="px-3 py-2 text-sm text-success">
                      Full access AI will approve linked proposals, then request confirmation before execution.
                    </div>
                  )}
                </div>

                {aiDecisionMakerEnabled && !autoExecutionActive && !executionConfirmPending && selectedSessionPlan?.approval_enabled && (
                  <div className="text-sm text-success">
                    Full access AI is enabled. Linked proposals will auto-approve, then request confirmation before execution.
                  </div>
                )}
                {autoExecutionActive && !executionConfirmPending && (
                  <div className="text-sm text-primary">
                    Full access AI is approving the linked proposals.
                  </div>
                )}
                {executionConfirmPending && (
                  <div className="text-sm text-warning">
                    All proposals approved. Confirm execution to submit the swap transaction.
                  </div>
                )}

                {localWarnings.length > 0 && (
                  <div className="space-y-2 border-t border-border/70 pt-4 text-sm text-warning">
                    {localWarnings.map((warning) => (
                      <div key={warning} className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>{warning}</p>
                      </div>
                    ))}
                  </div>
                )}

                <details className="border-t border-border/70 pt-4" open={!selectedSessionPlan}>
                  <summary className="cursor-pointer text-sm font-medium text-foreground">Draft inputs</summary>
                  <div className="mt-4 grid gap-4">
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-xs text-muted-foreground">Deposit asset</span>
                        <Select value={assetSymbol} onValueChange={(value) => setAssetSymbol(value as typeof assetSymbol)}>
                          <SelectTrigger className="bg-background">
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
                          className="bg-background"
                        />
                      </label>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-xs text-muted-foreground">Risk profile</span>
                        <Select value={riskProfile} onValueChange={(value) => setRiskProfile(value as typeof riskProfile)}>
                          <SelectTrigger className="bg-background">
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
                          <SelectTrigger className="bg-background">
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
                        <Input value={manualAllocation} onChange={(event) => setManualAllocation(event.target.value)} placeholder="70/30" className="bg-background font-mono" />
                      </label>
                    )}

                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                      <span>Wallet balance: <span className="font-mono text-foreground">{availableBalance !== null ? availableBalance.toFixed(4) : "unknown"}</span></span>
                      <span>Routes: <span className="font-mono text-foreground">{routes?.routes.length ?? 0}</span></span>
                      <span>Price feeds: <span className="font-mono text-foreground">{prices?.prices.length ?? 0}</span></span>
                    </div>
                  </div>
                </details>
              </TabsContent>

              <TabsContent value="checks" className="m-0 space-y-2">
                {selectedGuardChecks.map((check) => (
                  <div key={check.code} className="grid gap-2 py-2 text-sm md:grid-cols-[1fr_auto] md:items-start">
                    <div>
                      <p className="font-medium text-foreground">{check.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.message}</p>
                    </div>
                    <span className={cn(
                      "w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                      check.passed ? "bg-success/10 text-success" : check.blocking ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning",
                    )}>
                      {check.passed ? "pass" : check.blocking ? "block" : "warn"}
                    </span>
                  </div>
                ))}
                {!selectedGuardChecks.length && (
                  <div className="text-sm text-muted-foreground">
                    Guard checks will appear after a decision draft is created.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="reasoning" className="m-0 space-y-4">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">AI reasoning</p>
                    <Badge variant="outline" className="border-border/70 text-muted-foreground">
                      {selectedRecommendedAction}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {selectedSessionPlan?.risk_assessment?.reasoning_summary ?? risk?.reasoning_summary ?? "No AI reasoning is available for the selected session yet."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                  <span>Risk score: <span className="font-mono text-foreground">{selectedSessionPlan?.risk_assessment?.risk_score ?? risk?.risk_score ?? "Pending"}</span></span>
                  <span>Confidence: <span className="font-mono text-foreground">{selectedSessionPlan?.risk_assessment?.confidence ?? risk?.confidence ?? "Pending"}</span></span>
                  <span>Human approval: <span className="text-foreground">{selectedSessionPlan?.risk_assessment?.required_human_approval_status ?? risk?.required_human_approval_status ?? "Pending"}</span></span>
                </div>

                {(selectedApprovalBlockers.length > 0 || selectedWarnings.length > 0) && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {selectedApprovalBlockers.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-warning">Approval blockers</p>
                        <ul className="mt-2 space-y-2 text-sm text-warning">
                          {selectedApprovalBlockers.map((blocker) => (
                            <li key={blocker}>{blocker}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedWarnings.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-foreground">Warnings</p>
                        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                          {selectedWarnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="allocation" className="m-0 space-y-4">
                <div className="max-w-3xl space-y-2">
                  {selectedAllocations.map((allocationItem) => (
                    <div key={`${allocationItem.asset_symbol}-${allocationItem.source}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-foreground">{allocationItem.asset_symbol}</p>
                        <p className="text-xs text-muted-foreground">
                          {executionInputSymbol}
                          <ArrowRight className="mx-1 inline h-3 w-3" />
                          {allocationItem.asset_symbol}
                        </p>
                      </div>
                      <p className="font-mono text-foreground">{(allocationItem.percentage * 100).toFixed(2)}% / {allocationItem.amount.toFixed(4)}</p>
                    </div>
                  ))}
                  {!selectedAllocations.length && (
                    <p className="text-sm text-muted-foreground">No selected allocation is available for this session.</p>
                  )}
                </div>

                {selectedAiAllocations.length > 0 && (
                  <div className="border-t border-border/70 pt-4">
                    <p className="text-sm font-medium text-foreground">AI suggested allocation</p>
                    <div className="mt-2 space-y-2">
                      {selectedAiAllocations.map((allocationItem) => (
                        <div key={`${allocationItem.asset_symbol}-${allocationItem.source}-ai`} className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-foreground">{allocationItem.asset_symbol}</span>
                          <span className="font-mono text-foreground">{(allocationItem.percentage * 100).toFixed(2)}% / {allocationItem.amount.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="transaction" className="m-0 space-y-3">
                {selectedSteps.map((step) => (
                  <div key={`${step.step_index}-${step.step_type}`} className="py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-foreground">Step {step.step_index}: {step.step_type}</p>
                      <span className="text-xs text-muted-foreground">
                        {aiDecisionMakerEnabled ? "AI managed" : step.requires_user_action ? "user action" : "informational"}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{step.description}</p>
                  </div>
                ))}
                {!selectedSteps.length && (
                  <div className="text-sm text-muted-foreground">
                    Transaction steps will appear after a decision draft is created.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="evidence" className="m-0 space-y-5">
                <div>
                  <p className="text-sm font-medium text-foreground">Execution evidence</p>
                  <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
                    {selectedEvidenceItems.map((item) => (
                      <div key={item.label}>
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="mt-1 break-all font-mono text-xs text-foreground">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border/70 pt-4">
                  <p className="text-sm font-medium text-foreground">Linked proposals</p>
                  <div className="mt-3 space-y-2">
                    {selectedLinkedProposals.map((proposal) => {
                      const liveRecord = proposals.find((item) => item.proposal_id === proposal.proposal_id);
                      return (
                        <button
                          key={proposal.proposal_id}
                          type="button"
                          onClick={() => setActiveProposalId(proposal.proposal_id)}
                          className={cn(
                            "flex w-full items-center justify-between py-2 text-left text-sm transition-colors hover:text-primary",
                            activeProposalId === proposal.proposal_id ? "text-primary" : "",
                          )}
                        >
                          <div>
                            <p className="font-medium text-foreground">
                              {proposal.token_in_symbol}
                              <ArrowRight className="mx-1 inline h-3.5 w-3.5" />
                              {proposal.token_out_symbol}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Amount {proposal.amount.toFixed(4)} / status {liveRecord?.status_code ?? proposal.status_code}
                            </p>
                          </div>
                          <span className="font-mono text-xs text-muted-foreground">{proposal.proposal_id.slice(0, 12)}...</span>
                        </button>
                      );
                    })}
                    {!selectedLinkedProposals.length && (
                      <div className="text-sm text-muted-foreground">
                        No linked swap proposals are available for the current plan.
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-border/70 pt-4">
                  <p className="text-sm font-medium text-foreground">Events</p>
                  <div className="mt-3">
                    <TransactionStatus
                      entries={proposalActivity}
                      emptyLabel="No approval or execution activity has been recorded for the selected proposal yet."
                    />
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </section>
      </section>

      <RiskDetailsModal
        open={showRiskDialog}
        onOpenChange={setShowRiskDialog}
        risk={resolvedPlan?.risk_assessment ?? risk}
      />

      <Dialog
        open={executionConfirmPending}
        onOpenChange={(open) => {
          if (!open) {
            if (suppressExecutionCancelRef.current) {
              suppressExecutionCancelRef.current = false;
              return;
            }
            if (executionInProgress) {
              return;
            }
            handleCancelExecution();
          }
        }}
      >
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
            <Button variant="outline" onClick={handleCancelExecution} disabled={executeProposal.isPending || executionInProgress}>
              Cancel
            </Button>
            <Button onClick={handleConfirmExecution} disabled={executeProposal.isPending || executionInProgress}>
              {executeProposal.isPending || executionInProgress ? "Executing..." : "Confirm execution"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageScaffold>
  );
}
