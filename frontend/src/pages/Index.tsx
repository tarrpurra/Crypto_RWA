import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageScaffold } from "@/components/rwa/PageScaffold";
import { useAuth } from "@/components/auth/AuthProvider";

import { AIReasoningPanel } from "@/components/ai-reasoning/AIReasoningPanel";
import { CapitalChart } from "@/components/dashboard/CapitalChart";
import { DashboardGhostShell } from "@/components/dashboard/DashboardGhostShell";
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
import { useChainStatus, useRecentBackendLogs, useSettings, useUpdateSettings } from "@/hooks/useSystem";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";
import { useVaultBalance, useWalletBalance } from "@/hooks/useVault";
import { useStrategyActive } from "@/hooks/useStrategy";
import { normalizeAddress } from "@/lib/addresses";
import { useProposals } from "@/hooks/useSwap";
import type { PortfolioPosition, PortfolioSnapshotResponse } from "@/lib/api/types";

const assetOptions = ["USDY", "mETH", "MNT"] as const;
const riskProfiles = ["Defensive", "Balanced", "Yield-Seeking"];
const REVIEW_TOAST_ID = "dashboard-review-recommendation";
const READY_TOAST_ID = "dashboard-ready-recommendation";

function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

const Index = () => {
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
  const backendLogsQuery = useRecentBackendLogs(120);
  const updateSettings = useUpdateSettings();
  const dashboardSummaryQuery = useDashboardSummary();
  const allocationQuery = useAllocationRecommendation();
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
  // Bug H fix: only pass wmntAddress after settings have loaded so the deposit
  // asset list (MNT/WMNT) is stable and doesn't flicker in/out.
  const resolvedWmntAddress = settingsQuery.isSuccess
    ? normalizeAddress(settings?.sepolia_wmnt_address) ?? undefined
    : undefined;
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
  const displayPortfolio = useMemo<PortfolioSnapshotResponse | undefined>(() => {
    if (!portfolio && !vaultData) {
      return undefined;
    }

    const snapshotValue = toNumeric(portfolio?.total_value_usd);
    const snapshotHasValuedPositions = (portfolio?.positions ?? []).some(
      (position) => toNumeric(position.value_usd) > 0,
    );
    if (portfolio && (snapshotValue > 0 || snapshotHasValuedPositions)) {
      return portfolio;
    }

    const vaultValue = toNumeric(vaultData?.total_value_usd);
    const vaultBalances = vaultData?.balances ?? [];
    const vaultHasUsableBalances = vaultBalances.some(
      (balance) =>
        toNumeric(balance.value_usd) > 0 || toNumeric(balance.balance) > 0,
    );
    if (!vaultData || (!vaultHasUsableBalances && vaultValue <= 0)) {
      return portfolio ?? undefined;
    }

    const normalizedPositions: PortfolioPosition[] = vaultBalances.map((balance) => {
      const valueUsd = toNumeric(balance.value_usd);
      const derivedWeight =
        vaultValue > 0
          ? valueUsd / vaultValue
          : typeof balance.share === "number" && Number.isFinite(balance.share)
            ? balance.share
            : 0;
      return {
        asset_key: balance.asset_symbol.toLowerCase(),
        asset_symbol: balance.asset_symbol,
        asset_address: balance.asset_address,
        chain_id: settings?.chain_id ?? chainStatus?.chain_id ?? 5003,
        balance: balance.balance,
        balance_source: "vault_balance",
        price_usd: null,
        value_usd: balance.value_usd,
        weight: derivedWeight > 0 ? String(derivedWeight) : "0",
        target_weight: null,
        weight_drift: null,
        drift_status: "not_configured",
        valuation_status: "valued",
        status_code: vaultData.status_code,
        status_reason: vaultData.status_reason,
        data_sources_used: ["vault/portfolio"],
      };
    });

    return {
      snapshot_id: portfolio?.snapshot_id ?? `vault-display-${vaultData.user_address}`,
      generated_at:
        vaultData.generated_at ??
        portfolio?.generated_at ??
        new Date().toISOString(),
      portfolio_address:
        portfolio?.portfolio_address ?? vaultData.user_address ?? null,
      chain_id: portfolio?.chain_id ?? settings?.chain_id ?? chainStatus?.chain_id ?? 5003,
      base_currency: portfolio?.base_currency ?? "USD",
      total_value_usd:
        vaultData.total_value_usd ??
        portfolio?.total_value_usd ??
        "0",
      invested_amount_usd:
        vaultData.invested_amount_usd ?? portfolio?.invested_amount_usd,
      total_deposits_usd:
        vaultData.total_deposits_usd ?? portfolio?.total_deposits_usd,
      total_withdrawals_usd:
        vaultData.total_withdrawals_usd ?? portfolio?.total_withdrawals_usd,
      pnl_usd: vaultData.pnl_usd ?? portfolio?.pnl_usd,
      pnl_percent: vaultData.pnl_percent ?? portfolio?.pnl_percent,
      positions: normalizedPositions,
      data_sources_used: portfolio?.data_sources_used ?? ["vault/portfolio"],
      status: vaultData.status,
      status_code: vaultData.status_code,
      status_label: vaultData.status_label,
      status_reason: vaultData.status_reason,
      metadata: {
        ...(portfolio?.metadata ?? {}),
        source: "vault_balance_fallback",
      },
    };
  }, [chainStatus?.chain_id, portfolio, vaultData, settings?.chain_id]);
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
  const hasConnectedSupportedWallet = Boolean(
    connectedWalletAddress && isSupportedChain,
  );
  const availableRouteCount = routesQuery.data?.routes?.length ?? 0;
  const backendWarmupLoading =
    settingsQuery.isPending ||
    chainStatusQuery.isPending ||
    dashboardSummaryQuery.isPending ||
    vaultBalanceQuery.isPending ||
    walletBalanceQuery.isPending;
  const walletActionContextReady =
    settingsQuery.isSuccess &&
    chainStatusQuery.isSuccess &&
    vaultBalanceQuery.isSuccess &&
    walletBalanceQuery.isSuccess;
  const showDashboardGhostShell =
    hasConnectedSupportedWallet &&
    backendWarmupLoading &&
    !dashboardSummaryQuery.data &&
    !vaultBalanceQuery.data &&
    !walletBalanceQuery.data;
  const aiReasoningData = useMemo<AIReasoningData | undefined>(() => {
    if (!displayPortfolio || !risk || !decisions) {
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

    const portfolioPositions = displayPortfolio.positions ?? [];
    const leadPosition = [...portfolioPositions]
      .filter((position) => position.asset_symbol && position.weight)
      .sort((left, right) => Number(right.value_usd ?? 0) - Number(left.value_usd ?? 0))[0];
    const reasoningSources = Array.from(new Set([
      ...(decisions?.data_sources_used ?? []),
      ...(risk?.data_sources_used ?? []),
      ...(displayPortfolio?.data_sources_used ?? []),
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
        lastUpdated: allocation?.generated_at ?? risk.generated_at ?? decisions?.generated_at ?? displayPortfolio.generated_at,
      },
      stages: [
        {
          id: "portfolio",
          title: "Portfolio Scan",
          status: portfolioPositions.length > 0 ? "complete" : "warning",
          description: displayPortfolio.status_reason,
          detail: leadPosition
            ? `${leadPosition.asset_symbol} is the largest sleeve at ${(Number(leadPosition.weight) * 100).toFixed(2)}%.`
            : displayPortfolio.status_reason,
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
        reasoningSummary: decisions.reasoning_summary ?? risk.reasoning_summary ?? allocation?.decision.reasoning ?? displayPortfolio.status_reason ?? "Decision generated from current backend state.",
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
          ? (risk.generated_at ?? decisions.metadata?.timestamp ?? displayPortfolio.generated_at)
          : decisions.metadata?.timestamp ?? displayPortfolio.generated_at,
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
    displayPortfolio,
    risk,
    routesQuery.data?.routes?.length,
    settings?.ai_decision_maker_enabled,
  ]);
  const pendingProposal = dashboardSummary?.pending_proposal ?? null;
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
  // Bug 6 fix: sessionStorage.getItem must NOT be called during render because
  // React 18 Strict Mode renders components twice in development, causing the
  // read to fire twice. Initialise the ref to null and populate it in a
  // one-time useEffect that runs after mount (outside the render path).
  const autoCreateProposalRef = useRef<string | null>(null);
  useEffect(() => {
    autoCreateProposalRef.current = sessionStorage.getItem("lastAutoCreateProposalKey");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — only runs once after first mount
  const launchAssetSymbol =
    primarySwapRecommendation?.token_in_symbol ?? depositAsset;
  const launchAmount = depositAmount.trim();
  const parsedDepositAmount = Number.parseFloat(launchAmount || "0");
  const suggestedLaunchAmount = primarySwapRecommendation
    ? Number.parseFloat(String(primarySwapRecommendation.amount))
    : 0;
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
    : (displayPortfolio?.metadata?.source === "vault_balance_fallback"
      ? "Portfolio totals are currently being rendered from vault balances while the snapshot refresh catches up."
      : displayPortfolio?.status_reason ??
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
      toast.dismiss(REVIEW_TOAST_ID);
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
      { id: REVIEW_TOAST_ID },
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
    if (proposalsQuery.isLoading || !primarySwapRecommendation) {
      autoCreateProposalRef.current = null;
      sessionStorage.removeItem("lastAutoCreateProposalKey");
      toast.dismiss(READY_TOAST_ID);
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
      `Recommendation is ready for ${launchAssetSymbol}. Open Decision Log when you're ready to review the proposal.`,
      { id: READY_TOAST_ID },
    );
  }, [
    connectedWalletAddress,
    effectiveWalletAddress,
    launchAmount,
    launchAssetSymbol,
    primarySwapRecommendation,
    recommendationAction,
    proposalsQuery.isLoading,
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

  const openDepositModal = useCallback(() => {
    setDepositModalOpen(true);
  }, []);

  const closeDepositModal = useCallback(() => {
    setDepositModalOpen(false);
  }, []);

  const openWithdrawModal = useCallback(() => {
    setWithdrawModalOpen(true);
  }, []);

  const closeWithdrawModal = useCallback(() => {
    setWithdrawModalOpen(false);
  }, []);

  const dashboardContent = useMemo(() => {
    if (!hasConnectedSupportedWallet) {
      return (
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
      );
    }

    if (showDashboardGhostShell) {
      return <DashboardGhostShell />;
    }

    return (
      <>
        <PortfolioSummary
          portfolio={displayPortfolio}
          vaultData={vaultData}
          isLoading={dashboardSummaryQuery.isLoading}
          detail={portfolioDetail}
          risk={risk ?? undefined}
          riskProfile={riskProfile}
          allocation={allocation}
          decisions={decisions}
          freshness={dashboardSummary?.freshness ?? null}
          onDeposit={openDepositModal}
          onWithdraw={openWithdrawModal}
          depositDisabled={!walletActionContextReady}
          withdrawDisabled={!walletActionContextReady}
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
              portfolio={displayPortfolio}
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
            !risk &&
            !decisions &&
            dashboardSummaryQuery.isLoading
          }
          hasConnectedWallet={hasConnectedSupportedWallet}
          aiDecisionMakerEnabled={aiDecisionMakerEnabled}
          onAiAccessChange={updateAiAccess}
          isAiAccessPending={updateSettings.isPending}
          swapRecommendations={swapRecommendations}
          availableRouteCount={availableRouteCount}
          backendLogs={backendLogsQuery.data?.entries}
          backendLogsLoading={backendLogsQuery.isLoading || backendLogsQuery.isFetching}
        />
      </>
    );
  }, [
    aiDecisionMakerEnabled,
    aiReasoningData,
    allocation,
    availableRouteCount,
    backendLogsQuery.data?.entries,
    backendLogsQuery.isFetching,
    backendLogsQuery.isLoading,
    chartAssets,
    chartBucket,
    chartDemo,
    chartLoading,
    chartPoints,
    chartRange,
    dashboardSummary?.freshness,
    dashboardSummaryQuery.isLoading,
    decisions,
    displayPortfolio,
    hasConnectedSupportedWallet,
    login,
    openDepositModal,
    openWithdrawModal,
    portfolioDetail,
    risk,
    riskProfile,
    showDashboardGhostShell,
    swapRecommendations,
    updateSettings.isPending,
  ]);

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
        {dashboardContent}
      </PageScaffold>

      <DepositModal
        open={depositModalOpen}
        onClose={closeDepositModal}
        walletData={hasConnectedSupportedWallet ? walletData : undefined}
        vaultAddress={resolvedVaultAddress}
        wmntAddress={resolvedWmntAddress}
        walletContextReady={!hasConnectedSupportedWallet || walletActionContextReady}
        // Bug E fix: pass native MNT balance so DepositModal shows it when
        // asset === "MNT" (native coin is not in walletData.balances).
        nativeMntBalance={hasConnectedSupportedWallet && walletBalanceQuery.data
          ? Number.parseFloat(walletBalanceQuery.data.balances?.find(b => b.asset_symbol === "MNT")?.balance ?? "0") || null
          : null}
        nativeMntEnabled={settings?.native_mnt_enabled ?? false}
        suggestedAsset={primarySwapRecommendation?.token_in_symbol ?? undefined}
        suggestedAmount={
          suggestedLaunchAmount > 0 ? String(suggestedLaunchAmount) : undefined
        }
      />
      <WithdrawModal
        open={withdrawModalOpen}
        onClose={closeWithdrawModal}
        vaultData={hasConnectedSupportedWallet ? vaultData : undefined}
        vaultAddress={resolvedVaultAddress}
        wmntAddress={normalizeAddress(settings?.sepolia_wmnt_address) ?? undefined}
        nativeMntEnabled={settings?.native_mnt_enabled ?? false}
      />
    </div>
  );
};

export default Index;
