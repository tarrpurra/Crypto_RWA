import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useBalance, useChainId } from "wagmi";
import { mantleSepoliaTestnet } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { marketApi } from "@/lib/api/market";
import { useInvestmentScope } from "@/hooks/useInvestmentScope";
import { useCurrentPortfolio } from "@/hooks/usePortfolio";
import { useSwapQuote } from "@/hooks/useSwap";
import { useSettings } from "@/hooks/useSystem";
import { AlertTriangle } from "lucide-react";

const assetOptions = ["USDY", "mETH", "MNT"] as const;
const riskProfiles = ["Defensive", "Balanced", "Yield-Seeking"] as const;

export function SwapForm() {
  const navigate = useNavigate();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { setScope, clearScope } = useInvestmentScope();
  const portfolioQuery = useCurrentPortfolio();
  const settingsQuery = useSettings();
  const routesQuery = useQuery({
    queryKey: ["market", "routes"],
    queryFn: () => marketApi.routes(),
    staleTime: 60_000,
    retry: false,
  });

  const [depositAsset, setDepositAsset] = useState<(typeof assetOptions)[number]>("MNT");
  const [depositAmount, setDepositAmount] = useState("");
  const [riskProfile, setRiskProfile] = useState<(typeof riskProfiles)[number]>("Balanced");

  const pairedTarget = depositAsset === "USDY" ? "mETH" : "USDY";
  const quoteTokenIn = depositAsset === "MNT" ? "WMNT" : depositAsset;
  const quotePairSupported = Boolean(
    routesQuery.data?.routes?.some(
      (route) =>
        route.token_in.toLowerCase() === quoteTokenIn.toLowerCase() &&
        route.token_out.toLowerCase() === pairedTarget.toLowerCase(),
    ),
  );
  const quoteQuery = useSwapQuote(quoteTokenIn, pairedTarget, quotePairSupported);
  const quote = quoteQuery.data;
  const nativeBalanceQuery = useBalance({
    address,
    chainId: mantleSepoliaTestnet.id,
    query: { enabled: Boolean(address && chainId === mantleSepoliaTestnet.id) },
  });
  const nativeMntBalance = nativeBalanceQuery.data ? Number.parseFloat(nativeBalanceQuery.data.formatted) : Number.NaN;
  const settings = settingsQuery.data;
  const mntWrapConfigured = Boolean(settings?.native_mnt_enabled && settings?.sepolia_wmnt_address);

  const availableBalance = useMemo(() => {
    if (depositAsset === "MNT") {
      return Number.isFinite(nativeMntBalance) ? nativeMntBalance : null;
    }
    const position = portfolioQuery.data?.positions?.find((item) => item.asset_symbol === depositAsset);
    const parsed = position?.balance ? Number.parseFloat(position.balance) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, [depositAsset, nativeMntBalance, portfolioQuery.data?.positions]);

  const numericAmount = Number.parseFloat(depositAmount || "0");
  const warnings = useMemo(() => {
    const nextWarnings: string[] = [];
    if (!isConnected) {
      nextWarnings.push("Connect a wallet before starting an investment plan.");
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      nextWarnings.push("Enter a valid deposit amount.");
    }
    if (availableBalance !== null && Number.isFinite(numericAmount) && numericAmount > availableBalance) {
      nextWarnings.push(`Requested amount exceeds the available ${depositAsset} balance.`);
    }
    if (depositAsset === "MNT" && !mntWrapConfigured) {
      nextWarnings.push("Native MNT wrapping is not configured in the backend yet.");
    }
    return nextWarnings;
  }, [availableBalance, depositAsset, isConnected, mntWrapConfigured, numericAmount]);

  useEffect(() => {
    if (chainId !== mantleSepoliaTestnet.id || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      clearScope();
      return;
    }
    setScope({
      depositAssetSymbol: depositAsset,
      depositAmount: numericAmount,
      riskProfile,
      allocationMode: "AI Suggested",
      chainId: mantleSepoliaTestnet.id,
    });
  }, [chainId, clearScope, depositAsset, numericAmount, riskProfile, setScope]);

  const routeState =
    !quotePairSupported
      ? `No discovered quote route is available yet for ${quoteTokenIn}->${pairedTarget}.`
      : quote && quote.amount_out
      ? `Sample route visible: ${quote.protocol} ${depositAsset === "MNT" ? "WMNT" : depositAsset}->${pairedTarget}.`
      : "No executable sample quote is available yet. Plan creation still happens on the Decision Log page.";

  const openTradeFlow = () => {
    const params = new URLSearchParams({
      asset: depositAsset,
      amount: depositAmount,
      risk: riskProfile,
    });
    navigate(`/decision-log?${params.toString()}`);
  };

  return (
    <div className="w-full">
        <div className="flex items-center justify-between">
          <p className="terminal-label text-xs text-muted-foreground">Investment launcher</p>
          <span className="text-xs text-muted-foreground">Deposit first</span>
        </div>

        <div className="mt-3 space-y-3">
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
            <span className="text-xs text-muted-foreground">Amount to deploy</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={depositAmount}
              onChange={(event) => setDepositAmount(event.target.value)}
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

        <div className="mt-3 border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
          <p>{routeState}</p>
          <p className="mt-2">
            {availableBalance !== null
              ? `Wallet balance: ${availableBalance.toFixed(4)} ${depositAsset}`
              : `Wallet balance for ${depositAsset} is not available yet.`}
          </p>
          {settings?.sepolia_meth_is_test_token && (
            <p className="mt-2">The mETH sleeve uses a Sepolia demo asset with manual or mirrored pricing, while swaps and balances remain live on AGNI Sepolia.</p>
          )}
          {depositAsset === "MNT" && (
            <p className="mt-2">Trade flow wraps MNT into WMNT before creating swap proposals.</p>
          )}
        </div>

        {warnings.length > 0 && (
          <div className="mt-3 space-y-2 rounded border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            {warnings.map((warning) => (
              <div key={warning} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>{warning}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={openTradeFlow} disabled={warnings.length > 0}>
            Open trade flow
          </Button>
        </div>
    </div>
  );
}
