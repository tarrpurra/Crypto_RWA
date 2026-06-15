import { request } from "./client";
import type {
  StrategyActiveResponse,
  StrategyAuditListResponse,
  StrategyDraftRequest,
  StrategyDraftResponse,
  StrategyRevertRequest,
  StrategySchedulerSettingsResponse,
  StrategySchedulerUpdateRequest,
  StrategySimulationResponse,
  StrategyTemplateListResponse,
  StrategyValidationResponse,
  StrategyVersionListResponse,
} from "./types";

function queryString(params: Record<string, string | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim()) {
      search.set(key, value.trim());
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const strategyApi = {
  templates: () => request<StrategyTemplateListResponse>("/api/strategy/templates"),
  draft: (body: StrategyDraftRequest) => request<StrategyDraftResponse>("/api/strategy/draft", "POST", body),
  validate: (body: StrategyDraftRequest) => request<StrategyValidationResponse>("/api/strategy/validate", "POST", body),
  simulate: (body: StrategyDraftRequest) => request<StrategySimulationResponse>("/api/strategy/simulate", "POST", body),
  activate: (body: StrategyDraftRequest) => request<StrategyActiveResponse>("/api/strategy/activate", "POST", body),
  active: (userAddress?: string | null) => request<StrategyActiveResponse>(`/api/strategy/active${queryString({ user_address: userAddress })}`),
  updateActive: (body: StrategyDraftRequest) => request<StrategyActiveResponse>("/api/strategy/active", "POST", body),
  versions: (userAddress?: string | null) => request<StrategyVersionListResponse>(`/api/strategy/versions${queryString({ user_address: userAddress })}`),
  revert: (body: StrategyRevertRequest) => request<StrategyActiveResponse>("/api/strategy/revert", "POST", body),
  scheduler: (body: StrategySchedulerUpdateRequest) => request<StrategySchedulerSettingsResponse>("/api/strategy/scheduler", "POST", body),
  audit: (version?: string | null) => request<StrategyAuditListResponse>(`/api/strategy/audit${queryString({ version })}`),
};

