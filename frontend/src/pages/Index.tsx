import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageScaffold } from "@/components/rwa/PageScaffold";
import { useAuth } from "@/components/auth/AuthProvider";

import { AIReasoningPanel } from "@/components/ai-reasoning/AIReasoningPanel";
import { CapitalChart } from "@/components/dashboard/CapitalChart";
import { PortfolioAllocationChart } from "@/components/dashboard/PortfolioAllocationChart";
import { PortfolioSummary } from "@/components/dashboard/PortfolioSummary";
import { DepositModal } from "@/components/dashboard/DepositModal";
import { WithdrawModal } from "@/components/dashboard/WithdrawModal";
import type { AIAction, AIReasoningData } from "@/components/ai-reasoning/types";
import { useDecisions } from "@/hooks/useDecisions";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAllocationRecommendation } from "@/hooks/useAllocation";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useInvestmentScope } from "@/hooks/useInvestmentScope";
import { useLatestPrices, useLatestQuotes, useMarketIngestionStatus, useMarketRoutes, usePriceHistory } from "@/hooks/useMarket";
import { useChainStatus, useSettings, useUpdateSettings } from "@/hooks/useSystem";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";
import { useVaultBalance, useWalletBalance } from "@/hooks/useVault";
import { useStrategyActive } from "@/hooks/useStrategy";
import { normalizeAddress } from "@/lib/addresses";
import { useCreateProposal, useProposals } from "@/hooks/useSwap";

const assetOptions = ["USDY", "mETH", "MNT"] as const;
const riskProfiles = ["Defensive", "Balanced", "Yield-Seeking"];

const Index = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { scope, setScope, clearScope } = useInvestmentScope();
  const [depositAsset, setDepositAsset] =
    useState<(typeof assetOptions)[number]>("MNT");
  const [depositAmount, setDepositAmount] = useState("");
  const [riskProfile, setRiskProfile] = useState("Balanced");
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const settingsQuery = useSettings();
  const chainStatusQuery = useChainStatus();
  const updateSettings = useUpdateSettings();
  const dashboardSummaryQuery = useDashboardSummary();
  const allocationQuery = useAllocationRecommendation();
  const createProposal = useCreateProposal();
  const proposalsQuery = useProposals();
  const marketIngestionQuery = useMarketIngestionStatus();
  const latestPricesQuery = useLatestPrices();
  const latestQuotesQuery = useLatestQuotes();
  const routesQuery = useMarketRoutes();
  const decisionsQuery = useDecisions();

  const chartAssets = ["mETH", "USDY", "WMNT", "MNT"];
  const [chartRange, setChartRange] = useState("24h");
  const [chartBucket, setChartBucket] = useState("1h");
  const methHistory = usePriceHistory("mETH", chartRange, chartBucket);
  const usdyHistory = usePriceHistory("USDY", chartRange, chartBucket);
  const wmntHistory = usePriceHistory("WMNT", chartRange, chartBucket);
  const mntHistory = usePriceHistory("MNT", chartRange, chartBucket);
  const { effectiveWalletAddress, connectedWalletAddress, isSupportedChain } =
    usePortfolioWallet();
  const strategyActiveQuery = useStrategyActive(
    effectiveWalletAddress ?? connectedWalletAddress ?? null,
  );
  const vaultBalanceQuery = useVaultBalance();
  const walletBalanceQuery = useWalletBalance();

  const settings = settingsQuery.data;
  const activeStrategyLabel = strategyActiveQuery.data?.active_version?.version
    ? `Custom Strategy ${strategyActiveQuery.data.active_version.version}`
    : null;
  const chainStatus = chainStatusQuery.data;
  const resolvedVaultAddress =
    normalizeAddress(vaultBalanceQuery.data?.vault_address) ??
    normalizeAddress(chainStatus?.executor_vault?.address);
  const dashboardSummary = dashboardSummaryQuery.data;
  const portfolio = dashboardSummary?.portfolio ?? null;
  const marketIngestion = marketIngestionQuery.data;
  const latestPrices = latestPricesQuery.data;
  const latestQuotes = latestQuotesQuery.data;
  const vaultData = vaultBalanceQuery.data;
  const walletData = walletBalanceQuery.data;
  const resolvedWalletData =
    walletData ??
    (portfolio
      ? {
          status: portfolio.status,
          status_code: portfolio.status_code,
          status_label: portfolio.status_label,
          status_reason: portfolio.status_reason,
          vault_address: "",
          vault_label: "Wallet",
          user_address: effectiveWalletAddress ?? "",
          total_value_usd: portfolio.total_value_usd,
          balances: (portfolio.positions ?? []).map((p) => ({
            asset_symbol: p.asset_symbol,
            asset_address: p.asset_address,
            balance: p.balance ?? "0",
            value_usd: p.value_usd,
            share: 0,
          })),
          pending_deposits: 0,
          pending_withdrawals: 0,
        }
      : undefined);
  const resolvedVaultData = vaultData ?? resolvedWalletData;
  const risk = dashboardSummary?.risk ?? null;
  const allocation = allocationQuery.data;
  const chartPoints = useMemo(() => {
    const result: Record<string, import("@/lib/api/types").PriceHistoryPoint[]> = {};
    const queries = [
      { asset: "mETH", data: methHistory.data },
      { asset: "USDY", data: usdyHistory.data },
      { asset: "WMNT", data: wmntHistory.data },
      { asset: "MNT", data: mntHistory.data },
    ];
    for (const q of queries) {
      if (q.data?.points) {
        result[q.asset] = q.data.points;
      }
    }
    return result;
  }, [methHistory.data, usdyHistory.data, wmntHistory.data, mntHistory.data]);

  const chartDemo = methHistory.data?.demo ?? usdyHistory.data?.demo ?? false;
  const chartLoading = methHistory.isLoading || usdyHistory.isLoading || wmntHistory.isLoading || mntHistory.isLoading;
  const decisions = decisionsQuery.data;
  const availableRouteCount = routesQuery.data?.routes?.length ?? 0;
  const aiReasoningData = useMemo<AIReasoningData | undefined>(() => {
    if (!portfolio || !risk || !decisions) {
      return undefined;
    }

    const decisionMakerEnabled = settings?.ai_decision_maker_enabled ?? false;

    const action = (allocation?.decision.recommended_action ??
      risk?.recommended_action ??
      decisions?.recommended_action ??
      "HOLD") as AIAction;
    const confidence =
      allocation?.decision.confidence ??
      risk?.confidence_normalized ??
      risk?.confidence ??
      decisions?.confidence ??
      0;
    const executionGate = risk?.hard_veto_status === "active"
      ? "blocked_by_guardrail"
      : !decisionMakerEnabled
        ? "needs_human_approval"
        : decisions?.ai_debug?.mode === "simulation"
          ? "simulation_only"
          : "allowed";

    const portfolioPositions = portfolio.positions ?? [];
    const leadPosition = [...portfolioPositions]
      .filter((position) => position.asset_symbol && position.weight)
      .sort((left, right) => Number(right.value_usd ?? 0) - Number(left.value_usd ?? 0))[0];
    const reasoningSources = Array.from(new Set([
      ...(decisions?.data_sources_used ?? []),
      ...(risk?.data_sources_used ?? []),
      ...(portfolio?.data_sources_used ?? []),
    ]));
    const reasoningNotes = [
      ...(risk?.notes ?? []),
      ...(decisions?.notes ?? []),
      ...(decisions?.constraints_applied ?? []),
    ];

    const marketSummary = [
      `${latestPrices?.prices?.length ?? 0} prices`,
      `${latestQuotes?.quotes?.length ?? 0} quotes`,
      `${routesQuery.data?.routes?.length ?? 0} routes`,
      `${marketIngestion?.assets?.length ?? 0} ingestion records`,
    ].join(", ");

    const oracleBucket = risk.buckets.find((bucket) => bucket.bucket === "oracle_freshness");
    const policyBucket = risk.buckets.find((bucket) => bucket.bucket === "policy_guard");
    const slippageBucket = risk.buckets.find((bucket) => bucket.bucket === "liquidity_slippage");
    const concentrationBucket = risk.buckets.find((bucket) => bucket.bucket === "concentration_drift");

    return {
      summary: {
        action,
        riskBand: risk.risk_band,
        executionGate,
        confidence,
        mode: decisions?.ai_debug?.mode ?? risk.runtime_mode,
        lastUpdated: allocation?.generated_at ?? risk.generated_at ?? decisions?.generated_at ?? portfolio.generated_at,
      },
      stages: [
        {
          id: "portfolio",
          title: "Portfolio Scan",
          status: portfolioPositions.length > 0 ? "complete" : "warning",
          description: portfolio.status_reason,
          detail: leadPosition
            ? `${leadPosition.asset_symbol} is the largest sleeve at ${(Number(leadPosition.weight) * 100).toFixed(2)}%.`
            : portfolio.status_reason,
          evidenceTags: reasoningSources.slice(0, 4),
        },
        {
          id: "market",
          title: "Market Fetch",
          status: latestPrices?.prices?.length || latestQuotes?.quotes?.length || routesQuery.data?.routes?.length ? "complete" : "warning",
          description: marketSummary,
          detail: marketSummary,
          evidenceTags: [
            latestPrices?.prices?.length ? `prices:${latestPrices.prices.length}` : null,
            latestQuotes?.quotes?.length ? `quotes:${latestQuotes.quotes.length}` : null,
            routesQuery.data?.routes?.length ? `routes:${routesQuery.data.routes.length}` : null,
          ].filter((value): value is string => Boolean(value)),
        },
        {
          id: "oracle",
          title: "Oracle Check",
          status: oracleBucket?.hard_veto ? "blocked" : oracleBucket?.status_code === "RISK_NORMAL" ? "complete" : "warning",
          description: oracleBucket?.reason ?? risk.reasoning_summary,
          detail: oracleBucket?.reason ?? "Oracle freshness is within the safe execution threshold.",
          evidenceTags: oracleBucket?.data_sources_used ?? [],
        },
        {
          id: "policy",
          title: "Policy Guard",
          status: risk.hard_veto_status === "active" ? "blocked" : policyBucket?.status_code === "RISK_NORMAL" ? "complete" : "warning",
          description: policyBucket?.reason ?? "Backend policy guards were evaluated.",
          detail: policyBucket?.reason
            ?? (risk.hard_veto_status === "active"
              ? "One or more policy guards blocked new allocation."
              : "Guard conditions require approval before allocation can proceed."),
          evidenceTags: [
            concentrationBucket?.reason ? "concentration" : null,
            slippageBucket?.reason ? "slippage" : null,
          ].filter((value): value is string => Boolean(value)),
        },
        {
          id: "final",
          title: "Final Decision",
          status: action === "PAUSE" ? "blocked" : executionGate === "allowed" ? "complete" : "warning",
          description: decisions.reasoning_summary ?? risk.reasoning_summary,
          detail: action === "PAUSE"
            ? "Pause strategy and request human approval."
            : executionGate === "allowed"
              ? "Decision is ready to move into execution."
              : "Recommendation is ready but still requires human approval.",
          evidenceTags: [
            risk.risk_band,
            risk.hard_veto_status,
            decisions.ai_debug?.mode ?? null,
          ].filter((value): value is string => Boolean(value)),
        },
      ],
      guardrails: [
        ...(risk.buckets ?? [])
          .filter((bucket) => bucket.reason)
          .slice(0, 4)
          .map((bucket) => ({
            name: bucket.bucket,
            severity: bucket.hard_veto ? "hard_block" : bucket.status_code === "RISK_NORMAL" ? "info" : "warning",
            message: bucket.reason,
            blocksExecution: bucket.hard_veto,
          })),
        ...(reasoningNotes.length > 0
          ? [{
              name: "notes",
              severity: "info",
              message: reasoningNotes[0],
              blocksExecution: false,
            }]
          : []),
      ],
      decision: {
        recommendedAction: action,
        reasoningSummary: decisions.reasoning_summary ?? risk.reasoning_summary ?? allocation?.decision.reasoning ?? portfolio.status_reason ?? "Decision generated from current backend state.",
        constraints: decisions.constraints_applied ?? [],
        nextStep: risk.hard_veto_status === "active"
          ? "Execution is blocked until the guard condition clears and inputs return to a safe state."
          : !decisionMakerEnabled
            ? "A human review is required before the proposal can move into execution."
            : action === "PAUSE"
              ? "Pause strategy and request human approval."
              : "Decision is ready to move into execution.",
      },
      events: reasoningNotes.slice(0, 4).map((message, index) => ({
        timestamp: index === 0
          ? (risk.generated_at ?? decisions.metadata?.timestamp ?? portfolio.generated_at)
          : decisions.metadata?.timestamp ?? portfolio.generated_at,
        level: message.toLowerCase().includes("warning") || message.toLowerCase().includes("risk")
          ? "warning"
          : "info",
        message,
      })),
    };
  }, [
    allocation?.decision.confidence,
    allocation?.decision.reasoning,
    allocation?.generated_at,
    decisions,
    latestPrices?.prices,
    latestQuotes?.quotes,
    marketIngestion?.assets,
    portfolio,
    risk,
    routesQuery.data?.routes?.length,
    settings?.ai_decision_maker_enabled,
  ]);
  const pendingProposal = dashboardSummary?.pending_proposal ?? null;
  const hasConnectedSupportedWallet = Boolean(
    connectedWalletAddress && isSupportedChain,
  );
  const aiDecisionMakerEnabled = settings?.ai_decision_maker_enabled ?? false;
  const recommendationAction = (aiReasoningData?.summary.action ??
    allocation?.decision.recommended_action ??
    risk?.recommended_action ??
    decisions?.recommended_action ??
    "HOLD") as AIAction;
  const swapRecommendations =
    allocation?.decision.recommended_action === "REBALANCE"
      ? allocation.rebalance_actions.filter(
          (action) => action.action !== "HOLD" && action.amount > 0,
        )
      : [];
  const primarySwapRecommendation = swapRecommendations[0] ?? null;
  const swapPairLabel = primarySwapRecommendation
    ? (primarySwapRecommendation.swap_pair_label ??
      (primarySwapRecommendation.token_in_symbol &&
      primarySwapRecommendation.token_out_symbol
        ? `${primarySwapRecommendation.token_in_symbol} -> ${primarySwapRecommendation.token_out_symbol}`
        : primarySwapRecommendation.asset_symbol))
    : null;
  const lastRecommendationToastRef = useRef<string | null>(null);
  const autoCreateProposalRef = useRef<string | null>(
    sessionStorage.getItem("lastAutoCreateProposalKey"),
  );
  const launchAssetSymbol =
    primarySwapRecommendation?.token_in_symbol ?? depositAsset;
  const launchAmount = depositAmount.trim();
  const parsedDepositAmount = Number.parseFloat(launchAmount || "0");
  const suggestedLaunchAmount = primarySwapRecommendation
    ? Number.parseFloat(String(primarySwapRecommendation.amount))
    : 0;
  const launchAssetBalance = useMemo(() => {
    const candidates = resolvedVaultData?.balances ?? [];
    const position =
      candidates.find((item) => item.asset_symbol === launchAssetSymbol) ??
      (launchAssetSymbol === "MNT"
        ? candidates.find((item) => item.asset_symbol === "WMNT")
        : undefined) ??
      (launchAssetSymbol === "WMNT"
        ? candidates.find((item) => item.asset_symbol === "MNT")
        : undefined);
    return position?.balance?.trim() ?? "";
  }, [launchAssetSymbol, resolvedVaultData?.balances]);
  const hasActivePlan = useMemo(() => {
    const wallet = effectiveWalletAddress?.toLowerCase();
    if (!wallet || !pendingProposal) {
      return false;
    }
    if (pendingProposal.wallet_or_vault.toLowerCase() !== wallet) {
      return false;
    }
    return [
      "EXECUTION_READY",
      "PROPOSAL_APPROVED",
      "PROPOSAL_PENDING_APPROVAL",
    ].includes(pendingProposal.status_code);
  }, [effectiveWalletAddress, pendingProposal]);
  const depositAmountReady =
    !hasConnectedSupportedWallet ||
    parsedDepositAmount > 0 ||
    suggestedLaunchAmount > 0;
  const portfolioDetail = !effectiveWalletAddress
    ? ""
    : (portfolio?.status_reason ??
      (effectiveWalletAddress
        ? "Reading /portfolio/current with explicit wallet scope."
        : ""));

  useEffect(() => {
    if (!scope) {
      return;
    }
    if (
      assetOptions.includes(
        scope.depositAssetSymbol as (typeof assetOptions)[number],
      )
    ) {
      setDepositAsset(
        scope.depositAssetSymbol as (typeof assetOptions)[number],
      );
    }
    if (typeof scope.riskProfile === "string" && scope.riskProfile.trim()) {
      setRiskProfile(scope.riskProfile);
    }
  }, [scope]);

  useEffect(() => {
    if (!activeStrategyLabel) {
      return;
    }
    if (!riskProfiles.includes(riskProfile)) {
      return;
    }
    setRiskProfile(activeStrategyLabel);
  }, [activeStrategyLabel, riskProfile]);

  useEffect(() => {
    if (
      !hasConnectedSupportedWallet ||
      aiDecisionMakerEnabled ||
      !primarySwapRecommendation ||
      hasActivePlan
    ) {
      lastRecommendationToastRef.current = null;
      return;
    }

    const recommendationKey = swapRecommendations
      .map(
        (action) =>
          `${action.token_in_symbol ?? action.asset_symbol}:${action.token_out_symbol ?? action.asset_symbol}:${action.action}:${action.amount}`,
      )
      .join("|");
    if (lastRecommendationToastRef.current === recommendationKey) {
      return;
    }

    lastRecommendationToastRef.current = recommendationKey;
    toast.info(
      `Review ${swapRecommendations.length > 1 ? `${swapRecommendations.length} swap legs` : `${swapPairLabel ?? primarySwapRecommendation.asset_symbol} ${primarySwapRecommendation.action} ${primarySwapRecommendation.amount.toFixed(4)}`} on the trade page.`,
    );
  }, [
    aiDecisionMakerEnabled,
    hasActivePlan,
    hasConnectedSupportedWallet,
    primarySwapRecommendation,
    swapPairLabel,
    swapRecommendations,
  ]);

  useEffect(() => {
    if (!aiDecisionMakerEnabled || proposalsQuery.isLoading || recommendationAction !== "REBALANCE" || !primarySwapRecommendation) {
      autoCreateProposalRef.current = null;
      sessionStorage.removeItem("lastAutoCreateProposalKey");
      return;
    }
    const effectiveAmount =
      launchAmount ||
      (primarySwapRecommendation
        ? String(primarySwapRecommendation.amount)
        : "");
    const effectiveParsed = Number.parseFloat(effectiveAmount || "0");
    if (
      !effectiveAmount ||
      !Number.isFinite(effectiveParsed) ||
      effectiveParsed <= 0
    ) {
      return;
    }
    const totalVaultValue = Number.parseFloat(resolvedVaultData?.total_value_usd ?? "0");
    if (!resolvedVaultData?.balances?.length || !Number.isFinite(totalVaultValue) || totalVaultValue <= 0) {
      toast.warning("Deposit funds into the vault before AI can create a trade proposal.");
      return;
    }
    if (launchAssetBalance && Number.parseFloat(launchAssetBalance) < effectiveParsed) {
      toast.warning("Vault balance is too low for AI proposal creation.");
      return;
    }

    const autoCreateKey = [
      recommendationAction,
      riskProfile,
      launchAssetSymbol,
      ...swapRecommendations.map(
        (action) =>
          `${action.token_in_symbol ?? action.asset_symbol}:${action.token_out_symbol ?? action.asset_symbol}:${action.action}:${action.amount}`,
      ),
    ].join("|");
    if (autoCreateProposalRef.current === autoCreateKey) {
      return;
    }

    autoCreateProposalRef.current = autoCreateKey;
    sessionStorage.setItem("lastAutoCreateProposalKey", autoCreateKey);
    toast.info(
      "AI is generating a guarded proposal from the current recommendation.",
    );
    createProposal.mutate(
      {
        wallet_address: effectiveWalletAddress ?? connectedWalletAddress ?? null,
        deposit_asset_symbol: launchAssetSymbol,
        deposit_amount: effectiveParsed,
        risk_profile: riskProfile,
        allocation_mode: "AI Suggested",
      },
      {
        onSuccess: (response) => {
          toast.success(response.status_reason);
          navigate("/decision-log");
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Failed to create proposal from AI recommendation.");
        },
      },
    );
  }, [
    aiDecisionMakerEnabled,
    connectedWalletAddress,
    createProposal,
    effectiveWalletAddress,
    launchAmount,
    launchAssetBalance,
    launchAssetSymbol,
    navigate,
    primarySwapRecommendation,
    recommendationAction,
    proposalsQuery.isLoading,
    resolvedVaultData?.balances,
    resolvedVaultData?.total_value_usd,
    swapRecommendations,
    riskProfile,
  ]);

  useEffect(() => {
    if (!hasConnectedSupportedWallet) {
      clearScope();
      return;
    }
    if (!Number.isFinite(parsedDepositAmount) || parsedDepositAmount <= 0) {
      clearScope();
      return;
    }
    setScope({
      depositAssetSymbol: depositAsset,
      depositAmount: parsedDepositAmount,
      riskProfile,
      allocationMode: "AI Suggested",
      chainId: 5003,
    });
  }, [
    clearScope,
    depositAsset,
    hasConnectedSupportedWallet,
    parsedDepositAmount,
    riskProfile,
    setScope,
  ]);

  const updateAiAccess = (enabled: boolean) => {
    updateSettings.mutate({ ai_decision_maker_enabled: enabled });
  };

  return (
    <div
      data-testid="overview-page"
      className="flex min-h-full flex-1 flex-col"
    >
      <PageScaffold
        eyebrow="YieldMind"
        title="Dashboard"
        description="AI-powered yield optimization with real-time risk management for RWA portfolios."
      >
        {/* Portfolio Section */}
        {hasConnectedSupportedWallet ? (
          <>
            <PortfolioSummary
              portfolio={portfolio ?? undefined}
              vaultData={resolvedVaultData}
              isLoading={dashboardSummaryQuery.isLoading}
              detail={portfolioDetail}
              risk={risk ?? undefined}
              riskProfile={riskProfile}
              allocation={allocation}
              decisions={decisions}
              freshness={dashboardSummary?.freshness ?? null}
              onDeposit={() => setDepositModalOpen(true)}
              onWithdraw={() => setWithdrawModalOpen(true)}
            >
              <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
                <CapitalChart
                  points={chartPoints}
                  isLoading={chartLoading}
                  isDemo={chartDemo}
                  availableAssets={chartAssets}
                  range={chartRange}
                  bucket={chartBucket}
                  onRangeChange={setChartRange}
                  onBucketChange={setChartBucket}
                />
                <PortfolioAllocationChart
                  portfolio={portfolio ?? undefined}
                  targetWeights={allocation?.decision?.target_weights}
                  isLoading={dashboardSummaryQuery.isLoading}
                />
              </div>
            </PortfolioSummary>

            <AIReasoningPanel
              allocation={allocation}
              risk={risk}
              decisions={decisions}
              aiReasoningData={aiReasoningData}
              isLoading={
                !allocation &&
                !risk &&
                !decisions &&
                (allocationQuery.isLoading ||
                  dashboardSummaryQuery.isLoading ||
                  decisionsQuery.isLoading)
              }
              hasConnectedWallet={hasConnectedSupportedWallet}
              aiDecisionMakerEnabled={aiDecisionMakerEnabled}
              onAiAccessChange={updateAiAccess}
              isAiAccessPending={updateSettings.isPending}
              swapRecommendations={swapRecommendations}
              availableRouteCount={availableRouteCount}
            />
          </>
        ) : (
          <section className="terminal-panel border-primary/20 p-6">
            <div className="flex flex-col items-center gap-4 py-6">
              <p className="terminal-label text-primary text-center">
                Connect or paste a wallet to unlock the AIxRWA Portfolio Vault
              </p>
              <Button
                onClick={login}
                variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/10"
              >
                Connect wallet
              </Button>
            </div>
          </section>
        )}
      </PageScaffold>

      <DepositModal
        open={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        walletData={hasConnectedSupportedWallet ? resolvedWalletData : undefined}
        vaultAddress={resolvedVaultAddress}
        wmntAddress={normalizeAddress(settings?.sepolia_wmnt_address) ?? undefined}
        nativeMntEnabled={settings?.native_mnt_enabled ?? false}
        suggestedAsset={primarySwapRecommendation?.token_in_symbol ?? undefined}
        suggestedAmount={
          suggestedLaunchAmount > 0 ? String(suggestedLaunchAmount) : undefined
        }
      />
      <WithdrawModal
        open={withdrawModalOpen}
        onClose={() => setWithdrawModalOpen(false)}
        vaultData={hasConnectedSupportedWallet ? resolvedVaultData : undefined}
        vaultAddress={resolvedVaultAddress}
        wmntAddress={normalizeAddress(settings?.sepolia_wmnt_address) ?? undefined}
        nativeMntEnabled={settings?.native_mnt_enabled ?? false}
      />
    </div>
  );
};

export default Index;
