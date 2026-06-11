import { ArrowRight, Wallet, Vault } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VaultBalanceResponse } from "@/lib/api/types";

function toTwo(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number.parseFloat(n) : (n ?? 0);
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

interface VaultBalanceProps {
  vaultData: VaultBalanceResponse | undefined;
  walletData: VaultBalanceResponse | undefined;
  isLoading: boolean;
  onDeposit: () => void;
  onWithdraw: () => void;
}

function BalanceRow({ symbol, balance, value, share }: { symbol: string; balance: string; value: string | null; share?: number }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="flex h-2 w-2 rounded-full bg-primary/60" />
        <span className="text-muted-foreground">{symbol}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-foreground">{balance}</span>
        {value && <span className="font-mono text-muted-foreground">${toTwo(value)}</span>}
        {share != null && <span className="w-10 text-right font-mono text-muted-foreground">{(share * 100).toFixed(1)}%</span>}
      </div>
    </div>
  );
}

export function VaultBalance({ vaultData, walletData, isLoading, onDeposit, onWithdraw }: VaultBalanceProps) {
  if (isLoading) {
    return (
      <section className="terminal-panel border-primary/20 p-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-pulse border border-primary/30 bg-primary/10" />
          <span className="text-xs text-muted-foreground">Loading balances...</span>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {/* Wallet Funding Source */}
      <section className="terminal-panel border-primary/20 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <p className="terminal-label text-primary">Wallet Balance</p>
          </div>
          <Button onClick={onDeposit} variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10">
            Deposit into Portfolio Vault
            <ArrowRight className="ml-1.5 h-3 w-3" />
          </Button>
        </div>
        <div className="mt-3 space-y-0.5">
          {(walletData?.balances ?? []).length > 0 ? walletData?.balances.map((item) => (
            <BalanceRow key={item.asset_symbol} symbol={item.asset_symbol} balance={item.balance} value={item.value_usd} />
          )) : (
            <p className="py-2 text-xs text-muted-foreground">No wallet balance data available.</p>
          )}
        </div>
      </section>

      {/* AIxRWA Portfolio Vault */}
      <section className="terminal-panel border-primary/25 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Vault className="h-4 w-4 text-primary" />
            <p className="terminal-label text-primary">AIxRWA Portfolio Vault</p>
          </div>
          <div className="flex items-center gap-2">
            {vaultData?.total_value_usd != null && (
              <span className="font-mono text-sm font-semibold text-foreground">
                ${toTwo(vaultData.total_value_usd)}
              </span>
            )}
            <Button onClick={onWithdraw} variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10">
              Withdraw
            </Button>
          </div>
        </div>
        <div className="mt-3 space-y-0.5">
          {(vaultData?.balances ?? []).length > 0 ? vaultData?.balances.map((item) => (
            <BalanceRow key={item.asset_symbol} symbol={item.asset_symbol} balance={item.balance} value={item.value_usd} share={item.share} />
          )) : (
            <p className="py-2 text-xs text-muted-foreground">No funds deposited yet. Deposit from your wallet to start AI-managed allocation.</p>
          )}
        </div>
        {(vaultData?.pending_deposits ?? 0) > 0 && (
          <p className="mt-2 text-[0.65rem] text-warning">
            {vaultData?.pending_deposits} pending deposit{vaultData?.pending_deposits !== 1 ? "s" : ""}
          </p>
        )}
      </section>
    </div>
  );
}
