import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { strategyApi } from "@/lib/api/strategy";
import type { StrategyDraftRequest, StrategySchedulerUpdateRequest, StrategyRevertRequest } from "@/lib/api/types";

function invalidateStrategy(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["strategy"] });
  void queryClient.invalidateQueries({ queryKey: ["risk"] });
  void queryClient.invalidateQueries({ queryKey: ["allocation"] });
  void queryClient.invalidateQueries({ queryKey: ["decisions"] });
}

export function useStrategyTemplates() {
  return useQuery({
    queryKey: ["strategy", "templates"],
    queryFn: strategyApi.templates,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useStrategyActive(userAddress?: string | null) {
  return useQuery({
    queryKey: ["strategy", "active", userAddress ?? null],
    queryFn: () => strategyApi.active(userAddress),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useStrategyVersions(userAddress?: string | null) {
  return useQuery({
    queryKey: ["strategy", "versions", userAddress ?? null],
    queryFn: () => strategyApi.versions(userAddress),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useStrategyAudit(version?: string | null) {
  return useQuery({
    queryKey: ["strategy", "audit", version ?? null],
    queryFn: () => strategyApi.audit(version),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useCreateStrategyDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StrategyDraftRequest) => strategyApi.draft(body),
    onSuccess: () => invalidateStrategy(queryClient),
  });
}

export function useValidateStrategy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StrategyDraftRequest) => strategyApi.validate(body),
    onSuccess: () => invalidateStrategy(queryClient),
  });
}

export function useSimulateStrategy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StrategyDraftRequest) => strategyApi.simulate(body),
    onSuccess: () => invalidateStrategy(queryClient),
  });
}

export function useActivateStrategy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StrategyDraftRequest) => strategyApi.activate(body),
    onSuccess: () => invalidateStrategy(queryClient),
  });
}

export function useUpdateActiveStrategy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StrategyDraftRequest) => strategyApi.updateActive(body),
    onSuccess: () => invalidateStrategy(queryClient),
  });
}

export function useRevertStrategy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StrategyRevertRequest) => strategyApi.revert(body),
    onSuccess: () => invalidateStrategy(queryClient),
  });
}

export function useUpdateStrategyScheduler() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StrategySchedulerUpdateRequest) => strategyApi.scheduler(body),
    onSuccess: () => invalidateStrategy(queryClient),
  });
}

