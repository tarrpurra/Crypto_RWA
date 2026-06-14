import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccount, useBalance } from "wagmi";
import { mantleSepoliaTestnet } from "wagmi/chains";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { PageScaffold } from "@/components/rwa/PageScaffold";
import { RiskDetailsModal } from "@/components/swap/RiskDetailsModal";
import { SwapDetailCard } from "@/components/swap/SwapDetailCard";
import { TransactionStatus } from "@/components/swap/TransactionStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLatestPrices, useLatestQuotes, useMarketIngestionStatus, useMarketRoutes } from "@/hooks/useMarket";
import { useCurrentPortfolio } from "@/hooks/usePortfolio";
import { useInvestmentScope } from "@/hooks/useInvestmentScope";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";
import { useProposalActivity } from "@/hooks/useProposalActivity";
import { useCurrentRisk } from "@/hooks/useRisk";
import { useStrategyActive } from "@/hooks/useStrategy";
import { useApproveProposal, useCreateProposal, useProposalDetail, useProposals, useRejectProposal } from "@/hooks/useSwap";
import { useSettings } from "@/hooks/useSystem";
import { useVaultBalance } from "@/hooks/useVault";
import type { InvestmentPlanResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const assetOptions = ["USDY", "mETH", "MNT"] as const;
const riskProfiles = ["Defensive", "Balanced", "Yield-Seeking"];
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
  const strategyActiveQuery = useStrategyActive(effectiveWalletAddress ?? walletAddress ?? null);
  const { scope, setScope, clearScope } = useInvestmentScope();
  const portfolioQuery = useCurrentPortfolio();
  const riskQuery = useCurrentRisk();
  const marketQuery = useMarketIngestionStatus();
  const pricesQuery = useLatestPrices();
  const quotesQuery = useLatestQuotes();
  const routesQuery = useMarketRoutes();
  const proposalsQuery = useProposals();
  const settingsQuery = useSettings();
  const vaultBalanceQuery = useVaultBalance();

  const createPlan = useCreateProposal();
  const approveProposal = useApproveProposal();
  const rejectProposal = useRejectProposal();
  const { appendEntry, getEntriesForProposal } = useProposalActivity();

  const portfolio = portfolioQuery.data;
  const risk = riskQuery.data;
  const market = marketQuery.data;
  const prices = pricesQuery.data;
  const routes = routesQuery.data;
  const settings = settingsQuery.data;
  const vaultData = vaultBalanceQuery.data;
  const proposals = useMemo(() => proposalsQuery.data?.proposals ?? [], [proposalsQuery.data?.proposals]);
  const aiDecisionMakerEnabled = settings?.ai_decision_maker_enabled ?? false;
  const routeHasInvestmentParams = searchParams.has("asset") || searchParams.has("amount") || searchParams.has("risk");
  const reviewModeRequested = searchParams.get("review") === "1";
  const autoCreatePlanRef = useRef<string | null>(null);
  const recommendationOnlyNoticeRef = useRef<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const initialAssetSymbol = searchParams.get("asset");
  const initialAmount = searchParams.get("amount");
  const initialRiskProfile = searchParams.get("risk");
  const [assetSymbol, setAssetSymbol] = useState<(typeof assetOptions)[number]>(
    assetOptions.includes(initialAssetSymbol as (typeof assetOptions)[number]) ? (initialAssetSymbol as (typeof assetOptions)[number]) : "MNT",
  );
  const [amount, setAmount] = useState(initialAmount ?? "");
  const activeStrategyLabel = strategyActiveQuery.data?.active_version?.version
    ? `Custom Strategy ${strategyActiveQuery.data.active_version.version}`
    : null;
  const availableRiskProfiles = useMemo(
    () => (activeStrategyLabel ? [activeStrategyLabel, ...riskProfiles] : [...riskProfiles]),
    [activeStrategyLabel],
  );
  const [riskProfile, setRiskProfile] = useState(initialRiskProfile?.trim() || "Balanced");
  const [allocationMode, setAllocationMode] = useState<(typeof allocationModes)[number]>("AI Suggested");
  const [manualAllocation, setManualAllocation] = useState("70/30");
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [activeSessionTab, setActiveSessionTab] = useState("summary");
  const [showRiskDialog, setShowRiskDialog] = useState(false);
  const [plan, setPlan] = useState<InvestmentPlanResponse | null>(null);
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
  const selectedVaultBalance = useMemo(() => {
    const candidates = vaultData?.balances ?? [];
    const position = candidates.find((item) => item.asset_symbol === assetSymbol)
      ?? (assetSymbol === "MNT" ? candidates.find((item) => item.asset_symbol === "WMNT") : undefined)
      ?? (assetSymbol === "WMNT" ? candidates.find((item) => item.asset_symbol === "MNT") : undefined);
    return position?.balance?.trim() ?? "";
  }, [assetSymbol, vaultData?.balances]);
  const selectedVaultBalanceValue = Number.parseFloat(selectedVaultBalance || "0");
  const nativeWalletBalanceValue = Number.isFinite(nativeMntBalance) ? nativeMntBalance : Number.parseFloat(nativeBalanceQuery.data?.formatted || "0");
  const walletBalanceAmount =
    Number.isFinite(selectedVaultBalanceValue)
      ? selectedVaultBalance
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
    const totalVaultValue = Number.parseFloat(vaultData?.total_value_usd ?? "0");
    if (!vaultData?.balances?.length || !Number.isFinite(totalVaultValue) || totalVaultValue <= 0) {
      warnings.push("Deposit funds into the vault before creating AI trade proposals.");
    }
    if (availableBalance !== null && Number.isFinite(numericAmount) && numericAmount > availableBalance) {
      warnings.push(`Insufficient ${assetSymbol === "MNT" ? "WMNT" : assetSymbol} balance in the vault for the requested proposal amount.`);
    }
    return warnings;
  }, [allocationMode, assetSymbol, availableBalance, isConnected, manualWeights, market, mntWrapConfigured, numericAmount, selectedAssetIngestion, vaultData?.balances, vaultData?.total_value_usd]);

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

  const proposalActivity = getEntriesForProposal(activeProposalId);
  const allActivity = useMemo(
    () => [...proposals.flatMap((proposal) => getEntriesForProposal(proposal.proposal_id))]
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()),
    [getEntriesForProposal, proposals],
  );
  // Bug 7 fix: gate the map construction on settings actually being loaded.
  // Before `settingsQuery.data` arrives every field is `undefined`, so the Map
  // is empty and `resolveTokenLabel` falls through to the hex-truncation branch,
  // causing a startup flicker where token addresses render as raw hex strings.
  const settingsLoaded = settingsQuery.isSuccess;
  const tokenLabelsByAddress = useMemo(() => {
    const labels = new Map<string, string>();
    if (!settingsLoaded) {
      return labels;  // stable empty Map — callers will see a loading state
    }
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
  }, [settingsLoaded, settings?.sepolia_meth_address, settings?.sepolia_usdy_address, settings?.sepolia_wmnt_address]);
  const sortedProposals = useMemo(
    () => [...proposals].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()),
    [proposals],
  );
  const visibleProposals = useMemo(
    () => sortedProposals.slice(0, 10),
    [sortedProposals],
  );
  const selectedProposalLog = useMemo(
    () => sortedProposals.find((proposal) => proposal.proposal_id === activeProposalId) ?? null,
    [activeProposalId, sortedProposals],
  );
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
    const asset = searchParams.get("asset");
    const nextAmount = searchParams.get("amount");
    const nextRisk = searchParams.get("risk");

    if (asset && assetOptions.includes(asset as (typeof assetOptions)[number])) {
      setAssetSymbol(asset as (typeof assetOptions)[number]);
    }
    if (nextAmount) {
      setAmount(nextAmount);
    }
    if (nextRisk?.trim()) {
      setRiskProfile(nextRisk);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!searchParams.has("asset") && !searchParams.has("amount") && !searchParams.has("risk") && scope) {
      if (!amount && scope.depositAmount > 0) {
        setAmount(String(scope.depositAmount));
      }
      if (assetOptions.includes(scope.depositAssetSymbol as (typeof assetOptions)[number])) {
        setAssetSymbol(scope.depositAssetSymbol as (typeof assetOptions)[number]);
      }
      if (typeof scope.riskProfile === "string" && scope.riskProfile.trim()) {
        setRiskProfile(scope.riskProfile);
      }
      if (allocationModes.includes(scope.allocationMode as (typeof allocationModes)[number])) {
        setAllocationMode(scope.allocationMode as (typeof allocationModes)[number]);
      }
    }
    setDraftHydrated(true);
  }, [amount, searchParams, scope]);

  useEffect(() => {
    if (!activeStrategyLabel || searchParams.has("risk")) {
      return;
    }
    if (!riskProfiles.includes(riskProfile)) {
      return;
    }
    setRiskProfile(activeStrategyLabel);
  }, [activeStrategyLabel, riskProfile, searchParams]);

  useEffect(() => {
    if (!draftHydrated) {
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
  }, [allocationMode, assetSymbol, clearScope, isConnected, isSupportedChain, numericAmount, riskProfile, setScope, draftHydrated]);

  // Bug 5 fix: wrap handleCreatePlan in useCallback so its identity is stable
  // across renders. The previous plain arrow function was a new reference every
  // render, and because it was listed in the auto-create useEffect's dependency
  // array the entire effect body (console.info, ref checks, etc.) executed on
  // every render, even though the ref guard prevented duplicate creates.
  const handleCreatePlan = useCallback(async () => {
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
            setActiveProposalId(firstProposalId);
          }
          for (const proposal of response.linked_proposals) {
            appendEntry({
              proposalId: proposal.proposal_id,
              type: "created",
              message: aiDecisionMakerEnabled ? "AI created a trade proposal that now needs human approval" : "Trade proposal draft created",
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
  }, [
    aiDecisionMakerEnabled,
    allocationMode,
    amount,
    appendEntry,
    assetSymbol,
    createPlan,
    localWarnings,
    manualWeights,
    numericAmount,
    riskProfile,
    walletAddress,
  ]);

  useEffect(() => {
    console.info("[frontend][trade] auto-create evaluation", {
      aiDecisionMakerEnabled,
      reviewModeRequested,
      routeHasInvestmentParams,
      hasScope: Boolean(scope),
      hasPlan: Boolean(plan?.plan_id),
      createPending: createPlan.isPending,
      walletBalanceAmount,
      localWarnings,
    });
    if (!aiDecisionMakerEnabled || !scope || plan?.plan_id || createPlan.isPending) {
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
    toast.info("Full access AI is creating a guarded proposal from the current recommendation.");
    void handleCreatePlan();
  }, [
    aiDecisionMakerEnabled,
    createPlan.isPending,
    handleCreatePlan,
    localWarnings.length,
    plan?.plan_id,
    reviewModeRequested,
    routeHasInvestmentParams,
    scope,
    walletAddress,
  ]);

  useEffect(() => {
    const scopeKey = scope
      ? `${scope.depositAssetSymbol}:${scope.depositAmount}:${scope.riskProfile}:${scope.allocationMode}:review-only`
      : null;
    if (!aiDecisionMakerEnabled && reviewModeRequested && routeHasInvestmentParams && scope && !plan?.plan_id && recommendationOnlyNoticeRef.current !== scopeKey) {
      recommendationOnlyNoticeRef.current = scopeKey;
      toast.info("Recommendation-only mode does not auto-create proposals. Review the recommendation, then create a draft from Decision Log if you want to trade.");
    }
    if (aiDecisionMakerEnabled || !reviewModeRequested || plan?.plan_id) {
      recommendationOnlyNoticeRef.current = null;
    }
  }, [aiDecisionMakerEnabled, plan?.plan_id, reviewModeRequested, routeHasInvestmentParams, scope]);

  const handleApprove = async () => {
    if (!activeProposalId || !selectedSessionPlan) {
      toast.error("Select a linked proposal before approving.");
      return;
    }
    const proposalIds = aiDecisionMakerEnabled
      ? selectedSessionPlan.linked_proposals.map((proposal) => proposal.proposal_id)
      : [activeProposalId];

    try {
      for (const proposalId of proposalIds) {
        await approveProposal.mutateAsync(proposalId);
        appendEntry({
          proposalId,
          type: "approved",
          message: aiDecisionMakerEnabled ? "Human approval recorded for AI-created proposal" : "Investment plan approved",
          timestamp: new Date().toISOString(),
        });
      }

      if (!aiDecisionMakerEnabled) {
        toast.success("Plan approved");
        return;
      }
      toast.success("Plan approved. Funds remain in the vault and must execute through the ExecutorVault path.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve plan");
    }
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

  const handleRefreshChecks = () => {
    setActiveSessionTab("checks");
    toast.info("Refreshing guard checks.");
    void riskQuery.refetch();
    void proposalDetailQuery.refetch();
    void proposalsQuery.refetch();
  };

  const working =
    createPlan.isPending ||
    approveProposal.isPending ||
    rejectProposal.isPending;

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

  useEffect(() => {
    if (searchParams.has("asset") || searchParams.has("amount") || searchParams.has("risk")) {
      return;
    }
    if (amount.trim()) {
      return;
    }

    const seededAsset = selectedSessionPlan?.deposit_asset_symbol
      ?? activeLinkedProposal?.token_in_symbol
      ?? selectedProposalLog?.token_in
      ?? null;
    const seededAmount =
      selectedSessionPlan?.deposit_amount
      ?? activeLinkedProposal?.amount
      ?? (selectedProposalLog ? Number.parseFloat(selectedProposalLog.max_amount_in || "0") : null);
    const seededRisk = selectedSessionPlan?.risk_profile ?? null;
    const seededMode = selectedSessionPlan?.allocation_mode ?? null;

    if (seededAsset) {
      const normalizedAsset = seededAsset === "WMNT" ? "MNT" : seededAsset;
      if (assetOptions.includes(normalizedAsset as (typeof assetOptions)[number])) {
        setAssetSymbol(normalizedAsset as (typeof assetOptions)[number]);
      }
    }
    if (Number.isFinite(seededAmount ?? NaN) && (seededAmount ?? 0) > 0) {
      setAmount(String(seededAmount));
    }
    if (seededRisk) {
      setRiskProfile(seededRisk);
    }
    if (seededMode && allocationModes.includes(seededMode as (typeof allocationModes)[number])) {
      setAllocationMode(seededMode as (typeof allocationModes)[number]);
    }
  }, [
    activeLinkedProposal?.amount,
    activeLinkedProposal?.token_in_symbol,
    amount,
    searchParams,
    selectedProposalLog?.max_amount_in,
    selectedProposalLog?.token_in,
    selectedSessionPlan?.allocation_mode,
    selectedSessionPlan?.deposit_amount,
    selectedSessionPlan?.deposit_asset_symbol,
    selectedSessionPlan?.risk_profile,
  ]);

  const selectedReasoningSummary = useMemo(() => {
    const sessionReasoning =
      selectedSessionPlan?.risk_assessment?.reasoning_summary ??
      selectedSessionPlan?.status_reason ??
      risk?.reasoning_summary;
    const quoteSnapshot = (quotesQuery.data?.quotes ?? []).find(
      (quote) => quote.estimated_slippage_bps || quote.route_depth_usd,
    );
    const backendQuoteDetail = quoteSnapshot
      ? ` Latest route data from the backend shows ${quoteSnapshot.route_label} with ${quoteSnapshot.estimated_slippage_bps ?? "unknown"} bps estimated slippage and ${quoteSnapshot.route_depth_usd ?? "unknown"} route depth.`
      : "";
    const approvalDetail = selectedApprovalBlockers.length > 0
      ? ` Approval blockers: ${selectedApprovalBlockers.join("; ")}.`
      : "";
    const warningDetail = selectedWarnings.length > 0
      ? ` Warnings: ${selectedWarnings.join("; ")}.`
      : "";

    if (selectedProposalLog?.status_code === "PROPOSAL_REJECTED") {
      return `Proposal rejected by operator.${sessionReasoning ? ` ${sessionReasoning}` : ""}${backendQuoteDetail}${approvalDetail}${warningDetail}`.trim();
    }
    if (sessionReasoning) {
      return `${sessionReasoning}${backendQuoteDetail}${approvalDetail}${warningDetail}`.trim();
    }
    if (selectedPlanProposal?.approval_blockers?.length) {
      return `${selectedPlanProposal.approval_blockers.join("; ")}${backendQuoteDetail}${warningDetail}`.trim();
    }
    return `No AI reasoning is available for the selected session yet.${backendQuoteDetail}${warningDetail}`.trim();
  }, [
    quotesQuery.data?.quotes,
    risk?.reasoning_summary,
    selectedApprovalBlockers,
    selectedPlanProposal?.approval_blockers,
    selectedProposalLog?.status_code,
    selectedSessionPlan?.risk_assessment?.reasoning_summary,
    selectedSessionPlan?.status_reason,
    selectedWarnings,
  ]);
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
    ? selectedReasoningSummary
    : selectedSessionPlan?.status_reason ??
      selectedReasoningSummary ??
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
            Only the 10 most recent decision sessions are shown here.
          </p>
        </div>
        <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 border border-primary/20 bg-background/80 px-4 py-2 text-sm">
          <span className="font-medium text-foreground">{visibleProposals.length} Recent Proposals</span>
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
                  Showing the latest 10 recorded decision runs.
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

                {selectedSessionPlan && (
                  <SwapDetailCard
                    tokenInSymbol={activeLinkedProposal?.token_in_symbol ?? executionInputSymbol}
                    tokenOutSymbol={activeLinkedProposal?.token_out_symbol}
                    amount={activeLinkedProposal?.amount ?? selectedSessionPlan.deposit_amount}
                  />
                )}

                <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
                  <Button onClick={handleCreatePlan} disabled={working || localWarnings.length > 0}>
                    {createPlan.isPending ? "Creating..." : aiDecisionMakerEnabled ? "Create AI proposal" : "Create draft"}
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
                  <Button onClick={() => void handleApprove()} disabled={!activeProposalId || working || !selectedSessionPlan?.approval_enabled}>
                    {approveProposal.isPending ? "Approving..." : aiDecisionMakerEnabled ? "Approve plan" : "Approve plan"}
                  </Button>
                  <Button variant="outline" onClick={handleReject} disabled={!activeProposalId || working}>
                    Reject plan
                  </Button>
                </div>

                {aiDecisionMakerEnabled && selectedSessionPlan?.approval_enabled && (
                  <div className="text-sm text-success">
                    Full access AI can create the trade plan, but approved execution must still use vault funds through the ExecutorVault path.
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
                        <Select value={riskProfile} onValueChange={setRiskProfile}>
                          <SelectTrigger className="bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableRiskProfiles.map((profile) => (
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
                      <span>Vault balance: <span className="font-mono text-foreground">{availableBalance !== null ? availableBalance.toFixed(4) : "unknown"}</span></span>
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
                    {selectedReasoningSummary}
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
    </PageScaffold>
  );
}
