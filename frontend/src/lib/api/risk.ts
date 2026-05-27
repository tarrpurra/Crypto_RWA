import { request } from "./client";
import type { RiskAssessmentHistoryResponse, RiskAssessmentResponse } from "./types";

export const riskApi = {
  current: () => request<RiskAssessmentResponse>("/risk/current"),
  latestAssessment: () => request<RiskAssessmentResponse>("/risk/assessments/latest"),
  assessments: (limit = 20) => request<RiskAssessmentHistoryResponse>(`/risk/assessments?limit=${limit}`),
};

