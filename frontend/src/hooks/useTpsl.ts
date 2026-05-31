import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type TpslSessionCreatePayload } from "@/lib/api";

const queryKeys = {
  sessions: (status?: string) => ["tpsl", "sessions", status ?? "all"] as const,
  events: (sessionId: number) => ["tpsl", "events", sessionId] as const,
};

type QueryRefreshOptions = {
  refetchInterval?: number;
  staleTime?: number;
};

export function useTpslSessions(status?: string, options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: queryKeys.sessions(status),
    queryFn: () => api.tpsl.getSessions(status),
    refetchInterval: options?.refetchInterval ?? 8_000,
    staleTime: options?.staleTime,
  });
}

export function useCreateTpslSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TpslSessionCreatePayload) => api.tpsl.createSession(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tpsl", "sessions"] });
    },
  });
}

export function useTpslSessionEvents(
  sessionId: number | null,
  enabled = true,
  options?: QueryRefreshOptions,
) {
  return useQuery({
    queryKey: queryKeys.events(sessionId ?? 0),
    queryFn: () => api.tpsl.getSessionEvents(sessionId as number),
    enabled: enabled && sessionId !== null,
    refetchInterval: options?.refetchInterval ?? 8_000,
    staleTime: options?.staleTime,
  });
}

export function useCancelTpslSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => api.tpsl.cancelSession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tpsl", "sessions"] });
    },
  });
}

export function useCloseTpslSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => api.tpsl.closeSession(sessionId),
    onSuccess: (_, sessionId) => {
      void queryClient.invalidateQueries({ queryKey: ["tpsl", "sessions"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.events(sessionId) });
    },
  });
}
