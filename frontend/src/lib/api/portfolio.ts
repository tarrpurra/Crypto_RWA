import { request } from "./client";
import type { PortfolioSnapshotHistoryResponse, PortfolioSnapshotResponse } from "./types";

function currentQuery(walletAddress?: string, allowEnvFallback = false): string {
  const params = new URLSearchParams();
  const address = walletAddress?.trim();
  if (address) {
    params.set("wallet_address", address);
  }
  if (allowEnvFallback) {
    params.set("allow_env_fallback", "true");
  }
  return params.toString();
}

function walletQuery(walletAddress?: string): string {
  const address = walletAddress?.trim();
  return address ? `wallet_address=${encodeURIComponent(address)}` : "";
}

export const portfolioApi = {
  current: (walletAddress?: string, allowEnvFallback = false) => {
    const query = currentQuery(walletAddress, allowEnvFallback);
    return request<PortfolioSnapshotResponse>(`/portfolio/current${query ? `?${query}` : ""}`);
  },
  latestSnapshot: (walletAddress?: string) => {
    const query = walletQuery(walletAddress);
    return request<PortfolioSnapshotResponse>(`/portfolio/snapshots/latest${query ? `?${query}` : ""}`);
  },
  snapshots: (limit = 20, walletAddress?: string) => {
    const parts = [`limit=${limit}`];
    const wallet = walletQuery(walletAddress);
    if (wallet) {
      parts.push(wallet);
    }
    return request<PortfolioSnapshotHistoryResponse>(`/portfolio/snapshots?${parts.join("&")}`);
  },
};
