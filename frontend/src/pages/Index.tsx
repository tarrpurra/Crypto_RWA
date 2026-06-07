import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BellRing } from "lucide-react";
import { toast } from "sonner";
import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { useAuth } from "@/components/auth/AuthProvider";
import { AISidePanel } from "@/components/dashboard/AISidePanel";
import { PortfolioAllocationChart } from "@/components/dashboard/PortfolioAllocationChart";
import { RiskBucketChart } from "@/components/dashboard/RiskBucketChart";
import { WalletScopeControl } from "@/components/rwa/WalletScopeControl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAllocationRecommendation } from "@/hooks/useAllocation";
import { useInvestmentScope } from "@/hooks/useInvestmentScope";
import { useMarketIngestionStatus } from "@/hooks/useMarket";
import { useCurrentPortfolio, usePortfolioSnapshots } from "@/hooks/usePortfolio";
import { useCurrentRisk } from "@/hooks/useRisk";
import { useSettings, useSystemHealth, useUpdateSettings } from "@/hooks/useSystem";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

const assetOptions = ["USDY", "mETH", "MNT"] as const;
const riskProfiles = ["Defensive", "Balanced", "Yield-Seeking"] as const;

const Index = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { scope, setScope, clearScope } = useInvestmentScope();
  const [depositAsset, setDepositAsset] = useState<(typeof assetOptions)[number]>("MNT");
  const [depositAmount, setDepositAmount] = useState("");
  const [riskProfile, setRiskProfile] = useState<(typeof riskProfiles)[number]>("Balanced");
  const healthQuery = useSystemHealth();
  const settingsQuery = useSettings();
  const updateSettings = useUpdateSettings();
  const portfolioQuery = useCurrentPortfolio();
  const riskQuery = useCurrentRisk();
  const allocationQuery = useAllocationRecommendation();
  const marketQuery = useMarketIngestionStatus();
  const snapshotsQuery = usePortfolioSnapshots(10);
  const { effectiveWalletAddress, connectedWalletAddress, isSupportedChain } = usePortfolioWallet();

  const health = healthQuery.data;
  const settings = settingsQuery.data;
  const portfolio = portfolioQuery.data;
  const risk = riskQuery.data;
  const allocation = allocationQuery.data;
  const market = marketQuery.data;
  const snapshots = snapshotsQuery.data;
  const hasConnectedSupportedWallet = Boolean(connectedWalletAddress && isSupportedChain);
  const aiDecisionMakerEnabled = settings?.ai_decision_maker_enabled ?? false;
  const swapRecommendation =
    allocation?.decision.recommended_action === "REBALANCE"
      ? allocation.rebalance_actions.find((action) => action.action !== "HOLD" && action.amount > 0) ?? null
      : null;
  const swapPairLabel = swapRecommendation
    ? swapRecommendation.swap_pair_label
      ?? (swapRecommendation.token_in_symbol && swapRecommendation.token_out_symbol
        ? `${swapRecommendation.token_in_symbol} -> ${swapRecommendation.token_out_symbol}`
        : swapRecommendation.asset_symbol)
    : null;
  const lastRecommendationToastRef = useRef<string | null>(null);
  const autoLaunchTradeFlowRef = useRef<string | null>(
    sessionStorage.getItem("lastAutoLaunchKey"),
  );
  const amountTouchedRef = useRef(false);
  const selectedPortfolioBalance = useMemo(() => {
    const candidates = portfolio?.positions ?? [];
    const position = candidates.find((item) => item.asset_symbol === depositAsset)
      ?? (depositAsset === "MNT" ? candidates.find((item) => item.asset_symbol === "WMNT") : undefined)
      ?? (depositAsset === "WMNT" ? candidates.find((item) => item.asset_symbol === "MNT") : undefined);
    return position?.balance?.trim() ?? "";
  }, [depositAsset, portfolio?.positions]);
  const selectedPortfolioBalanceValue = Number.parseFloat(selectedPortfolioBalance || "0");
  const walletBalanceAmount = Number.isFinite(selectedPortfolioBalanceValue) && selectedPortfolioBalanceValue > 0 ? selectedPortfolioBalance : "";
  const resolvedDepositAmount = walletBalanceAmount || depositAmount;
  const walletBalanceReady = !hasConnectedSupportedWallet || Boolean(walletBalanceAmount);
  const portfolioDetail =
    !effectiveWalletAddress
      ? ""
      : portfolio?.status_reason ?? (effectiveWalletAddress ? "Reading /portfolio/current with explicit wallet scope." : "");
  const riskDetail =
    !effectiveWalletAddress
      ? ""
      : risk?.reasoning_summary ?? "";

  const launchTradeFlow = () => {
    const launchAsset = swapRecommendation ? "WMNT" : depositAsset;
    const params = new URLSearchParams({
      asset: launchAsset,
      amount: resolvedDepositAmount,
      risk: riskProfile,
    });
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
    amountTouchedRef.current = false;
  }, [depositAsset]);

  useEffect(() => {
    if (amountTouchedRef.current) {
      return;
    }
    setDepositAmount(walletBalanceAmount);
  }, [walletBalanceAmount]);

  useEffect(() => {
    if (!hasConnectedSupportedWallet || aiDecisionMakerEnabled || !swapRecommendation) {
      lastRecommendationToastRef.current = null;
      return;
    }

    const recommendationKey = `${swapRecommendation.asset_symbol}:${swapRecommendation.action}:${swapRecommendation.amount}:${swapPairLabel ?? ""}`;
    if (lastRecommendationToastRef.current === recommendationKey) {
      return;
    }

    lastRecommendationToastRef.current = recommendationKey;
    toast.info(
      `Is now the right time to swap? ${swapPairLabel ?? swapRecommendation.asset_symbol} ${swapRecommendation.action} ${swapRecommendation.amount.toFixed(4)} is ready for review.`,
    );
  }, [aiDecisionMakerEnabled, hasConnectedSupportedWallet, swapPairLabel, swapRecommendation]);

  useEffect(() => {
    if (!hasConnectedSupportedWallet || !aiDecisionMakerEnabled || !swapRecommendation) {
      autoLaunchTradeFlowRef.current = null;
      sessionStorage.removeItem("lastAutoLaunchKey");
      return;
    }
    if (!walletBalanceAmount) {
      return;
    }

    const autoLaunchKey = `${swapRecommendation.asset_symbol}:${swapRecommendation.action}:${swapRecommendation.amount}:${swapPairLabel ?? ""}`;
    if (autoLaunchTradeFlowRef.current === autoLaunchKey) {
      return;
    }

    autoLaunchTradeFlowRef.current = autoLaunchKey;
    sessionStorage.setItem("lastAutoLaunchKey", autoLaunchKey);
    toast.info(
      `Full access AI is opening the trade flow and will execute ${swapPairLabel ?? swapRecommendation.asset_symbol} ${swapRecommendation.action === "BUY" ? "buy" : swapRecommendation.action} automatically.`,
    );
    launchTradeFlow();
  }, [aiDecisionMakerEnabled, hasConnectedSupportedWallet, launchTradeFlow, swapPairLabel, swapRecommendation, walletBalanceAmount]);

  useEffect(() => {
    if (hasConnectedSupportedWallet && !walletBalanceAmount) {
      clearScope();
      return;
    }
    const parsedAmount = Number.parseFloat(resolvedDepositAmount || "0");
    if (!hasConnectedSupportedWallet || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      if (!hasConnectedSupportedWallet) {
        clearScope();
      }
      return;
    }
    setScope({
      depositAssetSymbol: depositAsset,
      depositAmount: parsedAmount,
      riskProfile,
      allocationMode: "AI Suggested",
      chainId: 5003,
    });
  }, [clearScope, depositAsset, hasConnectedSupportedWallet, resolvedDepositAmount, riskProfile, setScope, walletBalanceAmount]);

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
        <WalletScopeControl />
        {hasConnectedSupportedWallet && (
          <section className="terminal-panel p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="terminal-label text-primary">Investment Scope</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  The scope now defaults to the connected wallet balance. Allocation and risk calls use that wallet balance instead of asking for extra funds.
                </p>
              </div>
              <Button onClick={launchTradeFlow} disabled={!walletBalanceReady}>
                Open trade flow
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="grid gap-2">
                <span className="text-xs text-muted-foreground">Deposit asset</span>
                <Select value={depositAsset} onValueChange={(value) => setDepositAsset(value as typeof depositAsset)}>
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
                  value={depositAmount}
                  onChange={(event) => {
                    amountTouchedRef.current = true;
                    setDepositAmount(event.target.value);
                  }}
                  className="bg-surface-2"
                />
              </label>
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
            </div>
          </section>
        )}
        {hasConnectedSupportedWallet && (
          <section className="terminal-panel p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="terminal-label text-primary">AI access</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Recommendation only keeps swap review manual. Full access AI can approve linked proposals and execute the trade flow automatically.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Recommendation only</span>
                <Switch checked={aiDecisionMakerEnabled} disabled={updateSettings.isPending} onCheckedChange={updateAiAccess} />
                <span className="text-xs text-muted-foreground">Full access AI</span>
              </div>
            </div>
          </section>
        )}
        {hasConnectedSupportedWallet && swapRecommendation && (
          <section className="terminal-panel border border-primary/35 bg-primary/5 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded border border-primary/25 bg-primary/10 p-2 text-primary">
                  <BellRing className="h-4 w-4" />
                </div>
                <div>
                  <p className="terminal-label text-primary">Swap recommendation ready</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {aiDecisionMakerEnabled
                      ? "Full access AI is active. The trade flow will auto-approve and execute linked proposals after the plan is created."
                      : "Recommendation only is active. Review the prefilled swap details before you approve or execute anything."}
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <div className="rounded border border-border bg-surface-2 px-3 py-2">
                      <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Swap asset</p>
                      <p className="mt-1 font-mono text-sm text-foreground">
                        {swapPairLabel ?? swapRecommendation.asset_symbol} {swapRecommendation.action === "BUY" ? "buy" : swapRecommendation.action}
                      </p>
                    </div>
                    <div className="rounded border border-border bg-surface-2 px-3 py-2">
                      <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Suggested amount</p>
                      <p className="mt-1 font-mono text-sm text-foreground">{swapRecommendation.amount.toFixed(4)}</p>
                    </div>
                    <div className="rounded border border-border bg-surface-2 px-3 py-2">
                      <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Confidence</p>
                      <p className="mt-1 font-mono text-sm text-foreground">
                        {allocation ? `${(allocation.decision.confidence * 100).toFixed(1)}%` : "-"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    The trade page opens with the deposit asset, wallet balance, and risk profile already filled.
                  </p>
                </div>
              </div>
              {!aiDecisionMakerEnabled ? (
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button onClick={launchTradeFlow} disabled={!walletBalanceReady}>
                    Review swap
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/trade")} disabled={!walletBalanceReady}>
                    Open trade page
                  </Button>
                </div>
              ) : (
                <div className="rounded border border-success/40 bg-success/10 px-3 py-2 text-sm text-success md:max-w-sm md:justify-end">
                  Full access AI is opening the trade flow and executing the scoped swap automatically. No manual review is required in this mode.
                </div>
              )}
            </div>
          </section>
        )}
        {!effectiveWalletAddress && (
          <section className="terminal-panel p-4">
            <div className="mt-3">
              <Button onClick={login} variant="outline">
                Connect wallet
              </Button>
            </div>
          </section>
        )}
        {/* Top Metrics Row */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricPanel
            label="Agent Mode"
            value={health?.runtime_mode ?? "Loading"}
            detail={health?.status_reason ?? "Reading /health from the RWA agent service."}
            tone={toneFromStatus(health?.status)}
          />
          <MetricPanel
            label="Portfolio"
            value={portfolio?.total_value_usd ? `$${portfolio.total_value_usd}` : portfolio?.status_label ?? "Loading"}
            detail={portfolioDetail}
            tone={toneFromStatus(portfolio?.status)}
          />
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
            label="Market Data"
            value={market?.status_label ?? "Loading"}
            detail={market?.status_reason ?? "Reading /market/ingestion/status."}
            tone={toneFromStatus(market?.status)}
          />
          <MetricPanel
            label="Snapshots"
            value={`${snapshots?.snapshots.length ?? 0} Recent`}
            detail={snapshots?.status_reason ?? (effectiveWalletAddress ? "Reading /portfolio/snapshots." : "Connect or paste a wallet to view historical snapshots.")}
            tone={toneFromStatus(snapshots?.status)}
          />
        </div>

        {/* Charts row */}
        <section className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
          <PortfolioAllocationChart portfolio={portfolio} isLoading={portfolioQuery.isLoading} />
          <RiskBucketChart risk={risk} isLoading={riskQuery.isLoading} />
        </section>

        {/* Positions table */}
        <section className="terminal-panel p-4">
          <p className="terminal-label text-primary">Positions</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Asset</th>
                  <th className="py-2 pr-3 font-medium">Balance</th>
                  <th className="py-2 pr-3 font-medium">Price</th>
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
                    <td className="py-2 pr-3 font-mono text-muted-foreground">{position.price_usd ?? "-"}</td>
                    <td className="py-2 pr-3 font-mono text-muted-foreground">{position.value_usd ?? "-"}</td>
                    <td className="py-2 pr-3 font-mono text-muted-foreground">{position.weight ?? "-"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{position.status_code === "DATA_FRESH" ? "Active" : position.status_code}</td>
                  </tr>
                ))}
                {!portfolio?.positions?.length && (
                  <tr>
                    <td className="py-4 text-muted-foreground" colSpan={6}>
                      No positions available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </PageScaffold>
      <AISidePanel />
    </div>
  );
};

export default Index;
