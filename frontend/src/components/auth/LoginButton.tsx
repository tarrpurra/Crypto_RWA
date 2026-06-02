import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Wallet } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

export function LoginButton() {
  const { logout } = useAuth();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
        if (!mounted) {
          return (
            <Button variant="outline" size="sm" disabled className="gap-2">
              <Wallet className="h-4 w-4" />
              Loading...
            </Button>
          );
        }

        if (!account) {
          return (
            <Button variant="outline" size="sm" onClick={openConnectModal} className="gap-2">
              <LogIn className="h-4 w-4" />
              Connect Wallet
            </Button>
          );
        }

        return (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={openAccountModal}
              className="h-8 gap-2 border-success/35 bg-success/10 px-2.5 text-success hover:border-success/60 hover:bg-success/15"
              title={chain?.name ?? "Connected wallet"}
            >
              <span className="h-1.5 w-1.5 bg-success" />
              <Wallet className="h-3.5 w-3.5" />
              <span className="max-w-[8rem] truncate font-mono text-[11px]">
                {account.displayName ?? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void logout()}
              className="h-8 w-8 border border-border text-muted-foreground hover:border-danger/50 hover:text-danger"
              title="Disconnect wallet"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="sr-only">Disconnect wallet</span>
            </Button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
