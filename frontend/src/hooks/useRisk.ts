import { useQuery } from "@tanstack/react-query";

import { riskApi } from "@/lib/api/risk";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

export function useCurrentRisk() {
  const { walletAddress } = usePortfolioWallet();
  return useQuery({
    queryKey: ["risk", "current", walletAddress],
    queryFn: () => riskApi.current(walletAddress),
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
