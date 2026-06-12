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
import { usePortfolioSnapshots } from "@/hooks/usePortfolio";
import { useSettings, useUpdateSettings } from "@/hooks/useSystem";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";
import { useVaultBalance, useWalletBalance } from "@/hooks/useVault";

const assetOptions = ["USDY", "mETH", "MNT"] as const;
const riskProfiles = ["Defensive", "Balanced", "Yield-Seeking"] as const;

const Index = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { scope, setScope, clearScope } = useInvestmentScope();
  const [depositAsset, setDepositAsset] =
    useState<(typeof assetOptions)[number]>("MNT");
  const [depositAmount, setDepositAmount] = useState("");
  const [riskProfile, setRiskProfile] =
    useState<(typeof riskProfiles)[number]>("Balanced");
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const settingsQuery = useSettings();
  const updateSettings = useUpdateSettings();
  const dashboardSummaryQuery = useDashboardSummary();
  const allocationQuery = useAllocationRecommendation();
  const snapshotsQuery = usePortfolioSnapshots(10);
  const decisionsQuery = useDecisions();
  const { effectiveWalletAddress, connectedWalletAddress, isSupportedChain } =
    usePortfolioWallet();
  const vaultBalanceQuery = useVaultBalance();
  const walletBalanceQuery = useWalletBalance();

  const settings = settingsQuery.data;
  const dashboardSummary = dashboardSummaryQuery.data;
  const portfolio = dashboardSummary?.portfolio ?? null;
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
  const snapshots = snapshotsQuery.data;
  const decisions = decisionsQuery.data;
  const pendingProposal = dashboardSummary?.pending_proposal ?? null;
  const hasConnectedSupportedWallet = Boolean(
    connectedWalletAddress && isSupportedChain,
  );
  const aiDecisionMakerEnabled = settings?.ai_decision_maker_enabled ?? false;
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
  const autoLaunchTradeFlowRef = useRef<string | null>(
    sessionStorage.getItem("lastAutoLaunchKey"),
  );
  const launchAssetSymbol =
    primarySwapRecommendation?.token_in_symbol ?? depositAsset;
  const launchAmount = depositAmount.trim();
  const parsedDepositAmount = Number.parseFloat(launchAmount || "0");
  const suggestedLaunchAmount = primarySwapRecommendation
    ? Number.parseFloat(String(primarySwapRecommendation.amount))
    : 0;
  const launchAssetBalance = useMemo(() => {
    const candidates = portfolio?.positions ?? [];
    const position =
      candidates.find((item) => item.asset_symbol === launchAssetSymbol) ??
      (launchAssetSymbol === "MNT"
        ? candidates.find((item) => item.asset_symbol === "WMNT")
        : undefined) ??
      (launchAssetSymbol === "WMNT"
        ? candidates.find((item) => item.asset_symbol === "MNT")
        : undefined);
    return position?.balance?.trim() ?? "";
  }, [launchAssetSymbol, portfolio?.positions]);
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
  const launchTradeFlow = (reviewMode = false) => {
    const launchAsset = launchAssetSymbol;
    const effectiveAmount =
      launchAmount ||
      (primarySwapRecommendation
        ? String(primarySwapRecommendation.amount)
        : "");
    const params = new URLSearchParams({
      asset: launchAsset,
      amount: effectiveAmount,
      risk: riskProfile,
    });
    if (reviewMode) {
      params.set("review", "1");
    }
    navigate(`/decision-log?${params.toString()}`);
  };

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
    if (
      riskProfiles.includes(scope.riskProfile as (typeof riskProfiles)[number])
    ) {
      setRiskProfile(scope.riskProfile as (typeof riskProfiles)[number]);
    }
  }, [scope]);

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
    if (
      !hasConnectedSupportedWallet ||
      !aiDecisionMakerEnabled ||
      !primarySwapRecommendation ||
      hasActivePlan
    ) {
      autoLaunchTradeFlowRef.current = null;
      sessionStorage.removeItem("lastAutoLaunchKey");
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
    if (!launchAssetBalance) {
      return;
    }
    if (Number.parseFloat(launchAssetBalance) < effectiveParsed) {
      toast.warning("Balance too low for auto-execution.");
      return;
    }

    const autoLaunchKey = swapRecommendations
      .map(
        (action) =>
          `${action.token_in_symbol ?? action.asset_symbol}:${action.token_out_symbol ?? action.asset_symbol}:${action.action}:${action.amount}`,
      )
      .join("|");
    if (autoLaunchTradeFlowRef.current === autoLaunchKey) {
      return;
    }

    autoLaunchTradeFlowRef.current = autoLaunchKey;
    sessionStorage.setItem("lastAutoLaunchKey", autoLaunchKey);
    toast.info(
      `Full access AI is opening the trade flow and will execute ${swapRecommendations.length > 1 ? `${swapRecommendations.length} linked swap legs` : `${swapPairLabel ?? primarySwapRecommendation.asset_symbol} ${primarySwapRecommendation.action === "BUY" ? "buy" : primarySwapRecommendation.action}`} automatically.`,
    );
    launchTradeFlow(false);
  }, [
    aiDecisionMakerEnabled,
    hasActivePlan,
    hasConnectedSupportedWallet,
    launchAmount,
    launchAssetBalance,
    launchTradeFlow,
    primarySwapRecommendation,
    parsedDepositAmount,
    swapPairLabel,
    swapRecommendations,
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
        eyebrow="AIYield"
        title="Dashboard"
        description="AI-powered yield optimization with real-time risk management for RWA portfolios."
      >
        {/* Portfolio Section */}
        {effectiveWalletAddress ? (
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
                  snapshots={snapshots?.snapshots}
                  isLoading={snapshotsQuery.isLoading}
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
        walletData={resolvedWalletData}
        suggestedAsset={primarySwapRecommendation?.token_in_symbol ?? undefined}
        suggestedAmount={
          suggestedLaunchAmount > 0 ? String(suggestedLaunchAmount) : undefined
        }
      />
      <WithdrawModal
        open={withdrawModalOpen}
        onClose={() => setWithdrawModalOpen(false)}
        vaultData={resolvedVaultData}
      />
    </div>
  );
};

export default Index;
