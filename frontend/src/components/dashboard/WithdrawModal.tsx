import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VaultBalanceResponse } from "@/lib/api/types";
import { normalizeAddress } from "@/lib/addresses";
import { vaultApi } from "@/lib/api/vault";
import { logger } from "@/lib/logger";
import { useChainId } from "wagmi";

const EXECUTOR_VAULT_ABI = [
  {
    type: "function",
    name: "withdrawToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawNative",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
const WMNT_ABI = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function assetDecimals(_symbol: string) {
  return 18;
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

interface WithdrawModalProps {
  open: boolean;
  onClose: () => void;
  vaultData: VaultBalanceResponse | undefined;
  vaultAddress?: string;
  wmntAddress?: string;
  nativeMntEnabled?: boolean;
}

type WithdrawStep = "idle" | "withdrawing" | "done" | "error";

export function WithdrawModal(props: WithdrawModalProps) {
  if (!props.open) return null;
  return <WithdrawModalContent {...props} />;
}

function WithdrawModalContent({ onClose, vaultData, vaultAddress, wmntAddress, nativeMntEnabled }: Omit<WithdrawModalProps, "open">) {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const chainId = useChainId();
  const [asset, setAsset] = useState<string>("MNT");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<WithdrawStep>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState("");
  const [recordNote, setRecordNote] = useState("");
  const inFlightRef = useRef(false);
  const normalizedVaultAddress = normalizeAddress(vaultAddress);
  const normalizedWmntAddress = normalizeAddress(wmntAddress);
  const normalizedWalletAddress = normalizeAddress(vaultData?.user_address);
  const canWithdrawMnt = Boolean(normalizedWmntAddress && nativeMntEnabled);
  const availableAssets = useMemo(
    () => {
      const symbols = (vaultData?.balances ?? [])
        .map((balance) => balance.asset_symbol)
        .filter(Boolean);
      if (canWithdrawMnt) {
        symbols.push("MNT");
      }
      return Array.from(new Set(symbols));
    },
    [vaultData?.balances, canWithdrawMnt],
  );
  const selectableAssets =
    availableAssets.length > 0 ? availableAssets : canWithdrawMnt ? ["MNT", "USDY", "mETH"] : ["USDY", "mETH"];

  const vaultBalance =
    asset === "MNT"
      ? vaultData?.balances?.find((b) => b.asset_symbol === "WMNT")
        ?? vaultData?.balances?.find((b) => b.asset_symbol === "MNT")
      : vaultData?.balances?.find((b) => b.asset_symbol === asset);
  const vaultBalanceSymbol = vaultBalance?.asset_symbol ?? (asset === "MNT" ? "WMNT" : asset);
  const wrappedMntWithdrawal = asset === "MNT" && vaultBalanceSymbol === "WMNT";
  const walletAddress = vaultData?.user_address ?? "";
  const tokenAddress = asset === "MNT" ? (normalizedWmntAddress ?? null) : normalizeAddress(vaultBalance?.asset_address ?? null);
  const vaultBalanceNum = Number.parseFloat(vaultBalance?.balance ?? "0");
  const numericAmount = Number.parseFloat(amount || "0");
  const exceedsVault = vaultBalanceNum > 0 && numericAmount > vaultBalanceNum;
  const amountRaw = useMemo(() => {
    if (!amount.trim()) {
      return null;
    }
    try {
      return parseUnits(amount, assetDecimals(asset));
    } catch {
      return null;
    }
  }, [amount, asset]);
  const isValid =
    amount.trim() &&
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    vaultBalanceNum > 0 &&
    !exceedsVault &&
    Boolean(normalizedWalletAddress) &&
    Boolean(normalizedVaultAddress) &&
    (asset === "MNT" || Boolean(tokenAddress)) &&
    amountRaw !== null;

  useEffect(() => {
    if (!selectableAssets.includes(asset)) {
      setAsset(selectableAssets[0]);
    }
  }, [asset, selectableAssets]);

  const handleWithdraw = async () => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setStep("withdrawing");
    setErrorMsg("");
    setRecordNote("");
    let unwrappedToNative = false;
    try {
      if (!normalizedWalletAddress) {
        throw new Error("Connected wallet address is missing.");
      }
      if (!normalizedVaultAddress) {
        throw new Error("Vault address is not available.");
      }
      if (amountRaw === null) {
        throw new Error("Withdrawal amount is invalid for the selected asset.");
      }

      const prepare = await vaultApi.withdrawPrepare(asset, amount, normalizedWalletAddress);
      logger.info("vault.withdraw.prepare", {
        wallet_address: normalizedWalletAddress,
        vault_address: normalizedVaultAddress,
        asset,
        amount,
        sufficient_balance: prepare.sufficient_balance,
        vault_balance: prepare.vault_balance,
      });

      if (!prepare.sufficient_balance) {
        throw new Error(`Vault balance is too low to withdraw ${amount} ${asset}.`);
      }

      let hash: `0x${string}`;
      if (asset === "MNT") {
        if (!normalizedWmntAddress) {
          throw new Error("WMNT address is not available for wrapped MNT withdrawal.");
        }
        hash = await writeContractAsync({
          address: normalizedVaultAddress,
          abi: EXECUTOR_VAULT_ABI,
          functionName: "withdrawToken",
          chainId,
          args: [normalizedWmntAddress, normalizedWalletAddress, amountRaw],
        });
        await publicClient?.waitForTransactionReceipt({ hash });

        try {
          const unwrapHash = await writeContractAsync({
            address: normalizedWmntAddress,
            abi: WMNT_ABI,
            functionName: "withdraw",
            chainId,
            args: [amountRaw],
          });
          await publicClient?.waitForTransactionReceipt({ hash: unwrapHash });
          setRecordNote("Wrapped WMNT was withdrawn and unwrapped to native MNT.");
          unwrappedToNative = true;
        } catch (unwrapError) {
          logger.warn("vault.withdraw.unwrap.failed", {
            wallet_address: normalizedWalletAddress,
            vault_address: normalizedVaultAddress,
            amount,
            error: unwrapError,
          });
          setRecordNote("WMNT was withdrawn from the vault, but native unwrap failed. It remains in your wallet.");
        }
      } else {
        if (!tokenAddress) {
          throw new Error(`${asset} token address is not available for withdrawal.`);
        }
        hash = await writeContractAsync({
          address: normalizedVaultAddress,
          abi: EXECUTOR_VAULT_ABI,
          functionName: "withdrawToken",
          chainId,
          args: [tokenAddress, normalizedWalletAddress, amountRaw],
        });
      }

      const receipt = await publicClient?.waitForTransactionReceipt({ hash });
      if (receipt?.status === "reverted") {
        throw new Error("Transaction execution reverted on-chain.");
      }
      logger.info("vault.withdraw.confirmed", {
        wallet_address: normalizedWalletAddress,
        vault_address: normalizedVaultAddress,
        asset,
        amount,
        tx_hash: hash,
        block_number: receipt?.blockNumber?.toString() ?? null,
      });
      setTxHash(hash);

      try {
        await vaultApi.recordFlow({
          user_address: normalizedWalletAddress,
          asset_symbol: asset === "MNT" ? (wrappedMntWithdrawal ? "WMNT" : "MNT") : asset,
          asset_amount: amount,
          asset_address: asset === "MNT" ? (wrappedMntWithdrawal ? normalizedWmntAddress : ZERO_ADDRESS) : tokenAddress,
          tx_hash: hash,
          flow_type: "withdrawal",
          metadata: {
            source: "frontend.withdraw_modal",
            vault_address: normalizedVaultAddress,
            destination_wallet: normalizedWalletAddress,
            unwrapped_to_native: unwrappedToNative,
          },
        });
        logger.info("vault.withdraw.recorded", {
          wallet_address: normalizedWalletAddress,
          asset,
          amount,
          tx_hash: hash,
        });
      } catch (recordError) {
        logger.error("vault.withdraw.record.failed", {
          wallet_address: normalizedWalletAddress,
          asset,
          amount,
          tx_hash: hash,
          error: recordError,
        });
        setRecordNote("Transaction confirmed, but backend vault history recording failed.");
      }

      queryClient.invalidateQueries({ queryKey: ["vault"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["allocation"] });
      setStep("done");
    } catch (error) {
      logger.error("vault.withdraw.failed", {
        wallet_address: normalizedWalletAddress || null,
        vault_address: normalizedVaultAddress || null,
        asset,
        amount,
        error,
      });
      setStep("error");
      setErrorMsg(error instanceof Error ? error.message : "Withdrawal failed. Check wallet and try again.");
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
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-primary/20 bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="terminal-label text-primary">Withdraw from AIxRWA Portfolio Vault</p>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "done" ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <p className="text-sm font-medium text-foreground">Withdrawal confirmed</p>
            <p className="text-center text-xs text-muted-foreground">
              {numericAmount} {asset} withdrawn from AIxRWA Portfolio Vault.
            </p>
            <div className="w-full rounded border border-border/70 bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
              <p>Wallet: <span className="font-mono text-foreground">{shortenAddress(walletAddress)}</span></p>
              <p className="mt-1">Tx hash: <span className="font-mono text-foreground">{shortenAddress(txHash)}</span></p>
            </div>
            {recordNote ? (
              <p className="text-center text-[11px] text-warning">{recordNote}</p>
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
            <p className="text-sm font-medium text-destructive">Withdrawal failed</p>
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
                  {selectableAssets.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Amount</p>
                {vaultBalance && (
                  <p className="text-[0.6rem] text-muted-foreground">
                    Vault: {vaultBalance.balance} {vaultBalanceSymbol}
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
                {vaultBalanceNum > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1.5 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => setAmount(String(vaultBalanceNum))}
                  >
                    Max
                  </Button>
                )}
              </div>
              {exceedsVault && (
                <p className="mt-1 text-[0.6rem] text-destructive">
                  Amount exceeds vault balance ({vaultBalance?.balance} {vaultBalanceSymbol}).
                </p>
              )}
            </div>

            {!vaultAddress && (
              <p className="text-[0.6rem] text-destructive">
                Vault address is unavailable, so withdrawals cannot be submitted from this modal yet.
              </p>
            )}

            <Button
              onClick={handleWithdraw}
              disabled={!isValid || step === "withdrawing"}
              className="w-full"
              variant={isValid ? "default" : "outline"}
            >
              {step === "withdrawing" ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Withdrawing...</>
              ) : (
                `Withdraw ${isValid && numericAmount >= vaultBalanceNum ? "All" : asset}`
              )}
            </Button>

            <p className="text-center text-[0.6rem] text-muted-foreground">
              Withdraws confirmed vault balances back to your connected wallet and records the flow.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
