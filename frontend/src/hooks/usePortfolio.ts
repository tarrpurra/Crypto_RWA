import { useQuery } from "@tanstack/react-query";

import { portfolioApi } from "@/lib/api/portfolio";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

export function useCurrentPortfolio(options?: { allowEnvFallback?: boolean }) {
  const { effectiveWalletAddress } = usePortfolioWallet();
  const allowEnvFallback = options?.allowEnvFallback ?? false;
  return useQuery({
    queryKey: ["portfolio", "current", effectiveWalletAddress, allowEnvFallback],
    queryFn: () => portfolioApi.current(effectiveWalletAddress, allowEnvFallback),
    enabled: Boolean(effectiveWalletAddress) || allowEnvFallback,
    refetchInterval: 30_000,
  });
}

export function usePortfolioSnapshots(limit = 20) {
  const { effectiveWalletAddress } = usePortfolioWallet();
  return useQuery({
    queryKey: ["portfolio", "snapshots", limit, effectiveWalletAddress],
    queryFn: () => portfolioApi.snapshots(limit, effectiveWalletAddress),
    enabled: Boolean(effectiveWalletAddress),
    refetchInterval: 60_000,
  });
}
