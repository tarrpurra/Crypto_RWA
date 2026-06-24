import { request } from "./client";
import type { BackendLogsResponse, ChainStatusResponse, HealthResponse, ServiceStatusResponse, SettingsResponse, SystemReadinessResponse } from "./types";

export const systemApi = {
  health: () => request<HealthResponse>("/health"),
  status: () => request<ServiceStatusResponse>("/status"),
  readiness: () => request<SystemReadinessResponse>("/system/readiness"),
  chainStatus: () => request<ChainStatusResponse>("/chain/status"),
  settings: () => request<SettingsResponse>("/settings"),
  recentBackendLogs: (limit = 120) =>
    request<BackendLogsResponse>(`/system/logs/recent?limit=${limit}`),
  updateSettings: (body: { ai_decision_maker_enabled?: boolean; runtime_mode?: string }) =>
    request<SettingsResponse>("/settings", "PUT", body),
};
