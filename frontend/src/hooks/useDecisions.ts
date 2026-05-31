import { useQuery } from "@tanstack/react-query";

import { decisionsApi } from "@/lib/api/decisions";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

export function useDecisions() {
  const { walletAddress } = usePortfolioWallet();
  return useQuery({
    queryKey: ["decisions", walletAddress],
    queryFn: () => decisionsApi.getDecisions(walletAddress),
    refetchInterval: 30_000,
  });
}
