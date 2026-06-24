import { useQuery } from "@tanstack/react-query";

import { dashboardApi } from "@/lib/api/dashboard";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

export function useDashboardSummary() {
  const { effectiveWalletAddress } = usePortfolioWallet();
  return useQuery({
    queryKey: ["dashboard", "summary", effectiveWalletAddress],
    queryFn: () => dashboardApi.summary(effectiveWalletAddress),
    enabled: Boolean(effectiveWalletAddress),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 60_000,
    retry: 1,
  });
}
