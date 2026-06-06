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

export function useInvestmentScope() {
  const [scope, setScopeState] = useState<InvestmentScopeState | null>(readStoredScope);

  useEffect(() => {
    const sync = () => setScopeState(readStoredScope());
    window.addEventListener(SCOPE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SCOPE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setScope = useCallback((nextScope: InvestmentScopeState | null) => {
    setScopeState(nextScope);
    persistScope(nextScope);
  }, []);

  const clearScope = useCallback(() => {
    setScopeState(null);
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
