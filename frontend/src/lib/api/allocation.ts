import { request } from "./client";
import type { AllocationDecisionResponse, InvestmentScopeRequest } from "./types";

function recommendationQuery(walletAddress?: string, scope?: InvestmentScopeRequest | null): string {
  const params = new URLSearchParams();
  const address = walletAddress?.trim();
  if (address) {
    params.set("wallet_address", address);
  }
  if (scope?.deposit_asset_symbol) {
    params.set("deposit_asset_symbol", scope.deposit_asset_symbol);
  }
  if (typeof scope?.deposit_amount === "number" && Number.isFinite(scope.deposit_amount) && scope.deposit_amount > 0) {
    params.set("deposit_amount", String(scope.deposit_amount));
  }
  if (scope?.risk_profile) {
    params.set("risk_profile", scope.risk_profile);
  }
  if (scope?.allocation_mode) {
    params.set("allocation_mode", scope.allocation_mode);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const allocationApi = {
  recommendation: (walletAddress?: string, scope?: InvestmentScopeRequest | null) =>
    request<AllocationDecisionResponse>(`/allocation/recommendation${recommendationQuery(walletAddress, scope)}`),
  updateProfile: (profile_name: string) => request<{ status: string; message: string }>("/allocation/profile", "POST", { profile_name }),
};
