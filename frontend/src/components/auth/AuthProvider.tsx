"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { logger } from "@/lib/logger";

const AUTH_TOKEN_KEY = "pacifica_auth_token";
const PORTFOLIO_WALLET_KEY = "aixrwa_portfolio_wallet_address";
const PORTFOLIO_WALLET_EVENT = "aixrwa-portfolio-wallet-change";

export interface AuthUser {
  id: string;
  wallet?: {
    address: string;
    chainType: string;
  };
  email?: string;
  phone?: string;
}

interface AuthContextType {
  ready: boolean;
  user: AuthUser | null;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  ready: true,
  user: null,
  login: () => undefined,
  logout: async () => undefined,
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { address, isConnected, chain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHydrated(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const user: AuthUser | null =
    isConnected && address
      ? {
          id: address,
          wallet: {
            address,
            chainType: chain?.name ?? "evm",
          },
        }
      : null;

  const login = useCallback(() => {
    if (openConnectModal) {
      openConnectModal();
    } else {
      logger.warn("auth.connect.unavailable", {
        reason: "RainbowKit connect modal not available",
      });
    }
  }, [openConnectModal]);

  const logout = useCallback(async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      window.localStorage.removeItem(PORTFOLIO_WALLET_KEY);
      window.dispatchEvent(new Event(PORTFOLIO_WALLET_EVENT));
    }
    disconnect();
  }, [disconnect]);

  return (
    <AuthContext.Provider value={{ ready: hydrated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
