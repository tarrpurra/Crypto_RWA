import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { mantleSepoliaTestnet } from "wagmi/chains";

const STORAGE_KEY = "aixrwa_portfolio_wallet_address";
const WALLET_EVENT = "aixrwa-portfolio-wallet-change";

function readStoredWallet(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

export function usePortfolioWallet() {
  const { address } = useAccount();
  const chainId = useChainId();
  const [storedWallet, setStoredWallet] = useState(readStoredWallet);
  const isSupportedChain = chainId === mantleSepoliaTestnet.id;

  useEffect(() => {
    const sync = () => setStoredWallet(readStoredWallet());
    window.addEventListener(WALLET_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WALLET_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const [lastConnectedAddress, setLastConnectedAddress] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (address && isSupportedChain) {
      const normalized = address.trim();
      if (normalized && normalized !== storedWallet) {
        window.localStorage.setItem(STORAGE_KEY, normalized);
        setStoredWallet(normalized);
        window.dispatchEvent(new Event(WALLET_EVENT));
      }
      setLastConnectedAddress(normalized);
    } else {
      if (lastConnectedAddress && !address) {
        if (storedWallet.toLowerCase() === lastConnectedAddress.toLowerCase()) {
          window.localStorage.removeItem(STORAGE_KEY);
          setStoredWallet("");
          window.dispatchEvent(new Event(WALLET_EVENT));
        }
      }
      setLastConnectedAddress(undefined);
    }
  }, [address, isSupportedChain, storedWallet, lastConnectedAddress]);

  const setWalletAddress = useCallback((address: string) => {
    const normalized = address.trim();
    if (normalized) {
      window.localStorage.setItem(STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setStoredWallet(normalized);
    window.dispatchEvent(new Event(WALLET_EVENT));
  }, []);

  const walletAddress = address ? (isSupportedChain ? address : "") : "";
  const effectiveWalletAddress = walletAddress || storedWallet.trim();

  return useMemo(
    () => ({
      walletAddress,
      effectiveWalletAddress,
      storedWallet,
      connectedWalletAddress: address ?? "",
      connectedChainId: chainId,
      isSupportedChain,
      setWalletAddress,
    }),
    [address, chainId, effectiveWalletAddress, isSupportedChain, setWalletAddress, storedWallet, walletAddress],
  );
}
