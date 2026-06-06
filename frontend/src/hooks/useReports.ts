import { useQuery } from "@tanstack/react-query";

import { reportsApi } from "@/lib/api/reports";
import { useInvestmentScope } from "@/hooks/useInvestmentScope";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

export function useInvestmentReport() {
  const { effectiveWalletAddress } = usePortfolioWallet();
  const { scope } = useInvestmentScope();

  return useQuery({
    queryKey: ["reports", "investment", effectiveWalletAddress, scope],
    queryFn: () =>
      reportsApi.latest(
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
    refetchInterval: 120_000,
  });
}
