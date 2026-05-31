import { request } from "./client";
import type { RiskAssessmentHistoryResponse, RiskAssessmentResponse } from "./types";

function walletQuery(walletAddress?: string): string {
  const address = walletAddress?.trim();
  return address ? `?wallet_address=${encodeURIComponent(address)}` : "";
}

export const riskApi = {
  current: (walletAddress?: string) => request<RiskAssessmentResponse>(`/risk/current${walletQuery(walletAddress)}`),
  latestAssessment: () => request<RiskAssessmentResponse>("/risk/assessments/latest"),
  assessments: (limit = 20) => request<RiskAssessmentHistoryResponse>(`/risk/assessments?limit=${limit}`),
};
