'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn, LogOut, Wallet } from 'lucide-react';

const AUTH_TOKEN_STORAGE_KEY = 'pacifica_auth_token';
const AUTH_TOKEN_CHANGE_EVENT = 'pacifica-auth-token-change';

function hasStoredAuthToken(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return Boolean(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY));
}

export function LoginButton() {
  const { ready, user, login, logout } = useAuth();
  const [tokenStored, setTokenStored] = useState(hasStoredAuthToken);

  useEffect(() => {
    if (user) {
      setTokenStored(false);
      return;
    }

    const syncTokenStored = () => setTokenStored(hasStoredAuthToken());
    syncTokenStored();

    window.addEventListener(AUTH_TOKEN_CHANGE_EVENT, syncTokenStored);
    window.addEventListener('storage', syncTokenStored);
    return () => {
      window.removeEventListener(AUTH_TOKEN_CHANGE_EVENT, syncTokenStored);
      window.removeEventListener('storage', syncTokenStored);
    };
  }, [user]);

  if (!ready) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (user) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={logout}
        className="gap-2 text-success border-success/30"
      >
        <Wallet className="h-4 w-4" />
        {user.wallet?.address
          ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}`
          : 'Connected'}
        <LogOut className="h-3 w-3 ml-1" />
      </Button>
    );
  }

  if (tokenStored) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void logout()}
        className="gap-2 text-warning border-warning/30"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={login} className="gap-2">
      <LogIn className="h-4 w-4" />
      Connect Wallet
    </Button>
  );
}
