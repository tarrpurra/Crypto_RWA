import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { LogIn, Wallet } from "lucide-react";

export function LoginButton() {
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
          <Button
            variant="outline"
            size="sm"
            onClick={openAccountModal}
            className="gap-2 text-success border-success/30"
          >
            <Wallet className="h-4 w-4" />
            {account.displayName}
          </Button>
        );
      }}
    </ConnectButton.Custom>
  );
}
