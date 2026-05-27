import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

const queryKeys = {
  symbols: ["orderbook", "symbols"] as const,
  snapshot: (symbol: string) => ["orderbook", "snapshot", symbol] as const,
  imbalance: (symbol: string) => ["orderbook", "imbalance", symbol] as const,
  signal: (symbol: string) => ["orderbook", "signal", symbol] as const,
  walls: (symbol: string) => ["orderbook", "walls", symbol] as const,
};

type QueryRefreshOptions = {
  refetchInterval?: number;
  staleTime?: number;
};

export function useOrderbookSymbols(options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: queryKeys.symbols,
    queryFn: api.orderbook.getSymbols,
    refetchInterval: options?.refetchInterval ?? 10_000,
    staleTime: options?.staleTime,
  });
}

export function useOrderbookSnapshot(
  symbol: string,
  enabled = true,
  options?: QueryRefreshOptions,
) {
  return useQuery({
    queryKey: queryKeys.snapshot(symbol),
    queryFn: () => api.orderbook.getSnapshot(symbol),
    enabled,
    refetchInterval: options?.refetchInterval ?? 2_000,
    staleTime: options?.staleTime,
  });
}

export function useOrderbookImbalance(
  symbol: string,
  enabled = true,
  options?: QueryRefreshOptions,
) {
  return useQuery({
    queryKey: queryKeys.imbalance(symbol),
    queryFn: () => api.orderbook.getImbalance(symbol),
    enabled,
    refetchInterval: options?.refetchInterval ?? 2_000,
    staleTime: options?.staleTime,
  });
}

export function useOrderbookSignal(
  symbol: string,
  enabled = true,
  options?: QueryRefreshOptions,
) {
  return useQuery({
    queryKey: queryKeys.signal(symbol),
    queryFn: () => api.orderbook.getSignal(symbol),
    enabled,
    refetchInterval: options?.refetchInterval ?? 2_000,
    staleTime: options?.staleTime,
  });
}

export function useOrderbookWalls(
  symbol: string,
  enabled = true,
  options?: QueryRefreshOptions,
) {
  return useQuery({
    queryKey: queryKeys.walls(symbol),
    queryFn: () => api.orderbook.getWalls(symbol),
    enabled,
    refetchInterval: options?.refetchInterval ?? 4_000,
    staleTime: options?.staleTime,
  });
}
