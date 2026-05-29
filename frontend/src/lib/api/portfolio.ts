import { request } from "./client";
import type { PortfolioSnapshotHistoryResponse, PortfolioSnapshotResponse } from "./types";

function walletQuery(walletAddress?: string): string {
  const address = walletAddress?.trim();
  return address ? `wallet_address=${encodeURIComponent(address)}` : "";
}

export const portfolioApi = {
  current: (walletAddress?: string) => {
    const query = walletQuery(walletAddress);
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
