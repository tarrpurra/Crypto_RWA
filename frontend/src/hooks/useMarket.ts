import { useQuery } from "@tanstack/react-query";

import { marketApi } from "@/lib/api/market";

export function useMarketIngestionStatus() {
  return useQuery({
    queryKey: ["market", "ingestion"],
    queryFn: marketApi.ingestionStatus,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useLatestPrices() {
  return useQuery({
    queryKey: ["market", "prices", "latest"],
    queryFn: marketApi.latestPrices,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useUsdyOracle() {
  return useQuery({
    queryKey: ["market", "oracle", "usdy"],
    queryFn: marketApi.usdyOracle,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useMarketRoutes() {
  return useQuery({
    queryKey: ["market", "routes"],
    queryFn: marketApi.routes,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useLatestQuotes() {
  return useQuery({
    queryKey: ["market", "quotes", "latest"],
    queryFn: marketApi.latestQuotes,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
