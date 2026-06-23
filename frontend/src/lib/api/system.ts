import { request } from "./client";
import type { ChainStatusResponse, HealthResponse, ServiceStatusResponse, SettingsResponse, SystemReadinessResponse } from "./types";

export const systemApi = {
  health: () => request<HealthResponse>("/health"),
  status: () => request<ServiceStatusResponse>("/status"),
  readiness: () => request<SystemReadinessResponse>("/system/readiness"),
  chainStatus: () => request<ChainStatusResponse>("/chain/status"),
  settings: () => request<SettingsResponse>("/settings"),
  updateSettings: (body: { ai_decision_maker_enabled?: boolean; runtime_mode?: string }) =>
    request<SettingsResponse>("/settings", "PUT", body),
};
