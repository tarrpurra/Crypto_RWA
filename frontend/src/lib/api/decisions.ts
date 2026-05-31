import { request } from "./client";
import type { RecommendationResponse } from "./types";

function walletQuery(walletAddress?: string): string {
  const address = walletAddress?.trim();
  return address ? `?wallet_address=${encodeURIComponent(address)}` : "";
}

export const decisionsApi = {
  getDecisions: (walletAddress?: string) =>
    request<RecommendationResponse>(`/decisions${walletQuery(walletAddress)}`),
};
