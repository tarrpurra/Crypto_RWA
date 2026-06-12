import { useState } from "react";
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

const DEPOSIT_ASSETS = ["MNT", "USDC", "USDY", "mETH"] as const;

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  walletData: VaultBalanceResponse | undefined;
  suggestedAsset?: string;
  suggestedAmount?: string;
}

type DepositStep = "idle" | "approving" | "approve_done" | "depositing" | "done" | "error";

export function DepositModal({ open, onClose, walletData, suggestedAsset, suggestedAmount }: DepositModalProps) {
  const [asset, setAsset] = useState<string>(suggestedAsset ?? "MNT");
  const [amount, setAmount] = useState(suggestedAmount ?? "");
  const [step, setStep] = useState<DepositStep>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  if (!open) return null;

  const walletBalance = walletData?.balances?.find((b) => b.asset_symbol === asset);
  const walletBalanceNum = Number.parseFloat(walletBalance?.balance ?? "0");
  const numericAmount = Number.parseFloat(amount || "0");
  const exceedsWallet = walletBalanceNum > 0 && numericAmount > walletBalanceNum;
  const isValid = amount.trim() && Number.isFinite(numericAmount) && numericAmount > 0 && !exceedsWallet;
  const needsApproval = asset !== "MNT" && step === "idle";

  const handleApprove = async () => {
    setStep("approving");
    try {
      await new Promise((r) => setTimeout(r, 1500));
      setStep("approve_done");
    } catch {
      setStep("error");
      setErrorMsg("Approval failed. Check wallet and try again.");
    }
  };

  const handleDeposit = async () => {
    setStep("depositing");
    try {
      await new Promise((r) => setTimeout(r, 2000));
      setStep("done");
    } catch {
      setStep("error");
      setErrorMsg("Deposit failed. Check wallet and try again.");
    }
  };

  const handleClose = () => {
    setStep("idle");
    setAmount("");
    setErrorMsg("");
    onClose();
  };

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
            <p className="text-sm font-medium text-foreground">Deposit submitted</p>
            <p className="text-center text-xs text-muted-foreground">
              {numericAmount} {asset} deposited into AIxRWA Portfolio Vault.
            </p>
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
                  {DEPOSIT_ASSETS.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Amount</p>
                {walletBalance && (
                  <p className="text-[0.6rem] text-muted-foreground">
                    Wallet: {walletBalance.balance} {asset}
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
                  Amount exceeds wallet balance ({walletBalance?.balance} {asset}).
                </p>
              )}
            </div>

            <p className="text-[0.6rem] text-muted-foreground -mt-2">
              {suggestedAmount && amount === suggestedAmount
                ? `Suggested: ${suggestedAmount} ${asset} (AI recommendation)`
                : "Only funds in the Portfolio Vault are managed by AI allocation."
              }
            </p>

            {needsApproval ? (
              <Button
                onClick={handleApprove}
                disabled={!isValid || step === "approving"}
                className="w-full"
              >
                {step === "approving" ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving...</>
                ) : (
                  `Approve ${asset}`
                )}
              </Button>
            ) : (
              <Button
                onClick={handleDeposit}
                disabled={!isValid || step === "depositing"}
                className="w-full"
              >
                {step === "depositing" ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Depositing...</>
                ) : step === "approve_done" ? (
                  "Deposit into Portfolio Vault"
                ) : asset === "MNT" ? (
                  "Deposit MNT"
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
