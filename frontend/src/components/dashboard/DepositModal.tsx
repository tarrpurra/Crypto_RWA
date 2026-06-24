import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSystemReadiness } from "@/hooks/useSystem";
import type { VaultBalanceResponse } from "@/lib/api/types";
import { normalizeAddress } from "@/lib/addresses";
import { vaultApi } from "@/lib/api/vault";
import { logger } from "@/lib/logger";
import { useWrapMnt } from "@/hooks/useSwap";
import { useChainId } from "wagmi";

const DEPOSIT_ASSETS = ["WMNT", "MNT", "USDY", "mETH"] as const;
const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
const EXECUTOR_VAULT_ABI = [
  {
    type: "function",
    name: "depositToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

function assetDecimals(symbol: string, decimalsBySymbol: Map<string, number>) {
  return decimalsBySymbol.get(symbol.toUpperCase()) ?? 18;
}

function shortenAddress(value: string | null | undefined) {
  if (!value) {
    return "--";
  }
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function getDepositAssets(nativeMntEnabled: boolean, wmntAddress?: string | null) {
  const canWrapNativeMnt = nativeMntEnabled && Boolean(wmntAddress);
  return DEPOSIT_ASSETS.filter((value) => value !== "MNT" || canWrapNativeMnt);
}

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  walletData: VaultBalanceResponse | undefined;
  vaultAddress?: string;
  wmntAddress?: string;
  walletContextReady?: boolean;
  // Bug E fix: caller passes native MNT balance so the modal can display it
  // and enable the Max button for MNT deposits (native balance is not in
  // walletData.balances which only contains ERC-20 positions).
  nativeMntBalance?: number | null;
  nativeMntEnabled: boolean;
  suggestedAsset?: string;
  suggestedAmount?: string;
}

type DepositStep = "idle" | "approving" | "approve_done" | "depositing" | "done" | "error";

export function DepositModal(props: DepositModalProps) {
  return <DepositModalContent {...props} />;
}


function DepositModalContent({
  open,
  onClose,
  walletData,
  vaultAddress,
  wmntAddress,
  walletContextReady = true,
  nativeMntBalance,
  nativeMntEnabled,
  suggestedAsset,
  suggestedAmount,
}: DepositModalProps) {
  const queryClient = useQueryClient();
  const { address: connectedAddress } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const chainId = useChainId();
  const readinessQuery = useSystemReadiness();
  const wrapMnt = useWrapMnt();
  const readinessWmntAddress = normalizeAddress(readinessQuery.data?.tokens?.WMNT?.address);
  const effectiveWmntAddress = normalizeAddress(wmntAddress) ?? readinessWmntAddress ?? undefined;
  const depositAssets = useMemo(
    () => getDepositAssets(nativeMntEnabled, effectiveWmntAddress),
    [nativeMntEnabled, effectiveWmntAddress],
  );
  const [asset, setAsset] = useState<string>(() => {
    const initialAsset = suggestedAsset ?? (depositAssets.includes("MNT") ? "MNT" : depositAssets.includes("WMNT") ? "WMNT" : depositAssets[0] ?? "USDY");
    return depositAssets.includes(initialAsset as (typeof DEPOSIT_ASSETS)[number])
      ? initialAsset
      : depositAssets[0] ?? "USDY";
  });
  const [amount, setAmount] = useState(suggestedAmount ?? "");
  const [step, setStep] = useState<DepositStep>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState<string>("");
  const [recordNote, setRecordNote] = useState<string>("");
  const [syncingDashboard, setSyncingDashboard] = useState(false);
  const inFlightRef = useRef(false);
  const normalizedVaultAddress = normalizeAddress(vaultAddress);
  const normalizedWmntAddress = effectiveWmntAddress;
  const walletBalance = walletData?.balances?.find((b) => b.asset_symbol === asset);
  const walletAddress = walletData?.user_address ?? "";
  const normalizedWalletAddress = normalizeAddress(walletAddress);
  const normalizedConnectedAddress = normalizeAddress(connectedAddress);
  // For WMNT: when wallet balance entry has no asset_address (e.g. 0 balance
  // returned without address, or query still loading), fall back to the
  // wmntAddress prop which comes directly from settings and is always reliable.
  const rawTokenAddress =
    walletBalance?.asset_address ??
    (asset === "WMNT" ? effectiveWmntAddress : null) ??
    null;
  const tokenAddress = rawTokenAddress;
  const normalizedTokenAddress = normalizeAddress(tokenAddress);
  const decimalsBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    const tokens = readinessQuery.data?.tokens ?? {};
    for (const [key, token] of Object.entries(tokens)) {
      if (typeof token.decimals === "number") {
        map.set(key.toUpperCase(), token.decimals);
      }
      if (token.symbol && typeof token.decimals === "number") {
        map.set(token.symbol.toUpperCase(), token.decimals);
      }
    }
    map.set("MNT", 18);
    return map;
  }, [readinessQuery.data?.tokens]);
  // Bug E fix: for native MNT, walletData.balances contains ERC-20 positions
  // only. Use the caller-supplied nativeMntBalance instead so the user sees
  // their real MNT balance and the Max button is available.
  const effectiveWalletBalanceNum = asset === "MNT" && nativeMntBalance != null
    ? nativeMntBalance
    : Number.parseFloat(walletBalance?.balance ?? "0");
  const walletBalanceNum = effectiveWalletBalanceNum;
  const walletBalanceDisplay = asset === "MNT" && nativeMntBalance != null
    ? String(nativeMntBalance)
    : (walletBalance?.balance ?? "");
  const numericAmount = Number.parseFloat(amount || "0");
  // Bug fix: simplified to check if amount exceeds wallet balance for all assets
  // without incorrect guard conditions.
  const exceedsWallet = numericAmount > walletBalanceNum;
  const hasVaultAddress = Boolean(normalizedVaultAddress);
  const hasDepositTokenAddress = asset === "MNT" ? Boolean(normalizedWmntAddress) : Boolean(normalizedTokenAddress);
  const showContextPending = !walletContextReady;
  const signerMatchesWallet =
    Boolean(normalizedConnectedAddress) &&
    Boolean(normalizedWalletAddress) &&
    normalizedConnectedAddress === normalizedWalletAddress;
  const isValid =
    walletContextReady &&
    amount.trim() &&
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    !exceedsWallet &&
    Boolean(normalizedWalletAddress) &&
    signerMatchesWallet &&
    hasVaultAddress &&
    hasDepositTokenAddress;
  const needsApproval = asset !== "MNT" && step === "idle";
  const amountRaw = useMemo(() => {
    if (!amount.trim()) {
      return null;
    }
    try {
      return parseUnits(amount, assetDecimals(asset, decimalsBySymbol));
    } catch {
      return null;
    }
  }, [amount, asset, decimalsBySymbol]);
  const canSubmit = Boolean(isValid && amountRaw !== null);

  const refreshDashboardState = async () => {
    if (!normalizedWalletAddress) {
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["vault"] }),
      queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["allocation"] }),
      queryClient.refetchQueries({ queryKey: ["vault", "balance", normalizedWalletAddress], exact: true }),
      queryClient.refetchQueries({ queryKey: ["vault", "wallet", normalizedWalletAddress], exact: true }),
      queryClient.refetchQueries({ queryKey: ["portfolio", "current", normalizedWalletAddress, false], exact: true }),
      queryClient.refetchQueries({ queryKey: ["dashboard", "summary", normalizedWalletAddress], exact: true }),
    ]);
  };

  useEffect(() => {
    if (!depositAssets.includes(asset as (typeof DEPOSIT_ASSETS)[number])) {
      setAsset(depositAssets[0] ?? "USDY");
    }
  }, [asset, depositAssets]);

  const handleApprove = async () => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setStep("approving");
    setErrorMsg("");
    try {
      if (!normalizedWalletAddress) {
        throw new Error("Connected wallet address is missing.");
      }
      if (!signerMatchesWallet) {
        throw new Error("Connected signer does not match the wallet balance being viewed.");
      }
      if (amountRaw === null) {
        throw new Error("Deposit amount is invalid for the selected asset.");
      }
      const prepare = await vaultApi.depositPrepare(asset, amount, normalizedWalletAddress);
      logger.info("vault.deposit.prepare", {
        wallet_address: normalizedWalletAddress,
        asset,
        amount,
        allowance_required: prepare.allowance_required,
        spender: prepare.spender,
      });

      const normalizedSpender = normalizeAddress(prepare.spender);
      if (!prepare.allowance_required) {
        setStep("approve_done");
        return;
      }
      if (!normalizedTokenAddress) {
        throw new Error(`${asset} token address is not available for approval.`);
      }
      if (!normalizedSpender) {
        throw new Error("Vault spender address is not available for approval.");
      }
      const hash = await writeContractAsync({
        address: normalizedTokenAddress,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        chainId,
        args: [normalizedSpender, amountRaw],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      logger.info("vault.deposit.approve.confirmed", {
        wallet_address: normalizedWalletAddress,
        asset,
        amount,
        tx_hash: hash,
      });
      setStep("approve_done");
    } catch (error) {
      logger.error("vault.deposit.approve.failed", {
        wallet_address: normalizedWalletAddress || null,
        asset,
        amount,
        error,
      });
      setStep("error");
      setErrorMsg(error instanceof Error ? error.message : "Approval failed. Check wallet and try again.");
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleDeposit = async () => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setStep("depositing");
    setErrorMsg("");
    setRecordNote("");
    try {
      if (!normalizedWalletAddress) {
        throw new Error("Connected wallet address is missing.");
      }
      if (!signerMatchesWallet) {
        throw new Error("Connected signer does not match the wallet balance being viewed.");
      }
      if (amountRaw === null) {
        throw new Error("Deposit amount is invalid for the selected asset.");
      }
      if (!normalizedVaultAddress) {
        throw new Error("Vault address is not available.");
      }

      logger.info("vault.deposit.submit", {
        wallet_address: normalizedWalletAddress,
        vault_address: normalizedVaultAddress,
        asset,
        amount,
      });

      // For WMNT, fall back to the wmntAddress prop when the wallet balance
      // entry has no asset_address (covers 0-balance or loading state).
      let effectiveTokenAddress: `0x${string}` | null =
          (normalizedTokenAddress ??
          (asset === "WMNT" ? effectiveWmntAddress : undefined)) ??
        null;
      let effectiveSymbol = asset;

      if (asset === "MNT") {
        if (!normalizedWmntAddress) {
          throw new Error("WMNT address is not available, so MNT deposits are not supported.");
        }

        logger.info("vault.deposit.wrap.start", {
          wallet_address: normalizedWalletAddress,
          wmnt_address: normalizedWmntAddress,
          amount,
        });

        const wrapResult = await wrapMnt.mutateAsync({
          wmntAddress: normalizedWmntAddress,
          amount,
        });

        logger.info("vault.deposit.wrap.confirmed", {
          wallet_address: normalizedWalletAddress,
          wmnt_address: normalizedWmntAddress,
          amount,
          tx_hash: wrapResult.hash,
        });

        effectiveTokenAddress = normalizedWmntAddress;
        effectiveSymbol = "WMNT";
      }

      if (!effectiveTokenAddress) {
        throw new Error(`${effectiveSymbol} token address is not available for deposit.`);
      }

      if (asset === "MNT") {
        const prepare = await vaultApi.depositPrepare(effectiveSymbol, amount, normalizedWalletAddress);
        logger.info("vault.deposit.prepare", {
          wallet_address: normalizedWalletAddress,
          asset: effectiveSymbol,
          amount,
          allowance_required: prepare.allowance_required,
          spender: prepare.spender,
        });

        const normalizedSpender = normalizeAddress(prepare.spender);
        if (prepare.allowance_required) {
          if (!normalizedSpender) {
            throw new Error("Vault spender address is not available for approval.");
          }
          const approveHash = await writeContractAsync({
            address: effectiveTokenAddress,
            abi: ERC20_APPROVE_ABI,
            functionName: "approve",
            chainId,
            args: [normalizedSpender, amountRaw],
          });
          await publicClient?.waitForTransactionReceipt({ hash: approveHash });
          logger.info("vault.deposit.approve.confirmed", {
            wallet_address: normalizedWalletAddress,
            asset: effectiveSymbol,
            amount,
            tx_hash: approveHash,
          });
        }
      }

      const hash = await writeContractAsync({
        address: normalizedVaultAddress,
        abi: EXECUTOR_VAULT_ABI,
        functionName: "depositToken",
        chainId,
        args: [effectiveTokenAddress, amountRaw],
      });

      const receipt = await publicClient?.waitForTransactionReceipt({ hash });
      if (receipt?.status === "reverted") {
        throw new Error("Transaction execution reverted on-chain.");
      }
      logger.info("vault.deposit.confirmed", {
        wallet_address: normalizedWalletAddress,
        vault_address: normalizedVaultAddress,
        asset: effectiveSymbol,
        amount,
        tx_hash: hash,
        block_number: receipt?.blockNumber?.toString() ?? null,
      });

      setTxHash(hash);
      setStep("done");
      setSyncingDashboard(true);

      const flowPayload = {
        user_address: normalizedWalletAddress,
        asset_symbol: effectiveSymbol,
        asset_amount: amount,
        asset_address: effectiveTokenAddress,
        tx_hash: hash,
        flow_type: "deposit" as const,
        metadata: {
          source: "frontend.deposit_modal",
          vault_address: normalizedVaultAddress,
          source_asset_symbol: asset,
          wrapped_from_native: asset === "MNT",
          wmnt_address: normalizedWmntAddress ?? null,
        },
      };

      void (async () => {
        try {
          await vaultApi.recordFlow(flowPayload);
          logger.info("vault.deposit.recorded", {
            wallet_address: normalizedWalletAddress,
            asset: effectiveSymbol,
            amount,
            tx_hash: hash,
          });
          await refreshDashboardState();
        } catch (recordError) {
          logger.error("vault.deposit.record.failed", {
            wallet_address: normalizedWalletAddress,
            asset: effectiveSymbol,
            amount,
            tx_hash: hash,
            error: recordError,
          });
          setRecordNote("Transaction confirmed, but backend vault history recording failed.");
        } finally {
          setSyncingDashboard(false);
        }
      })();
    } catch (error) {
      logger.error("vault.deposit.failed", {
        wallet_address: normalizedWalletAddress || null,
        vault_address: normalizedVaultAddress || null,
        asset,
        amount,
        error,
      });
      setStep("error");
      setErrorMsg(error instanceof Error ? error.message : "Deposit failed. Check wallet and try again.");
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleClose = () => {
    setStep("idle");
    setAmount("");
    setErrorMsg("");
    setTxHash("");
    setRecordNote("");
    setSyncingDashboard(false);
    onClose();
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-primary/20 bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="terminal-label text-primary">Deposit into AIxRWA Portfolio Vault</p>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "done" ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <p className="text-sm font-medium text-foreground">Deposit confirmed</p>
            <p className="text-center text-xs text-muted-foreground">
              {numericAmount} {asset}
              {" "}
              deposited into AIxRWA Portfolio Vault.
            </p>
            <div className="w-full rounded border border-border/70 bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
              <p>Wallet: <span className="font-mono text-foreground">{shortenAddress(walletAddress)}</span></p>
              <p className="mt-1">Tx hash: <span className="font-mono text-foreground">{shortenAddress(txHash)}</span></p>
            </div>
            {recordNote ? (
              <p className="text-center text-[11px] text-warning">{recordNote}</p>
            ) : syncingDashboard ? (
              <p className="text-center text-[11px] text-muted-foreground">Transaction confirmed. Syncing dashboard...</p>
            ) : (
              <p className="text-center text-[11px] text-success">Backend vault flow history updated.</p>
            )}
            <Button onClick={handleClose} variant="outline" className="mt-2">
              Close
            </Button>
          </div>
        ) : step === "error" ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-6">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-sm font-medium text-destructive">Deposit failed</p>
            <p className="text-center text-xs text-muted-foreground">{errorMsg}</p>
            <Button onClick={() => setStep("idle")} variant="outline" className="mt-2">
              Try again
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Asset</p>
              <Select value={asset} onValueChange={setAsset}>
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {depositAssets.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Amount</p>
                {/* Bug E fix: show native MNT balance when asset is MNT */}
                {walletBalanceDisplay && (
                  <p className="text-[0.6rem] text-muted-foreground">
                    Wallet: {walletBalanceDisplay} {asset}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1.5 flex-1"
                  min="0"
                  step="0.01"
                />
                {walletBalanceNum > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1.5 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => setAmount(String(walletBalanceNum))}
                  >
                    Max
                  </Button>
                )}
              </div>
            {exceedsWallet && (
                <p className="mt-1 text-[0.6rem] text-destructive">
                  {asset === "WMNT" && walletBalanceNum === 0
                    ? "Insufficient WMNT balance (0). Select \"MNT\" above to wrap and deposit native MNT."
                    : `Amount exceeds wallet balance (${walletBalanceDisplay} ${asset}).`}
                </p>
              )}
            </div>

            <p className="text-[0.6rem] text-muted-foreground -mt-2">
              {suggestedAmount && amount === suggestedAmount
                ? `Suggested: ${suggestedAmount} ${asset} (AI recommendation)`
                : "Only funds in the Portfolio Vault are managed by AI allocation."
              }
            </p>
            {showContextPending ? (
              <p className="text-[0.6rem] text-muted-foreground">
                Loading wallet balances and vault readiness before deposit.
              </p>
            ) : null}
            {!showContextPending && !hasVaultAddress && (
              <p className="text-[0.6rem] text-destructive">
                Vault address is unavailable, so deposits cannot be submitted from this modal yet.
              </p>
            )}
            {!showContextPending && !signerMatchesWallet && (
              <p className="text-[0.6rem] text-destructive">
                {!normalizedConnectedAddress
                  ? "Connect the same wallet shown in the dashboard before depositing."
                  : "Connected signer does not match the wallet loaded in the dashboard. Reconnect the same wallet before depositing."}
              </p>
            )}
            {asset === "MNT" ? (
              <p className="text-[0.6rem] text-muted-foreground">
                Native MNT is wrapped to WMNT before deposit.
              </p>
            ) : null}
            {asset === "WMNT" ? (
              <p className="text-[0.6rem] text-muted-foreground">
                WMNT deposits go directly into the Portfolio Vault.
              </p>
            ) : null}
            {asset === "MNT" && !wmntAddress ? (
              <p className="text-[0.6rem] text-destructive">
                WMNT address is unavailable, so MNT deposits are not supported.
              </p>
            ) : null}

            {needsApproval ? (
              <Button
                onClick={handleApprove}
                disabled={!canSubmit || step === "approving"}
                className="w-full"
              >
                {showContextPending ? (
                  "Loading wallet context..."
                ) : step === "approving" ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving...</>
                ) : (
                  `Approve ${asset}`
                )}
              </Button>
            ) : (
              <Button
                onClick={handleDeposit}
                disabled={!canSubmit || step === "depositing"}
                className="w-full"
              >
                {showContextPending ? (
                  "Loading wallet context..."
                ) : step === "depositing" ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Depositing...</>
                ) : step === "approve_done" ? (
                  "Deposit into Portfolio Vault"
                ) : asset === "MNT" ? (
                  "Deposit"
                ) : (
                  "Deposit"
                )}
              </Button>
            )}

            {step === "approve_done" && (
              <p className="text-center text-[0.6rem] text-success">
                <CheckCircle2 className="mr-1 inline h-3 w-3" />
                {asset} approved. Ready to deposit.
              </p>
            )}

            <p className="text-center text-[0.6rem] text-muted-foreground">
              Only funds in the Portfolio Vault are managed by AI allocation.
              Wallet funds remain under your control.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
