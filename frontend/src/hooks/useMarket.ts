import { useQuery } from "@tanstack/react-query";

import { marketApi } from "@/lib/api/market";

export function useMarketIngestionStatus() {
  return useQuery({
    queryKey: ["market", "ingestion"],
    queryFn: marketApi.ingestionStatus,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useLatestPrices() {
  return useQuery({
    queryKey: ["market", "prices", "latest"],
    queryFn: marketApi.latestPrices,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useUsdyOracle() {
  return useQuery({
    queryKey: ["market", "oracle", "usdy"],
    queryFn: marketApi.usdyOracle,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useMarketRoutes() {
  return useQuery({
    queryKey: ["market", "routes"],
    queryFn: marketApi.routes,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useLatestQuotes() {
  return useQuery({
    queryKey: ["market", "quotes", "latest"],
    queryFn: marketApi.latestQuotes,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function usePriceHistory(asset: string, range = "24h", bucket = "1h") {
  return useQuery({
    queryKey: ["market", "price-history", asset, range, bucket],
    queryFn: () => marketApi.priceHistory(asset, range, bucket),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}
