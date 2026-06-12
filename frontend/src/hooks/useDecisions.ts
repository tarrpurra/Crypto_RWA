import { useQuery } from "@tanstack/react-query";

import { decisionsApi } from "@/lib/api/decisions";
import { useInvestmentScope } from "@/hooks/useInvestmentScope";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

export function useDecisions() {
  const { effectiveWalletAddress } = usePortfolioWallet();
  const { scope } = useInvestmentScope();
  const scopeKey = scope ? JSON.stringify(scope) : null;
  return useQuery({
    queryKey: ["decisions", effectiveWalletAddress, scopeKey],
    queryFn: () =>
      decisionsApi.getDecisions(
        effectiveWalletAddress,
        scope
          ? {
              deposit_asset_symbol: scope.depositAssetSymbol,
              deposit_amount: scope.depositAmount,
              risk_profile: scope.riskProfile,
              allocation_mode: scope.allocationMode,
            }
          : null,
    ),
    enabled: Boolean(effectiveWalletAddress),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
