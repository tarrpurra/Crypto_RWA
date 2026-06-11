import { useQuery } from "@tanstack/react-query";

import { riskApi } from "@/lib/api/risk";
import { useInvestmentScope } from "@/hooks/useInvestmentScope";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

export function useCurrentRisk(options?: { allowEnvFallback?: boolean }) {
  const { effectiveWalletAddress } = usePortfolioWallet();
  const { scope } = useInvestmentScope();
  const allowEnvFallback = options?.allowEnvFallback ?? false;
  const scopeKey = scope ? JSON.stringify(scope) : null;
  return useQuery({
    queryKey: ["risk", "current", effectiveWalletAddress, scopeKey, allowEnvFallback],
    queryFn: () =>
      riskApi.current(
        effectiveWalletAddress,
        scope
          ? {
              deposit_asset_symbol: scope.depositAssetSymbol,
              deposit_amount: scope.depositAmount,
              risk_profile: scope.riskProfile,
              allocation_mode: scope.allocationMode,
            }
          : null,
        allowEnvFallback,
      ),
    enabled: Boolean(effectiveWalletAddress) || allowEnvFallback,
    refetchInterval: 30_000,
  });
}

export function useRiskAssessments(limit = 20) {
  return useQuery({
    queryKey: ["risk", "assessments", limit],
    queryFn: () => riskApi.assessments(limit),
    refetchInterval: 60_000,
  });
}
