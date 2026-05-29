import { useQuery } from "@tanstack/react-query";

import { portfolioApi } from "@/lib/api/portfolio";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

export function useCurrentPortfolio() {
  const { walletAddress } = usePortfolioWallet();
  return useQuery({
    queryKey: ["portfolio", "current", walletAddress],
    queryFn: () => portfolioApi.current(walletAddress),
    refetchInterval: 30_000,
  });
}

export function usePortfolioSnapshots(limit = 20) {
  const { walletAddress } = usePortfolioWallet();
  return useQuery({
    queryKey: ["portfolio", "snapshots", limit, walletAddress],
    queryFn: () => portfolioApi.snapshots(limit, walletAddress),
    refetchInterval: 60_000,
  });
}
