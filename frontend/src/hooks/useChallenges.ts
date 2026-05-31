import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

const queryKeys = {
  tiers: ["challenges", "tiers"] as const,
  sessions: (status?: string) => ["challenges", "sessions", status ?? "all"] as const,
  leaderboard: (limit: number) => ["challenges", "leaderboard", limit] as const,
};

export function useChallengeTiers() {
  return useQuery({
    queryKey: queryKeys.tiers,
    queryFn: api.challenges.getTiers,
    staleTime: 60_000,
  });
}

export function useChallengeSessions(status?: string) {
  return useQuery({
    queryKey: queryKeys.sessions(status),
    queryFn: () => api.challenges.getSessions(status),
    refetchInterval: 10_000,
  });
}

export function useChallengeLeaderboard(limit = 50) {
  return useQuery({
    queryKey: queryKeys.leaderboard(limit),
    queryFn: () => api.challenges.getLeaderboard(limit),
    refetchInterval: 15_000,
  });
}

export function useCreateChallengeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tier: string) => api.challenges.createSession(tier),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["challenges", "sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["challenges", "leaderboard"] });
    },
  });
}
