import { request } from "./client";
import type { ChainStatusResponse, HealthResponse, ServiceStatusResponse } from "./types";

export const systemApi = {
  health: () => request<HealthResponse>("/health"),
  status: () => request<ServiceStatusResponse>("/status"),
  chainStatus: () => request<ChainStatusResponse>("/chain/status"),
};

