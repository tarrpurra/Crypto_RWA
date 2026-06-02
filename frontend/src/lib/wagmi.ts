import { createConfig, http } from "wagmi";
import { mantleSepoliaTestnet } from "wagmi/chains";
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
  chains: [mantleSepoliaTestnet],
  connectors,
  transports: {
    [mantleSepoliaTestnet.id]: http(),
  },
  ssr: false,
});
