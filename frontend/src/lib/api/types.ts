export type ApiStatus = "ok" | "degraded" | "error" | string;

export interface StatusEnvelope {
  status: ApiStatus;
  status_code: string;
  status_label: string;
  status_reason: string;
}

export interface HealthResponse extends StatusEnvelope {
  environment: string;
  service: string;
  runtime_mode: string;
  target_chain: string;
}

export interface ServiceStatusResponse extends HealthResponse {
  chain_id: number;
  rpc_url: string;
  websocket_enabled: boolean;
  configured_contracts: Record<string, string | null>;
  database_url_configured: boolean;
  logging_enabled: boolean;
  log_level: string;
  subsystem_log_levels: Record<string, string>;
  freshness_thresholds: Record<string, unknown>;
  simulation_fallback_enabled: boolean;
  ai_decision_maker_enabled: boolean;
}

export interface ChainStatusResponse extends StatusEnvelope {
  chain_id: number | null;
  latest_block: number | null;
  rpc_url: string;
  websocket_enabled: boolean;
  rpc_error: string | null;
  pause_guardian?: Record<string, unknown> | null;
  trade_approval_manager?: Record<string, unknown> | null;
  executor_vault?: Record<string, unknown> | null;
}

export interface PortfolioPosition {
  asset_key: string;
  asset_symbol: string;
  asset_address: string | null;
  chain_id: number;
  balance: string | null;
  balance_source: string;
  price_usd: string | null;
  value_usd: string | null;
  weight: string | null;
  target_weight: string | null;
  weight_drift: string | null;
  drift_status: string;
  valuation_status: string;
  status_code: string;
  status_reason: string;
  data_sources_used: string[];
}

export interface PortfolioSnapshotResponse extends StatusEnvelope {
  snapshot_id: string;
  generated_at: string;
  portfolio_address: string | null;
  chain_id: number;
  base_currency: string;
  total_value_usd: string | null;
  positions: PortfolioPosition[];
  data_sources_used: string[];
  metadata: Record<string, unknown>;
}

export interface PortfolioSnapshotHistoryResponse extends StatusEnvelope {
  snapshots: PortfolioSnapshotResponse[];
}

export interface RiskBucket {
  bucket: string;
  score: number;
  weight: number;
  status: string;
  status_code: string;
  reason: string;
  hard_veto: boolean;
  data_sources_used: string[];
}

export interface RiskAssessmentResponse extends StatusEnvelope {
  asset: string;
  recommended_action: string;
  risk_score: number;
  risk_band: string;
  confidence: number;
  reasoning_summary: string;
  data_sources_used: string[];
  hard_veto_status: string;
  required_human_approval_status: string;
  generated_at: string;
  runtime_mode: string;
  target_chain: string;
  freshness_status: string;
  buckets: RiskBucket[];
  notes: string[];
  metadata: Record<string, unknown>;
}

export interface RiskAssessmentHistoryResponse extends StatusEnvelope {
  assessments: RiskAssessmentResponse[];
}

export interface RebalanceAction {
  asset_symbol: string;
  action: string;
  amount: number;
  route_id: string | null;
}

export interface AllocationDecision {
  decision_id: string;
  wallet_or_vault: string;
  profile_name: string;
  current_weights: Record<string, number>;
  target_weights: Record<string, number>;
  recommended_action: string;
  confidence: number;
  reasoning: string;
  risk_snapshot_id: string | null;
  status_code: string;
  created_at: string;
}

export interface AllocationDecisionResponse extends StatusEnvelope {
  generated_at: string;
  decision: AllocationDecision;
  rebalance_actions: RebalanceAction[];
}

export interface NormalizedPriceSnapshot {
  snapshot_id: string;
  asset_key: string;
  asset_symbol: string;
  asset_address: string | null;
  chain_id: number;
  price_usd: string | null;
  confidence_interval_usd: string | null;
  publish_timestamp: string | null;
  observed_timestamp: string;
  age_seconds: number | null;
  freshness_status: string;
  status_code: string;
  status_reason: string;
  derivation_method: string | null;
  data_sources_used: string[];
}

export interface LatestPricesResponse extends StatusEnvelope {
  generated_at: string;
  prices: NormalizedPriceSnapshot[];
}

export interface AssetIngestionStatus {
  asset_key: string;
  asset_symbol: string;
  configured: boolean;
  status: string;
  status_code: string;
  status_reason: string;
  required_sources: string[];
}

export interface MarketIngestionStatusResponse extends StatusEnvelope {
  generated_at: string;
  assets: AssetIngestionStatus[];
}

export interface RecommendationResponse {
  asset: string;
  recommended_action: string;
  risk_score: number;
  confidence: number;
  reasoning_summary: string;
  data_sources_used: string[];
  hard_veto_status: string;
  required_human_approval_status: string;
  status: string;
  status_code: string;
  status_label: string;
  status_reason: string;
  runtime_mode: string;
  target_chain: string;
  freshness_status: string;
  constraints_applied: string[];
  notes: string[];
  metadata: Record<string, unknown>;
}

export interface OndoUsdyOracleStatus {
  asset: string;
  source: string;
  chain_id?: number;
  chainId?: number;
  address: string;
  price: string | null;
  scale: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  ingested_at?: string;
  ingestedAt?: string;
  status: string;
}

export interface RouteDescriptor {
  protocol: string;
  route_type: string;
  token_in: string;
  token_out: string;
  route_path: string[];
  verification_state: string;
  route_id: string | null;
  router_address: string | null;
  pool_address: string | null;
}

export interface RoutesResponse extends StatusEnvelope {
  generated_at: string;
  routes: RouteDescriptor[];
}

export interface NormalizedQuoteSnapshot {
  snapshot_id: string;
  protocol: string;
  route_id: string;
  route_label: string;
  chain_id: number;
  token_in_symbol: string;
  token_out_symbol: string;
  amount_in: string;
  amount_out: string | null;
  quoted_price: string | null;
  estimated_slippage_bps: string | null;
  route_depth_usd: string | null;
  candidate_rank: number | null;
  sample_timestamp: string;
  freshness_status: string;
  status_code: string;
  status_reason: string;
  data_sources_used: string[];
}

export interface LatestQuotesResponse extends StatusEnvelope {
  generated_at: string;
  quotes: NormalizedQuoteSnapshot[];
}

export interface SettingsResponse {
  ai_decision_maker_enabled: boolean;
}

export interface CreateProposalPayload {
  token_in: string
  token_out: string
  amount_in: string
  route_id: string
}

export interface ExecutionPayload {
  tx_data?: string
  target_contract?: string
  calldata?: string
  gas_estimate?: string
  [key: string]: unknown
}

export interface TradeProposal {
  id: string
  token_in: string
  token_out: string
  amount_in: string
  amount_out: string | null
  status: string
  created_at: string
  updated_at?: string
  route_id?: string
  protocol?: string
  estimated_slippage_bps?: string | null
  risk_info?: Record<string, unknown>
  execution_payload?: ExecutionPayload
}

export interface TradeProposalResponse extends StatusEnvelope {
  proposal: TradeProposal
}

export interface ProposalsResponse extends StatusEnvelope {
  proposals: TradeProposal[]
}

export interface ProposalExecuteResponse extends StatusEnvelope {
  proposal_id: string
  router: string
  selector: string
  calldata: string
  calldata_hash: string
  token_in: string
  token_out: string
  recipient: string
  max_amount_in: string
  min_amount_out: string
  native_value: string
  deadline: number
  nonce: number
  chain_id: number
}

