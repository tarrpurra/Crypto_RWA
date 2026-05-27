import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type ArbBotCreatePayload } from "@/lib/api";

const queryKeys = {
  rates: ["arb", "rates"] as const,
  spreads: ["arb", "spreads"] as const,
  details: (symbol: string) => ["arb", "details", symbol] as const,
  bots: ["arb", "bots"] as const,
};

type QueryRefreshOptions = {
  refetchInterval?: number;
  staleTime?: number;
};

export function useArbRates(options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: queryKeys.rates,
    queryFn: api.arb.getRates,
    refetchInterval: options?.refetchInterval ?? 10_000,
    staleTime: options?.staleTime,
  });
}

export function useArbSpreads(options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: queryKeys.spreads,
    queryFn: api.arb.getSpreads,
    refetchInterval: options?.refetchInterval ?? 10_000,
    staleTime: options?.staleTime,
  });
}

export function useArbBots(options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: queryKeys.bots,
    queryFn: api.arb.getBots,
    refetchInterval: options?.refetchInterval ?? 8_000,
    staleTime: options?.staleTime,
  });
}

export function useArbCoinDetails(
  symbol: string,
  enabled = true,
  options?: QueryRefreshOptions,
) {
  return useQuery({
    queryKey: queryKeys.details(symbol),
    queryFn: () => api.arb.getCoinDetails(symbol),
    enabled,
    refetchInterval: options?.refetchInterval ?? 10_000,
    staleTime: options?.staleTime,
  });
}

export function useCreateArbBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ArbBotCreatePayload) => api.arb.createBot(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bots });
    },
  });
}

export function useStartArbBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (botId: number) => api.arb.startBot(botId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bots });
    },
  });
}

export function useStopArbBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (botId: number) => api.arb.stopBot(botId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bots });
    },
  });
}

export type ElfaStatusResponse = {
  enabled: boolean;
  configured: boolean;
  reachable: boolean;
  status: string;
  api_url: string;
  timeout_seconds: number;
  fallback_mode: string;
  cache_ttl_seconds: number;
  stale_ttl_seconds: number;
  refresh_cooldown_seconds: number;
  api_key_status: string | null;
  message: string | null;
};

export type ElfaContextResponse = {
  symbol: string;
  enabled: boolean;
  configured: boolean;
  status: string;
  decision_source: string;
  reason: string | null;
  api_key_status: string | null;
  elfa_confidence: number | null;
  mindshare_score: number | null;
  engagement_score: number | null;
  mention_count: number | null;
  trending_rank: number | null;
  trending_change_percent: number | null;
  ai_summary: string | null;
  risk_flags: string[];
  cached_at: string | null;
  source_timestamp: string | null;
  is_stale: boolean;
};

const elfaQueryKeys = {
  status: ["elfa", "status"] as const,
  context: (symbol: string) => ["elfa", "context", symbol] as const,
};

export function useElfaStatus() {
  return useQuery({
    queryKey: elfaQueryKeys.status,
    queryFn: api.arb.getElfaStatus,
    staleTime: 30_000,
  });
}

export function useElfaContext(symbol: string, enabled = true) {
  return useQuery({
    queryKey: elfaQueryKeys.context(symbol),
    queryFn: () => api.arb.getElfaContext(symbol),
    enabled: enabled && !!symbol,
    staleTime: 60_000,
  });
}
