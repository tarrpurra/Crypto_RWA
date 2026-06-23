import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { systemApi } from "@/lib/api/system";

export function useSystemHealth() {
  return useQuery({
    queryKey: ["system", "health"],
    queryFn: systemApi.health,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useServiceStatus() {
  return useQuery({
    queryKey: ["system", "status"],
    queryFn: systemApi.status,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}

export function useSystemReadiness() {
  return useQuery({
    queryKey: ["system", "readiness"],
    queryFn: systemApi.readiness,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}

export function useChainStatus() {
  return useQuery({
    queryKey: ["chain", "status"],
    queryFn: systemApi.chainStatus,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["system", "settings"],
    queryFn: systemApi.settings,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: systemApi.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["system", "health"] });
      queryClient.invalidateQueries({ queryKey: ["system", "status"] });
      queryClient.invalidateQueries({ queryKey: ["system", "readiness"] });
      queryClient.invalidateQueries({ queryKey: ["decisions"] });
      queryClient.invalidateQueries({ queryKey: ["risk"] });
      queryClient.invalidateQueries({ queryKey: ["allocation"] });
      queryClient.invalidateQueries({ queryKey: ["reports", "investment"] });
    },
  });
}
