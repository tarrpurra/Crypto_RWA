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

export interface FundingRateItem {
  symbol: string;
  funding_rate: string;
  next_funding_rate: string;
  mark_price?: string | null;
  index_price?: string | null;
}

export interface FundingRatesResponse {
  timestamp: number | null;
  rates: Record<string, FundingRateItem>;
  venues?: Record<string, Record<string, FundingRateItem>>;
}

export interface SpreadItem {
  symbol: string;
  long_exchange: string;
  short_exchange: string;
  long_funding_rate: string;
  short_funding_rate: string;
  spread_bps: number;
  timestamp: number;
  venue_rates: Record<string, string>;
}

export interface ArbSpreadListResponse {
  spreads: SpreadItem[];
  count: number;
}

export interface ArbBot {
  id: number;
  name: string;
  symbol: string;
  status: string;
  threshold: number;
  max_position_size: number;
  user_id: string;
  account: string;
  reference_exchange: string;
  hedge_exchange: string;
  last_trigger_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArbBotCreatePayload {
  name: string;
  symbol: string;
  threshold: number;
  max_position_size: number;
  reference_exchange?: string;
  hedge_exchange?: string;
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

export interface ArbBotListResponse {
  bots: ArbBot[];
  total: number;
}

export interface ExchangeCoinDetails {
  exchange: string;
  symbol: string;
  funding_rate: string | null;
  next_funding_rate: string | null;
  next_funding_time: number | null;
  mark_price: string | null;
  index_price: string | null;
  open_interest: string | null;
  volume_24h: string | null;
  turnover_24h: string | null;
  price_change_24h_pct: string | null;
  status: string;
  error: string | null;
  spot?: MarketTypeDetails | null;
  perp?: MarketTypeDetails | null;
}

export interface MarketTypeDetails {
  market_type: string;
  symbol: string;
  funding_rate: string | null;
  next_funding_rate: string | null;
  next_funding_time: number | null;
  mark_price: string | null;
  index_price: string | null;
  open_interest: string | null;
  volume_24h: string | null;
  turnover_24h: string | null;
  price_change_24h_pct: string | null;
  status: string;
  error: string | null;
}

export interface ArbCoinDetailsResponse {
  symbol: string;
  pacifica: ExchangeCoinDetails;
  hyperliquid?: ExchangeCoinDetails | null;
  lighter?: ExchangeCoinDetails | null;
  binance?: ExchangeCoinDetails | null;
  bybit?: ExchangeCoinDetails | null;
  spread_bps_vs_hyperliquid?: number | null;
  spread_bps_vs_lighter?: number | null;
  mark_price_spread_bps_vs_hyperliquid?: number | null;
  mark_price_spread_bps_vs_lighter?: number | null;
  timestamp: number;
}

export interface PartialTpLevel {
  price: number;
  close_percent: number;
  triggered?: boolean;
}

export interface TpslSession {
  id: number;
  symbol: string;
  side: "long" | "short";
  entry_price: number;
  position_size: number;
  current_position_size: number;
  status: string;
  exchange: string;
  account: string;
  take_profit_price: number | null;
  stop_loss_price: number | null;
  take_profit_order_id: number | null;
  stop_loss_order_id: number | null;
  trailing_stop_distance: number | null;
  trailing_stop_activated: boolean;
  partial_tp_levels: PartialTpLevel[] | null;
  closed_at: string | null;
  close_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface TpslEvent {
  id: number;
  session_id: number;
  event_type: string;
  price: number | null;
  details: string | null;
  created_at: string;
}

export interface TpslSessionCreatePayload {
  symbol: string;
  side: "long" | "short";
  entry_price: number;
  position_size: number;
  take_profit_price?: number;
  stop_loss_price?: number;
  trailing_stop_distance?: number;
  partial_tp_levels?: PartialTpLevel[];
}

export interface TpslSessionListResponse {
  sessions: TpslSession[];
  total: number;
}

export interface TpslEventListResponse {
  events: TpslEvent[];
  total: number;
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

export interface OrderbookLevel {
  price: number;
  amount: number;
  num_orders: number;
}

export interface OrderbookSnapshot {
  symbol: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
  nonce: number;
  mid_price: number | null;
}

export interface ImbalanceResult {
  symbol: string;
  bid_volume: number;
  ask_volume: number;
  ratio: number;
  delta: number;
  signal: "bullish" | "bearish" | "neutral";
  depth_levels: number;
  timestamp: number;
}

export interface WallEntry {
  side: "bid" | "ask";
  price: number;
  amount: number;
  avg_amount: number;
  multiplier: number;
}

export interface WallDetectionResult {
  symbol: string;
  bid_walls: WallEntry[];
  ask_walls: WallEntry[];
  timestamp: number;
}

export interface OrderbookAlert {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface OrderbookSignalResult {
  symbol: string;
  timestamp: number;
  execution_signal: "enter_long" | "watch_long" | "enter_short" | "watch_short" | "wait";
  signal_bias: "bullish" | "bearish" | "neutral";
  readiness: "actionable" | "caution" | "blocked";
  liquidity_regime: "tight" | "balanced" | "wide" | "thin" | "offline";
  confidence: number;
  spread_bps: number;
  best_bid: number | null;
  best_ask: number | null;
  mid_price: number | null;
  imbalance_ratio: number;
  depth_ratio: number;
  wall_bias: "support" | "resistance" | "mixed" | "none";
  bid_walls: number;
  ask_walls: number;
  supporting_factors: string[];
  alerts: OrderbookAlert[];
}

export interface OrderbookSymbolsResponse {
  symbols: string[];
  message?: string;
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

export interface ElfaStatusResponse {
  enabled: boolean;
  configured: boolean;
  reachable: boolean;
  status: string;
  api_url: string;
  timeout_seconds: number;
  fallback_mode: string;
  cache_ttl_seconds: number;
  stale_ttl_seconds: number;
  refresh_cooldown_seconds: number;
  api_key_status: string | null;
  message: string | null;
}

export interface ElfaContextResponse {
  symbol: string;
  enabled: boolean;
  configured: boolean;
  status: string;
  decision_source: string;
  reason: string | null;
  api_key_status: string | null;
  elfa_confidence: number | null;
  mindshare_score: number | null;
  engagement_score: number | null;
  mention_count: number | null;
  trending_rank: number | null;
  trending_change_percent: number | null;
  ai_summary: string | null;
  risk_flags: string[];
  cached_at: string | null;
  source_timestamp: string | null;
  is_stale: boolean;
}

export interface ElfaChatRequest {
  message: string;
  symbol?: string;
}

export interface ElfaChatResponse {
  success: boolean;
  message: string;
  response: string | null;
  error: string | null;
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
  arb: {
    getRates: () => request<FundingRatesResponse>("/arb/rates", "GET"),
    getSpreads: () => request<ArbSpreadListResponse>("/arb/spreads", "GET"),
    getCoinDetails: (symbol: string) =>
      request<ArbCoinDetailsResponse>(`/arb/details/${symbol}`, "GET"),
    getBots: () => request<ArbBotListResponse>("/arb/bots", "GET"),
    createBot: (payload: ArbBotCreatePayload) => request<ArbBot>("/arb/bots", "POST", payload),
    startBot: (botId: number) => request<ArbBot>(`/arb/bots/${botId}/start`, "POST"),
    stopBot: (botId: number) => request<ArbBot>(`/arb/bots/${botId}/stop`, "POST"),
    getElfaStatus: () => request<ElfaStatusResponse>("/arb/elfa/status", "GET"),
    getElfaContext: (symbol: string) => request<ElfaContextResponse>(`/arb/elfa/context/${symbol}`, "GET"),
    sendElfaChat: (payload: ElfaChatRequest) =>
      request<ElfaChatResponse>("/arb/elfa/chat", "POST", payload),
  },
  tpsl: {
    getSessions: (status?: string) =>
      request<TpslSessionListResponse>(`/tpsl/sessions${toQueryString({ status })}`, "GET"),
    getSessionEvents: (sessionId: number) =>
      request<TpslEventListResponse>(`/tpsl/sessions/${sessionId}/events`, "GET"),
    createSession: (payload: TpslSessionCreatePayload) =>
      request<TpslSession>("/tpsl/sessions", "POST", payload),
    cancelSession: (sessionId: number) =>
      request<TpslSession>(`/tpsl/sessions/${sessionId}/cancel`, "POST"),
    closeSession: (sessionId: number) =>
      request<TpslSession>(`/tpsl/sessions/${sessionId}/close`, "POST"),
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
  orderbook: {
    getSymbols: () => request<OrderbookSymbolsResponse>("/orderbook/symbols", "GET"),
    getSnapshot: (symbol: string) => request<OrderbookSnapshot>(`/orderbook/${symbol}`, "GET"),
    getImbalance: (symbol: string) =>
      request<ImbalanceResult>(`/orderbook/${symbol}/imbalance`, "GET"),
    getSignal: (symbol: string) =>
      request<OrderbookSignalResult>(`/orderbook/${symbol}/signal`, "GET"),
    getWalls: (symbol: string, threshold?: number) =>
      request<WallDetectionResult>(
        `/orderbook/${symbol}/walls${toQueryString({ threshold })}`,
        "GET",
      ),
  },
};
