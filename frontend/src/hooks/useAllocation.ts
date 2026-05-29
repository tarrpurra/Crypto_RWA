import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { allocationApi } from "@/lib/api/allocation";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

export function useAllocationRecommendation() {
  const { walletAddress } = usePortfolioWallet();
  return useQuery({
    queryKey: ["allocation", "recommendation", walletAddress],
    queryFn: () => allocationApi.recommendation(walletAddress),
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
