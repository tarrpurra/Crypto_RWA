import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

export function WalletScopeControl() {
  const { connectedWalletAddress, storedWallet, walletAddress, setWalletAddress } = usePortfolioWallet();
  const editable = !connectedWalletAddress;

  return (
    <section className="terminal-panel p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <p className="terminal-label text-primary">Wallet Scope</p>
          </div>
          <p className="mt-2 break-all font-mono text-sm text-foreground">
            {walletAddress || "Using backend env fallback"}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 md:max-w-[460px] md:flex-row">
          <input
            value={editable ? storedWallet : connectedWalletAddress}
            disabled={!editable}
            onChange={(event) => setWalletAddress(event.target.value)}
            placeholder="0x wallet address for portfolio reads"
            className="h-9 min-w-0 flex-1 border border-border bg-surface-2 px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:opacity-70"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!editable || !storedWallet}
            onClick={() => setWalletAddress("")}
          >
            Clear
          </Button>
        </div>
      </div>
    </section>
  );
}
