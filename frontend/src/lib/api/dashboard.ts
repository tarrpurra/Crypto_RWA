import { request } from "./client";
import type { DashboardSummaryResponse } from "./types";

function walletQuery(walletAddress?: string): string {
  const address = walletAddress?.trim();
  return address ? `wallet_address=${encodeURIComponent(address)}` : "";
}

export const dashboardApi = {
  summary: (walletAddress?: string) => {
    const query = walletQuery(walletAddress);
    return request<DashboardSummaryResponse>(`/dashboard/summary${query ? `?${query}` : ""}`);
  },
};
