import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { allocationApi } from "@/lib/api/allocation";
import { useInvestmentScope } from "@/hooks/useInvestmentScope";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

export function useAllocationRecommendation() {
  const { effectiveWalletAddress } = usePortfolioWallet();
  const { scope } = useInvestmentScope();
  const requestScope = scope
    ? {
        depositAssetSymbol: scope.depositAssetSymbol,
        depositAmount: scope.depositAmount,
        riskProfile: scope.riskProfile,
        allocationMode: scope.allocationMode,
      }
    : null;
  const scopeKey = scope ? JSON.stringify(scope) : null;
  return useQuery({
    queryKey: ["allocation", "recommendation", effectiveWalletAddress, scopeKey],
    queryFn: async () => {
      console.info("[frontend][allocation] requesting /allocation/recommendation", {
        walletAddress: effectiveWalletAddress,
        scope: requestScope,
      });

      try {
        const response = await allocationApi.recommendation(
          effectiveWalletAddress,
          requestScope
            ? {
                deposit_asset_symbol: requestScope.depositAssetSymbol,
                deposit_amount: requestScope.depositAmount,
                risk_profile: requestScope.riskProfile,
                allocation_mode: requestScope.allocationMode,
              }
            : null,
        );
        console.info("[frontend][allocation] received recommendation", {
          status: response.status,
          status_code: response.status_code,
          recommended_action: response.decision?.recommended_action,
          rebalance_actions: response.rebalance_actions.map((action) => ({
            asset_symbol: action.asset_symbol,
            action: action.action,
            token_in_symbol: action.token_in_symbol ?? null,
            token_out_symbol: action.token_out_symbol ?? null,
            swap_pair_label: action.swap_pair_label ?? null,
          })),
        });
        return response;
      } catch (error) {
        console.error("[frontend][allocation] request failed", {
          walletAddress: effectiveWalletAddress,
          scope: requestScope,
          error,
        });
        throw error;
      }
    },
    enabled: Boolean(effectiveWalletAddress),
    staleTime: 90_000,
    refetchInterval: 90_000,
    refetchOnWindowFocus: false,
    retry: 1,
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
