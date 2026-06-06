import { request } from "./client";
import type { InvestmentScopeRequest, RiskAssessmentHistoryResponse, RiskAssessmentResponse } from "./types";

function riskQuery(walletAddress?: string, scope?: InvestmentScopeRequest | null, allowEnvFallback = false): string {
  const params = new URLSearchParams();
  const address = walletAddress?.trim();
  if (address) {
    params.set("wallet_address", address);
  }
  if (allowEnvFallback) {
    params.set("allow_env_fallback", "true");
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

export const riskApi = {
  current: (walletAddress?: string, scope?: InvestmentScopeRequest | null, allowEnvFallback = false) => request<RiskAssessmentResponse>(`/risk/current${riskQuery(walletAddress, scope, allowEnvFallback)}`),
  latestAssessment: () => request<RiskAssessmentResponse>("/risk/assessments/latest"),
  assessments: (limit = 20) => request<RiskAssessmentHistoryResponse>(`/risk/assessments?limit=${limit}`),
};
