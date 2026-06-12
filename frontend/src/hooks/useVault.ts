import { useQuery } from "@tanstack/react-query";

import { vaultApi } from "@/lib/api/vault";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";

export function useVaultBalance() {
  const { effectiveWalletAddress } = usePortfolioWallet();
  return useQuery({
    queryKey: ["vault", "balance", effectiveWalletAddress],
    queryFn: () => vaultApi.balance(effectiveWalletAddress),
    enabled: Boolean(effectiveWalletAddress),
    refetchInterval: 15_000,
  });
}

export function useWalletBalance() {
  const { effectiveWalletAddress } = usePortfolioWallet();
  return useQuery({
    queryKey: ["vault", "wallet", effectiveWalletAddress],
    queryFn: () => vaultApi.walletBalance(effectiveWalletAddress),
    enabled: Boolean(effectiveWalletAddress),
    refetchInterval: 15_000,
  });
}
