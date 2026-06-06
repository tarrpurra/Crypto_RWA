import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { allocationApi } from "@/lib/api/allocation";
import { useInvestmentScope } from "@/hooks/useInvestmentScope";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

export function useAllocationRecommendation() {
  const { effectiveWalletAddress } = usePortfolioWallet();
  const { scope } = useInvestmentScope();
  return useQuery({
    queryKey: ["allocation", "recommendation", effectiveWalletAddress, scope],
    queryFn: () =>
      allocationApi.recommendation(
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
    refetchInterval: 45_000,
  });
}

export function useUpdateAllocationProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: allocationApi.updateProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["allocation"] });
    },
  });
}
