import { request } from "./client";
import type { InvestmentReportResponse, InvestmentScopeRequest } from "./types";

function reportQuery(walletAddress?: string, scope?: InvestmentScopeRequest | null): string {
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

export const reportsApi = {
  latest: (walletAddress?: string, scope?: InvestmentScopeRequest | null) =>
    request<InvestmentReportResponse>(`/reports/latest${reportQuery(walletAddress, scope)}`),
};
