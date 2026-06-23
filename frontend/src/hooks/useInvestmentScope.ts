import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "aixrwa_investment_scope";
const SCOPE_EVENT = "aixrwa-investment-scope-change";

export interface InvestmentScopeState {
  depositAssetSymbol: string;
  depositAmount: number;
  riskProfile: string;
  allocationMode: string;
  chainId: number;
}

function readStoredScope(): InvestmentScopeState | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<InvestmentScopeState>;
    if (
      typeof parsed.depositAssetSymbol !== "string" ||
      typeof parsed.depositAmount !== "number" ||
      typeof parsed.riskProfile !== "string" ||
      typeof parsed.allocationMode !== "string" ||
      typeof parsed.chainId !== "number"
    ) {
      return null;
    }
    return parsed as InvestmentScopeState;
  } catch {
    return null;
  }
}

function persistScope(scope: InvestmentScopeState | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (scope) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scope));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new Event(SCOPE_EVENT));
}

function scopesEqual(left: InvestmentScopeState | null, right: InvestmentScopeState | null) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.depositAssetSymbol === right.depositAssetSymbol &&
    left.depositAmount === right.depositAmount &&
    left.riskProfile === right.riskProfile &&
    left.allocationMode === right.allocationMode &&
    left.chainId === right.chainId
  );
}

export function useInvestmentScope() {
  const [scope, setScopeState] = useState<InvestmentScopeState | null>(readStoredScope);

  useEffect(() => {
    const sync = () => {
      const nextScope = readStoredScope();
      setScopeState((currentScope) => (scopesEqual(currentScope, nextScope) ? currentScope : nextScope));
    };
    window.addEventListener(SCOPE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SCOPE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setScope = useCallback((nextScope: InvestmentScopeState | null) => {
    let changed = false;
    setScopeState((currentScope) => {
      if (scopesEqual(currentScope, nextScope)) {
        return currentScope;
      }
      changed = true;
      return nextScope;
    });
    if (!changed) {
      return;
    }
    persistScope(nextScope);
  }, []);

  const clearScope = useCallback(() => {
    let changed = false;
    setScopeState((currentScope) => {
      if (currentScope === null) {
        return currentScope;
      }
      changed = true;
      return null;
    });
    if (!changed) {
      return;
    }
    persistScope(null);
  }, []);

  return useMemo(
    () => ({
      scope,
      setScope,
      clearScope,
      hasScope: Boolean(scope && scope.depositAmount > 0),
    }),
    [clearScope, scope, setScope],
  );
}
