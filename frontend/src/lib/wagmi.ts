import { createConfig, http } from "wagmi";
import { mantle } from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { metaMaskWallet, rainbowWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: projectId
        ? [rainbowWallet, walletConnectWallet, metaMaskWallet]
        : [metaMaskWallet],
    },
  ],
  { appName: "AIxRWA", projectId },
);

export const wagmiConfig = createConfig({
  chains: [mantle],
  connectors,
  transports: {
    [mantle.id]: http(),
  },
  ssr: false,
});
