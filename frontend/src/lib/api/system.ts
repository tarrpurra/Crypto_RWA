import { request } from "./client";
import type { ChainStatusResponse, HealthResponse, ServiceStatusResponse, SettingsResponse } from "./types";

export const systemApi = {
  health: () => request<HealthResponse>("/health"),
  status: () => request<ServiceStatusResponse>("/status"),
  chainStatus: () => request<ChainStatusResponse>("/chain/status"),
  settings: () => request<SettingsResponse>("/settings"),
  updateSettings: (body: { ai_decision_maker_enabled: boolean }) =>
    request<SettingsResponse>("/settings", "PUT", body),
};

