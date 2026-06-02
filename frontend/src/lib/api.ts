export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
import { logger } from "@/lib/logger";

export interface ApiErrorEnvelope {
  error: {
    type: string;
    message: string;
    status_code: number;
    path: string;
    request_id: string;
    details?: unknown;
  };
}

export class ApiClientError extends Error {
  statusCode: number;
  requestId?: string;
  errorType?: string;
  details?: unknown;

  constructor(message: string, statusCode: number, envelope?: ApiErrorEnvelope) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.requestId = envelope?.error.request_id;
    this.errorType = envelope?.error.type;
    this.details = envelope?.error.details;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

function getAuthToken(): string | null {
  if (import.meta.env.VITE_API_TOKEN) {
    return String(import.meta.env.VITE_API_TOKEN);
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem("pacifica_auth_token");
}

async function request<T>(path: string, method: HttpMethod, body?: unknown): Promise<T> {
  const headers = new Headers();
  headers.set("Accept", "application/json");

  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  const url = `${API_BASE_URL}${path}`;
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  logger.debug("api.request", {
    method,
    path,
    hasBody: body !== undefined,
    hasAuthToken: Boolean(token),
  });

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: payload,
  });

  const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const durationMs = Math.round((endedAt - startedAt) * 100) / 100;

  if (!response.ok) {
    let envelope: ApiErrorEnvelope | undefined;
    try {
      envelope = (await response.json()) as ApiErrorEnvelope;
    } catch {
      envelope = undefined;
    }
    logger.error("api.response.error", {
      method,
      path,
      status: response.status,
      requestId: envelope?.error.request_id,
      message: envelope?.error.message ?? "Request failed",
      durationMs,
    });
    throw new ApiClientError(
      envelope?.error.message ?? `Request failed with status ${response.status}`,
      response.status,
      envelope,
    );
  }

  if (response.status === 204) {
    logger.debug("api.response.ok", {
      method,
      path,
      status: response.status,
      durationMs,
      empty: true,
    });
    return undefined as T;
  }
  const data = (await response.json()) as T;
  logger.debug("api.response.ok", {
    method,
    path,
    status: response.status,
    durationMs,
    url,
  });
  return data;
}

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      qs.set(key, String(value));
    }
  });
  const serialized = qs.toString();
  return serialized ? `?${serialized}` : "";
}

export interface ExchangeStatusItem {
  connected: boolean;
  status: string;
  wallet_address: string | null;
  agent_address: string | null;
  account_index: number | null;
  api_key_index: number | null;
}

export interface ExchangeStatusResponse {
  pacifica: ExchangeStatusItem;
  hyperliquid: ExchangeStatusItem;
  lighter: ExchangeStatusItem;
}

export interface LighterConnectPayload {
  wallet_address?: string;
  api_key_private: string;
  api_key_index: number;
  account_index: number;
}

export interface LighterConnectResponse {
  status: string;
  exchange: "lighter";
  message?: string;
  account_index: number;
  api_key_index: number;
}

export interface PacificaProvisionPayload {
  wallet_address: string;
}

export interface PacificaProvisionResponse {
  status: string;
  exchange: "pacifica";
  message?: string;
  agent_address: string;
}

export interface PacificaConfirmPayload {
  tx_hash: string;
}

export interface PacificaConfirmResponse {
  status: string;
  exchange: "pacifica";
  message?: string;
  agent_address: string;
}

export interface HyperliquidProvisionPayload {
  wallet_address: string;
}

export interface HyperliquidProvisionResponse {
  status: string;
  exchange: "hyperliquid";
  message?: string;
  api_wallet_address: string;
  approval_url: string;
}

export interface HyperliquidConfirmResponse {
  status: string;
  exchange: "hyperliquid";
  message?: string;
  api_wallet_address: string;
}

export interface ExchangeActionResponse {
  status: string;
  exchange: string;
  message?: string;
}

export interface Tier {
  name: string;
  display_name: string;
  simulated_capital: number;
  profit_target_pct: number;
  max_daily_drawdown_pct: number;
  max_total_drawdown_pct: number;
  duration_days: number;
  price_usd: number;
  min_trading_days: number;
}

export interface TierListResponse {
  tiers: Tier[];
}

export interface ChallengeSession {
  id: number;
  account: string;
  tier: string;
  status: string;
  simulated_capital: number;
  profit_target_pct: number;
  max_daily_drawdown_pct: number;
  max_total_drawdown_pct: number;
  duration_days: number;
  current_equity: number;
  peak_equity: number;
  current_pnl_pct: number;
  max_drawdown_pct: number;
  started_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChallengeSessionListResponse {
  sessions: ChallengeSession[];
  total: number;
}

export interface LeaderboardEntry {
  rank: number;
  account: string;
  tier: string;
  pnl_pct: number;
  status: string;
  started_at: string | null;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
}

export interface HealthResponse {
  status: "ok";
}

export interface WorkerHealthEntry {
  name: string;
  category: "managed" | "blocking";
  running: boolean | null;
  task_active?: boolean;
  task_cancelled?: boolean;
}

export interface WorkerHealthResponse {
  status: "ok" | "degraded" | "initializing";
  supervisor_running: boolean;
  worker_count: number;
  workers: WorkerHealthEntry[];
}

export interface AuthStatusResponse {
  module: "auth";
  status: string;
  auth_required: boolean;
}

export interface AuthMeResponse {
  user_id: string;
  role: string;
  auth_required: boolean;
}

export const api = {
  system: {
    health: () => request<HealthResponse>("/health", "GET"),
    workerHealth: () => request<WorkerHealthResponse>("/health/workers", "GET"),
  },
  auth: {
    status: () => request<AuthStatusResponse>("/auth/", "GET"),
    me: () => request<AuthMeResponse>("/auth/me", "GET"),
  },
  exchange: {
    getStatus: () => request<ExchangeStatusResponse>("/exchange/status", "GET"),
    provisionPacifica: (payload: PacificaProvisionPayload) =>
      request<PacificaProvisionResponse>(
        "/exchange/pacifica/provision-agent",
        "POST",
        payload,
      ),
    confirmPacifica: (payload: PacificaConfirmPayload) =>
      request<PacificaConfirmResponse>(
        "/exchange/pacifica/confirm-agent",
        "POST",
        payload,
      ),
    disconnectPacifica: () =>
      request<ExchangeActionResponse>("/exchange/pacifica", "DELETE"),
    connectLighter: (payload: LighterConnectPayload) =>
      request<LighterConnectResponse>("/exchange/lighter/connect", "POST", payload),
    disconnectLighter: () =>
      request<ExchangeActionResponse>("/exchange/lighter", "DELETE"),
    provisionHyperliquid: (payload: HyperliquidProvisionPayload) =>
      request<HyperliquidProvisionResponse>(
        "/exchange/hyperliquid/provision-agent",
        "POST",
        payload,
      ),
    confirmHyperliquid: () =>
      request<HyperliquidConfirmResponse>(
        "/exchange/hyperliquid/confirm-agent",
        "POST",
      ),
    disconnectHyperliquid: () =>
      request<ExchangeActionResponse>("/exchange/hyperliquid", "DELETE"),
  },
  challenges: {
    getTiers: () => request<TierListResponse>("/challenges/tiers", "GET"),
    getSessions: (status?: string) =>
      request<ChallengeSessionListResponse>(
        `/challenges/sessions${toQueryString({ status })}`,
        "GET",
      ),
    createSession: (tier: string) =>
      request<ChallengeSession>("/challenges/sessions", "POST", { tier }),
    getLeaderboard: (limit = 50) =>
      request<LeaderboardResponse>(
        `/challenges/leaderboard${toQueryString({ limit })}`,
        "GET",
      ),
  },
};
