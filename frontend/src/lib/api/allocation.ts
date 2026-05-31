import { request } from "./client";
import type { AllocationDecisionResponse } from "./types";

function walletQuery(walletAddress?: string): string {
  const address = walletAddress?.trim();
  return address ? `?wallet_address=${encodeURIComponent(address)}` : "";
}

export const allocationApi = {
  recommendation: (walletAddress?: string) =>
    request<AllocationDecisionResponse>(`/allocation/recommendation${walletQuery(walletAddress)}`),
  updateProfile: (profile_name: string) => request<{ status: string; message: string }>("/allocation/profile", "POST", { profile_name }),
};
