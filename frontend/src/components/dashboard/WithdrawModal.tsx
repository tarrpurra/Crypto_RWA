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
const WITHDRAW_ASSETS = ["MNT","USDY", "mETH"] as const;

interface WithdrawModalProps {
  open: boolean;
  onClose: () => void;
  vaultData: VaultBalanceResponse | undefined;
}

type WithdrawStep = "idle" | "preparing" | "ready" | "withdrawing" | "done" | "error";

export function WithdrawModal({ open, onClose, vaultData }: WithdrawModalProps) {
  const [asset, setAsset] = useState<string>("MNT");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<WithdrawStep>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  if (!open) return null;

  const vaultBalance = vaultData?.balances?.find((b) => b.asset_symbol === asset);
  const vaultBalanceNum = Number.parseFloat(vaultBalance?.balance ?? "0");
  const numericAmount = Number.parseFloat(amount || "0");
  const isValid = amount.trim() && Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount <= vaultBalanceNum;

  const handleWithdraw = async () => {
    setStep("withdrawing");
    try {
      await new Promise((r) => setTimeout(r, 2000));
      setStep("done");
    } catch {
      setStep("error");
      setErrorMsg("Withdrawal failed. Check wallet and try again.");
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
          <p className="terminal-label text-primary">Withdraw from AIxRWA Portfolio Vault</p>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "done" ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <p className="text-sm font-medium text-foreground">Withdrawal submitted</p>
            <p className="text-center text-xs text-muted-foreground">
              {numericAmount} {asset} withdrawn from AIxRWA Portfolio Vault.
            </p>
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
                  {WITHDRAW_ASSETS.map((a) => (
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
                    Vault: {vaultBalance.balance} {asset}
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
            </div>

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
              Withdraws funds from the Portfolio Vault back to your wallet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
