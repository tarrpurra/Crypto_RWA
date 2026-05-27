import { useQuery } from "@tanstack/react-query";

import { portfolioApi } from "@/lib/api/portfolio";

export function useCurrentPortfolio() {
  return useQuery({
    queryKey: ["portfolio", "current"],
    queryFn: portfolioApi.current,
    refetchInterval: 30_000,
  });
}

export function usePortfolioSnapshots(limit = 20) {
  return useQuery({
    queryKey: ["portfolio", "snapshots", limit],
    queryFn: () => portfolioApi.snapshots(limit),
    refetchInterval: 60_000,
  });
}
