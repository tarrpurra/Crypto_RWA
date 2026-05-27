'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { PrivyProvider as PrivyProviderPkg, usePrivy } from '@privy-io/react-auth';
import { logger } from '@/lib/logger';

const PRIVY_APP_ID = String(import.meta.env.VITE_PRIVY_APP_ID ?? '').trim();
const AUTH_TOKEN_STORAGE_KEY = 'pacifica_auth_token';
const AUTH_TOKEN_CHANGE_EVENT = 'pacifica-auth-token-change';

function emitAuthTokenChange() {
  window.dispatchEvent(new Event(AUTH_TOKEN_CHANGE_EVENT));
}

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
  if (!PRIVY_APP_ID) {
    return <LocalAuthProvider>{children}</LocalAuthProvider>;
  }

  return (
    <PrivyProviderPkg
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#C8A96E',
          logo: undefined,
        },
        embeddedSocialLogin: {
          origins: [],
        },
      }}
    >
      <PrivyAuthWrapper>{children}</PrivyAuthWrapper>
    </PrivyProviderPkg>
  );
}

function LocalAuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    logger.warn('auth.privy.disabled', {
      reason: 'VITE_PRIVY_APP_ID is not configured',
    });
  }, []);

  const login = useCallback(() => {
    logger.warn('auth.login.unavailable', {
      reason: 'VITE_PRIVY_APP_ID is not configured',
    });
  }, []);

  const logout = useCallback(async () => {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    emitAuthTokenChange();
  }, []);

  return (
    <AuthContext.Provider value={{ ready: true, user: null, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

function PrivyAuthWrapper({ children }: { children: ReactNode }) {
  const { ready, user, login, logout, getAccessToken } = usePrivy();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (ready) {
      setIsReady(true);
    }
  }, [ready]);

  useEffect(() => {
    let cancelled = false;

    if (!ready || !user) {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      emitAuthTokenChange();
      return () => {
        cancelled = true;
      };
    }

    getAccessToken()
      .then((token) => {
        if (cancelled) {
          return;
        }
        if (token) {
          window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
          emitAuthTokenChange();
          return;
        }
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        emitAuthTokenChange();
      })
      .catch((error: unknown) => {
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        emitAuthTokenChange();
        logger.error('auth.privy.token.sync_failed', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [getAccessToken, ready, user]);

  const handleLogout = useCallback(async () => {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    emitAuthTokenChange();
    await logout();
  }, [logout]);

  const authUser: AuthUser | null = user
    ? {
        id: user.id,
        wallet: user.wallet
          ? {
              address: user.wallet.address,
              chainType: user.wallet.chainType,
            }
          : undefined,
        email: user.email?.address,
        phone: user.phone?.number,
      }
    : null;

  return (
    <AuthContext.Provider value={{ ready: isReady, user: authUser, login, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}
