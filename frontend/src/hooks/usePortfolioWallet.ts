import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";

const STORAGE_KEY = "aixrwa_portfolio_wallet_address";
const WALLET_EVENT = "aixrwa-portfolio-wallet-change";

function readStoredWallet(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

export function usePortfolioWallet() {
  const { user } = useAuth();
  const [storedWallet, setStoredWallet] = useState(readStoredWallet);

  useEffect(() => {
    const sync = () => setStoredWallet(readStoredWallet());
    window.addEventListener(WALLET_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WALLET_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

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

  const walletAddress = user?.wallet?.address ?? storedWallet;

  return useMemo(
    () => ({
      walletAddress,
      storedWallet,
      connectedWalletAddress: user?.wallet?.address ?? "",
      setWalletAddress,
    }),
    [setWalletAddress, storedWallet, user?.wallet?.address, walletAddress],
  );
}
