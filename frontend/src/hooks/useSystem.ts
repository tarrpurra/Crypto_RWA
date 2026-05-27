import { useQuery } from "@tanstack/react-query";

import { systemApi } from "@/lib/api/system";

export function useSystemHealth() {
  return useQuery({
    queryKey: ["system", "health"],
    queryFn: systemApi.health,
    refetchInterval: 15_000,
  });
}

export function useServiceStatus() {
  return useQuery({
    queryKey: ["system", "status"],
    queryFn: systemApi.status,
    refetchInterval: 30_000,
  });
}

export function useChainStatus() {
  return useQuery({
    queryKey: ["chain", "status"],
    queryFn: systemApi.chainStatus,
    refetchInterval: 30_000,
  });
}
