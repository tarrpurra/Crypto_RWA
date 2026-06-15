import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { mantleSepoliaTestnet } from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { metaMaskWallet, rainbowWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";

const rawProjectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() ??
  import.meta.env.VITE_REOWN_PROJECT_ID?.trim() ??
  "";
const hasReownProjectId = rawProjectId.length > 0 && !/^0+$/.test(rawProjectId);
const useReownConnectors = import.meta.env.PROD && hasReownProjectId;
const mantleSepoliaRpcUrl =
  import.meta.env.VITE_MANTLE_SEPOLIA_QUICKNODE_HTTP_URL?.trim() ||
  import.meta.env.VITE_MANTLE_SEPOLIA_RPC_URL?.trim() ||
  mantleSepoliaTestnet.rpcUrls.default.http[0];

const connectors = useReownConnectors
  ? connectorsForWallets(
      [
        {
          groupName: "Recommended",
          wallets: [rainbowWallet, walletConnectWallet, metaMaskWallet],
        },
      ],
      { appName: "AIxRWA", projectId: rawProjectId },
    )
  : [injected()];

export const wagmiConfig = createConfig({
  chains: [mantleSepoliaTestnet],
  connectors,
  transports: {
    [mantleSepoliaTestnet.id]: http(mantleSepoliaRpcUrl),
  },
  ssr: false,
});
