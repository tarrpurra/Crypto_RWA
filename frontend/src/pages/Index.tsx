import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { useAuth } from "@/components/auth/AuthProvider";

import { PortfolioAllocationChart } from "@/components/dashboard/PortfolioAllocationChart";
import { CapitalChart } from "@/components/dashboard/CapitalChart";
import { AISwapPanel } from "@/components/dashboard/AISwapPanel";
import { PortfolioSummary } from "@/components/dashboard/PortfolioSummary";
import { VaultBalance } from "@/components/dashboard/VaultBalance";
import { DepositModal } from "@/components/dashboard/DepositModal";
import { WithdrawModal } from "@/components/dashboard/WithdrawModal";
import { useDecisions } from "@/hooks/useDecisions";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [depositAsset, setDepositAsset] = useState<(typeof assetOptions)[number]>("MNT");
  const [depositAmount, setDepositAmount] = useState("");
  const [riskProfile, setRiskProfile] = useState<(typeof riskProfiles)[number]>("Balanced");
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const settingsQuery = useSettings();
  const updateSettings = useUpdateSettings();
  const dashboardSummaryQuery = useDashboardSummary();
  const allocationQuery = useAllocationRecommendation();
  const snapshotsQuery = usePortfolioSnapshots(10);
  const decisionsQuery = useDecisions();
  const { effectiveWalletAddress, connectedWalletAddress, isSupportedChain } = usePortfolioWallet();
  const vaultBalanceQuery = useVaultBalance();
  const walletBalanceQuery = useWalletBalance();

  const settings = settingsQuery.data;
  const dashboardSummary = dashboardSummaryQuery.data;
  const portfolio = dashboardSummary?.portfolio ?? null;
  const vaultData = vaultBalanceQuery.data;
  const walletData = walletBalanceQuery.data;
  const resolvedWalletData = walletData ?? (portfolio ? {
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
  } : undefined);
  const resolvedVaultData = vaultData ?? resolvedWalletData;
  const risk = dashboardSummary?.risk ?? null;
  const allocation = allocationQuery.data;
  const snapshots = snapshotsQuery.data;
  const decisions = decisionsQuery.data;
  const pendingProposal = dashboardSummary?.pending_proposal ?? null;
  const hasConnectedSupportedWallet = Boolean(connectedWalletAddress && isSupportedChain);
  const aiDecisionMakerEnabled = settings?.ai_decision_maker_enabled ?? false;
  const swapRecommendations =
    allocation?.decision.recommended_action === "REBALANCE"
      ? allocation.rebalance_actions.filter((action) => action.action !== "HOLD" && action.amount > 0)
      : [];
  const primarySwapRecommendation = swapRecommendations[0] ?? null;
  const swapPairLabel = primarySwapRecommendation
    ? primarySwapRecommendation.swap_pair_label
      ?? (primarySwapRecommendation.token_in_symbol && primarySwapRecommendation.token_out_symbol
        ? `${primarySwapRecommendation.token_in_symbol} -> ${primarySwapRecommendation.token_out_symbol}`
        : primarySwapRecommendation.asset_symbol)
    : null;
  const lastRecommendationToastRef = useRef<string | null>(null);
  const autoLaunchTradeFlowRef = useRef<string | null>(
    sessionStorage.getItem("lastAutoLaunchKey"),
  );
  const launchAssetSymbol = primarySwapRecommendation?.token_in_symbol ?? depositAsset;
  const launchAmount = depositAmount.trim();
  const parsedDepositAmount = Number.parseFloat(launchAmount || "0");
  const suggestedLaunchAmount = primarySwapRecommendation ? Number.parseFloat(String(primarySwapRecommendation.amount)) : 0;
  const launchAssetBalance = useMemo(() => {
    const candidates = portfolio?.positions ?? [];
    const position = candidates.find((item) => item.asset_symbol === launchAssetSymbol)
      ?? (launchAssetSymbol === "MNT" ? candidates.find((item) => item.asset_symbol === "WMNT") : undefined)
      ?? (launchAssetSymbol === "WMNT" ? candidates.find((item) => item.asset_symbol === "MNT") : undefined);
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
    return ["EXECUTION_READY", "PROPOSAL_APPROVED", "PROPOSAL_PENDING_APPROVAL"].includes(pendingProposal.status_code);
  }, [effectiveWalletAddress, pendingProposal]);
  const depositAmountReady = !hasConnectedSupportedWallet
    || parsedDepositAmount > 0
    || suggestedLaunchAmount > 0;
  const portfolioDetail =
    !effectiveWalletAddress
      ? ""
      : portfolio?.status_reason ?? (effectiveWalletAddress ? "Reading /portfolio/current with explicit wallet scope." : "");
  const riskDetail =
    !effectiveWalletAddress
      ? ""
      : risk?.reasoning_summary ?? "";

  const launchTradeFlow = (reviewMode = false) => {
    const launchAsset = launchAssetSymbol;
    const effectiveAmount = launchAmount || (primarySwapRecommendation ? String(primarySwapRecommendation.amount) : "");
    const params = new URLSearchParams({
      asset: launchAsset,
      amount: effectiveAmount,
      risk: riskProfile,
    });
    if (reviewMode) {
      params.set("review", "1");
    }
    navigate(`/trade?${params.toString()}`);
  };

  useEffect(() => {
    if (!scope) {
      return;
    }
    if (assetOptions.includes(scope.depositAssetSymbol as (typeof assetOptions)[number])) {
      setDepositAsset(scope.depositAssetSymbol as (typeof assetOptions)[number]);
    }
    if (riskProfiles.includes(scope.riskProfile as (typeof riskProfiles)[number])) {
      setRiskProfile(scope.riskProfile as (typeof riskProfiles)[number]);
    }
  }, [scope]);

  useEffect(() => {
    if (!hasConnectedSupportedWallet || aiDecisionMakerEnabled || !primarySwapRecommendation || hasActivePlan) {
      lastRecommendationToastRef.current = null;
      return;
    }

    const recommendationKey = swapRecommendations
      .map((action) => `${action.token_in_symbol ?? action.asset_symbol}:${action.token_out_symbol ?? action.asset_symbol}:${action.action}:${action.amount}`)
      .join("|");
    if (lastRecommendationToastRef.current === recommendationKey) {
      return;
    }

    lastRecommendationToastRef.current = recommendationKey;
    toast.info(
      `Review ${swapRecommendations.length > 1 ? `${swapRecommendations.length} swap legs` : `${swapPairLabel ?? primarySwapRecommendation.asset_symbol} ${primarySwapRecommendation.action} ${primarySwapRecommendation.amount.toFixed(4)}`} on the trade page.`,
    );
  }, [aiDecisionMakerEnabled, hasActivePlan, hasConnectedSupportedWallet, primarySwapRecommendation, swapPairLabel, swapRecommendations]);

  useEffect(() => {
    if (!hasConnectedSupportedWallet || !aiDecisionMakerEnabled || !primarySwapRecommendation || hasActivePlan) {
      autoLaunchTradeFlowRef.current = null;
      sessionStorage.removeItem("lastAutoLaunchKey");
      return;
    }
    const effectiveAmount = launchAmount || (primarySwapRecommendation ? String(primarySwapRecommendation.amount) : "");
    const effectiveParsed = Number.parseFloat(effectiveAmount || "0");
    if (!effectiveAmount || !Number.isFinite(effectiveParsed) || effectiveParsed <= 0) {
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
      .map((action) => `${action.token_in_symbol ?? action.asset_symbol}:${action.token_out_symbol ?? action.asset_symbol}:${action.action}:${action.amount}`)
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
  }, [aiDecisionMakerEnabled, hasActivePlan, hasConnectedSupportedWallet, launchAmount, launchAssetBalance, launchTradeFlow, primarySwapRecommendation, parsedDepositAmount, swapPairLabel, swapRecommendations]);

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
  }, [clearScope, depositAsset, hasConnectedSupportedWallet, parsedDepositAmount, riskProfile, setScope]);

  const updateAiAccess = (enabled: boolean) => {
    updateSettings.mutate({ ai_decision_maker_enabled: enabled });
  };

  return (
    <div data-testid="overview-page" className="flex min-h-screen flex-1 flex-col">
      <PageScaffold
        eyebrow="AIYield"
        title="Dashboard"
        description="AI-powered yield optimization with real-time risk management for RWA portfolios."
      >
        {/* AI + Swap Panel */}
        {effectiveWalletAddress && (
          <AISwapPanel
            allocation={allocation}
            risk={risk}
            decisions={decisions}
            isLoading={!allocation && !risk && !decisions && (allocationQuery.isLoading || dashboardSummaryQuery.isLoading || decisionsQuery.isLoading)}
            hasConnectedWallet={hasConnectedSupportedWallet}
            aiDecisionMakerEnabled={aiDecisionMakerEnabled}
            onAiAccessChange={updateAiAccess}
            isAiAccessPending={updateSettings.isPending}
            swapRecommendations={swapRecommendations}
            depositAmountReady={depositAmountReady}
            onReviewSwap={() => launchTradeFlow(true)}
            onOpenTradePage={() => launchTradeFlow(false)}
          />
        )}

        {/* Wallet + Vault Balance Section */}
        {effectiveWalletAddress ? (
          <>
            <VaultBalance
              vaultData={resolvedVaultData}
              walletData={resolvedWalletData}
              isLoading={!portfolio && !resolvedWalletData && (vaultBalanceQuery.isLoading || walletBalanceQuery.isLoading || dashboardSummaryQuery.isLoading)}
              onDeposit={() => setDepositModalOpen(true)}
              onWithdraw={() => setWithdrawModalOpen(true)}
            />

            {/* Portfolio Vault Summary */}
            <PortfolioSummary portfolio={portfolio ?? undefined} isLoading={dashboardSummaryQuery.isLoading} detail={portfolioDetail} risk={risk ?? undefined} riskProfile={riskProfile} />

            {/* Vault Positions table */}
            <section className="terminal-panel border-primary/20 p-4">
              <p className="terminal-label text-primary">Portfolio Vault Positions</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-medium">Asset</th>
                      <th className="py-2 pr-3 font-medium">Balance</th>
                      <th className="py-2 pr-3 font-medium">Value</th>
                      <th className="py-2 pr-3 font-medium">Weight</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(portfolio?.positions ?? []).map((position) => (
                      <tr key={`${position.asset_key}-${position.chain_id}`} className="border-b border-border/60">
                        <td className="py-2 pr-3 text-foreground">{position.asset_symbol}</td>
                        <td className="py-2 pr-3 font-mono text-muted-foreground">{position.balance ?? "-"}</td>
                        <td className="py-2 pr-3 font-mono text-muted-foreground">{position.value_usd ?? "-"}</td>
                        <td className="py-2 pr-3 font-mono text-muted-foreground">{position.weight ?? "-"}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{position.status_code === "DATA_FRESH" ? "Active" : position.status_code}</td>
                      </tr>
                    ))}
                    {!portfolio?.positions?.length && (
                      <tr>
                        <td className="py-4 text-muted-foreground" colSpan={5}>
                          No positions yet. Deposit funds into the Portfolio Vault to begin.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section className="terminal-panel border-primary/20 p-6">
            <div className="flex flex-col items-center gap-4 py-6">
              <p className="terminal-label text-primary text-center">Connect or paste a wallet to unlock the AIxRWA Portfolio Vault</p>
              <Button onClick={login} variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
                Connect wallet
              </Button>
            </div>
          </section>
        )}

        {/* Capital + Allocation row */}
        <section className="grid gap-3 xl:grid-cols-[2fr_1fr]">
          <CapitalChart snapshots={snapshots?.snapshots} isLoading={snapshotsQuery.isLoading} />
          <PortfolioAllocationChart portfolio={portfolio ?? undefined} isLoading={dashboardSummaryQuery.isLoading} />
        </section>

        {/* Top Metrics Row */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <MetricPanel
            label="Target Drift"
            value={`${portfolio?.positions?.filter((p) => p.weight_drift !== null).length ?? 0} Assets`}
            detail="Positions with target weights expose drift and valuation status as backend data becomes available."
            tone={portfolio?.positions?.length ? toneFromStatus(portfolio?.status) : "neutral"}
          />
          <MetricPanel
            label="Risk"
            value={risk ? `${risk.risk_band} / ${risk.risk_score}` : "Loading"}
            detail={riskDetail}
            tone={risk?.hard_veto_status === "active" ? "blocked" : toneFromStatus(risk?.status)}
          />
          <MetricPanel
            label="Snapshots"
            value={`${snapshots?.snapshots.length ?? 0} Recent`}
            detail={snapshots?.status_reason ?? (effectiveWalletAddress ? "Reading /portfolio/snapshots." : "Connect or paste a wallet to view historical snapshots.")}
            tone={toneFromStatus(snapshots?.status)}
          />
        </div>
      </PageScaffold>

      <DepositModal
        open={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        walletData={resolvedWalletData}
        suggestedAsset={primarySwapRecommendation?.token_in_symbol ?? undefined}
        suggestedAmount={suggestedLaunchAmount > 0 ? String(suggestedLaunchAmount) : undefined}
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
