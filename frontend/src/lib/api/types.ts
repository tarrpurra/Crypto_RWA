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
  target_chain: string;
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
  invested_amount_usd?: string | null;
  total_deposits_usd?: string | null;
  total_withdrawals_usd?: string | null;
  pnl_usd?: string | null;
  pnl_percent?: string | null;
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

export interface RiskScoreBandRange {
  band: string;
  min_inclusive: number;
  max_exclusive: number | null;
  label: string;
}

export interface RiskScoreScale {
  min_score: number;
  max_score: number;
  higher_is_worse: boolean;
  bands: RiskScoreBandRange[];
}

export interface RiskAssessmentResponse extends StatusEnvelope {
  asset: string;
  recommended_action: string;
  risk_score: number;
  risk_score_normalized: number;
  risk_band: string;
  risk_score_scale: RiskScoreScale;
  confidence: number;
  confidence_normalized: number;
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
  token_in_symbol?: string | null;
  token_out_symbol?: string | null;
  swap_pair_label?: string | null;
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
  ai_debug: {
    prompt: string;
    raw_response: string | null;
    parsed_response: Record<string, unknown>;
    mode: string;
    used_fallback: boolean;
    ai_overrode_deterministic: boolean;
    fallback_reason: string | null;
  };
  metadata: Record<string, unknown>;
}

export interface InvestmentScopeRequest {
  deposit_asset_symbol: string;
  deposit_amount: number;
  risk_profile: string;
  allocation_mode?: string;
}

export interface StrategyRiskWeights {
  llm_sentiment: number;
  liquidity: number;
  oracle: number;
  depeg: number;
  execution: number;
}

export interface StrategyHardLimits {
  max_slippage_bps: number;
  max_gas_gwei: number;
  max_asset_exposure_pct: number;
  max_issuer_exposure_pct: number;
  min_stable_reserve_pct: number;
  max_llm_influence_pct: number;
  max_risk_score_for_fresh_allocation: number;
  force_human_approval_risk_score: number;
  pause_risk_score: number;
  global_circuit_breaker: boolean;
}

export interface StrategyPolicyConfig {
  strategy_version: string;
  objective: string;
  allowed_assets: string[];
  risk_weights: StrategyRiskWeights;
  hard_limits: StrategyHardLimits;
  market_check_interval_seconds: number;
  quote_refresh_interval_seconds: number;
  risk_recompute_interval_seconds: number;
  proposal_expiry_seconds: number;
  simulation_only_mode: boolean;
  human_approval_required: boolean;
  notes: string[];
}

export interface StrategyDraftRequest {
  user_address?: string | null;
  strategy_text: string;
  policy_json?: Record<string, unknown> | null;
  template_id?: number | null;
  actor?: string | null;
}

export interface StrategyValidationError {
  code: string;
  message: string;
  field?: string | null;
  severity: string;
}

export interface StrategyTemplateSummary {
  id: number;
  name: string;
  description: string;
  category: string;
  prompt_text: string;
  policy_json: StrategyPolicyConfig;
  is_system_template: boolean;
  created_at: string;
}

export interface StrategyDraftResponse extends StatusEnvelope {
  draft_id: number;
  user_address?: string | null;
  raw_prompt: string;
  extracted_policy_json?: StrategyPolicyConfig | null;
  validation_status: string;
  validation_errors: StrategyValidationError[];
  safety_score: number;
  created_at: string;
  requires_simulation: boolean;
  template?: StrategyTemplateSummary | null;
}

export interface StrategyValidationResponse extends StatusEnvelope {
  draft_id?: number | null;
  user_address?: string | null;
  raw_prompt: string;
  safety_score: number;
  validation_errors: StrategyValidationError[];
  extracted_policy_json?: StrategyPolicyConfig | null;
  requires_simulation: boolean;
  safe_suggestion?: string | null;
}

export interface StrategySimulationMetrics {
  expected_risk_score: number;
  expected_slippage_bps: number;
  expected_human_approval_required: boolean;
  expected_pause_required: boolean;
  recommendation: string;
  critical_findings: string[];
  protective_actions: string[];
  data_sources_used: string[];
}

export interface StrategySimulationResponse extends StatusEnvelope {
  draft_id?: number | null;
  user_address?: string | null;
  raw_prompt: string;
  safety_score: number;
  extracted_policy_json: StrategyPolicyConfig;
  simulation: StrategySimulationMetrics;
  market_context: Record<string, unknown>;
  risk_context: Record<string, unknown>;
  validation_errors: StrategyValidationError[];
  safe_suggestion?: string | null;
}

export interface StrategyVersionRecordResponse {
  id: number;
  version: string;
  user_address?: string | null;
  active_policy_json: StrategyPolicyConfig;
  raw_prompt_snapshot: string;
  simulation_result_json: Record<string, unknown>;
  activated_by?: string | null;
  activated_at?: string | null;
  status: string;
}

export interface StrategyAuditEventResponse {
  id: number;
  strategy_version_id?: number | null;
  event_type: string;
  actor: string;
  details_json: Record<string, unknown>;
  created_at: string;
}

export interface StrategySchedulerSettingsResponse {
  id: number;
  strategy_version_id?: number | null;
  market_check_interval_seconds: number;
  quote_refresh_interval_seconds: number;
  risk_recompute_interval_seconds: number;
  execution_window_seconds: number;
  updated_at: string;
}

export interface StrategyActiveResponse extends StatusEnvelope {
  active_version?: StrategyVersionRecordResponse | null;
  scheduler?: StrategySchedulerSettingsResponse | null;
  templates: StrategyTemplateSummary[];
  versions: StrategyVersionRecordResponse[];
  audit_events: StrategyAuditEventResponse[];
  last_validation?: StrategyValidationResponse | null;
  latest_simulation?: StrategySimulationResponse | null;
}

export interface StrategyVersionListResponse extends StatusEnvelope {
  versions: StrategyVersionRecordResponse[];
}

export interface StrategyTemplateListResponse extends StatusEnvelope {
  templates: StrategyTemplateSummary[];
}

export interface StrategyAuditListResponse extends StatusEnvelope {
  events: StrategyAuditEventResponse[];
}

export interface StrategyRevertRequest {
  version: string;
  user_address?: string | null;
  actor?: string | null;
}

export interface StrategySchedulerUpdateRequest {
  version?: string | null;
  market_check_interval_seconds: number;
  quote_refresh_interval_seconds: number;
  risk_recompute_interval_seconds: number;
  execution_window_seconds: number;
  user_address?: string | null;
  actor?: string | null;
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
  chain_id: number;
  native_mnt_enabled: boolean;
  sepolia_usdy_address: string | null;
  sepolia_meth_address: string | null;
  sepolia_meth_is_test_token: boolean;
  sepolia_meth_price_mode: string;
  sepolia_wmnt_address: string | null;
}

export interface TokenReadiness {
  address: string | null;
  code_exists: boolean;
  symbol: string | null;
  symbol_ok: boolean;
  decimals: number | null;
  deposit_supported: boolean | null;
  test_token: boolean | null;
}

export interface SystemReadinessResponse {
  chain_id: number;
  native_mnt_enabled: boolean;
  tokens: Record<string, TokenReadiness>;
  pricing: Record<string, string>;
  routes: Record<string, string>;
  execution: {
    mode: string;
    guarded_executor_enabled: boolean;
  };
}

export interface ReportField {
  label: string;
  value: string;
  detail?: string | null;
}

export interface ReportSection {
  key: string;
  title: string;
  status: string;
  summary: string;
  fields: ReportField[];
  notes: string[];
}

export interface InvestmentReportResponse extends StatusEnvelope {
  generated_at: string;
  report_id: string;
  download_name: string;
  wallet_address: string | null;
  ai_decision_maker_enabled: boolean;
  ai_mode: string;
  sections: ReportSection[];
  data_gaps: string[];
  markdown: string;
  metadata: Record<string, unknown>;
}

export interface CreateProposalPayload {
  wallet_address?: string
  deposit_asset_symbol: string
  deposit_amount: number
  risk_profile: string
  allocation_mode: string
  manual_target_weights?: Record<string, number>
}

export interface ExecutionPayload {
  tx_data?: string
  target_contract?: string
  calldata?: string
  gas_estimate?: string
  [key: string]: unknown
}

export interface TradeProposal {
  proposal_id: string
  plan_hash: string
  wallet_or_vault: string
  router: string
  selector: string
  token_in: string
  token_out: string
  token_in_symbol?: string | null
  token_out_symbol?: string | null
  recipient: string
  max_amount_in: string
  min_amount_out: string
  native_value: string
  deadline: number
  proposal_expiry: number
  nonce: number
  status_code: string
  risk_snapshot_id: string | null
  deposit_asset_symbol?: string | null
  deposit_amount?: number | null
  risk_profile?: string | null
  allocation_mode?: string | null
  recommended_action?: string | null
  confidence?: number | null
  reasoning_summary?: string | null
  approval_enabled?: boolean | null
  approval_blockers?: string[]
  created_at: string
  updated_at: string
}

export interface TradeProposalResponse extends StatusEnvelope {
  proposal: TradeProposal
}

export type ProposalListItem = TradeProposal;

export interface ProposalMutationResponse extends StatusEnvelope {
  proposal_id: string
  message: string
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
  tx_hash?: string | null
}

export interface AllocationTargetItem {
  asset_symbol: string
  percentage: number
  amount: number
  value_usd: number
  source: string
}

export interface RiskValidationCheck {
  code: string
  label: string
  passed: boolean
  blocking: boolean
  message: string
  observed_value?: string | null
  threshold_value?: string | null
  data_sources_used: string[]
}

export interface TransactionStep {
  step_index: number
  step_type: string
  description: string
  asset_symbol?: string | null
  amount?: string | null
  proposal_id?: string | null
  requires_user_action: boolean
}

export interface LinkedProposalSummary {
  proposal_id: string
  asset_symbol: string
  action: string
  token_in_symbol: string
  token_out_symbol: string
  amount: number
  status_code: string
}

export interface VaultBalanceItem {
  asset_symbol: string;
  asset_address: string | null;
  balance: string;
  value_usd: string | null;
  share: number;
}

export interface VaultBalanceResponse extends StatusEnvelope {
  vault_address: string;
  vault_label: string;
  user_address: string;
  total_value_usd: string | null;
  invested_amount_usd?: string | null;
  total_deposits_usd?: string | null;
  total_withdrawals_usd?: string | null;
  pnl_usd?: string | null;
  pnl_percent?: string | null;
  balances: VaultBalanceItem[];
  pending_deposits: number;
  pending_withdrawals: number;
  generated_at?: string;
  metadata?: Record<string, unknown>;
}

export interface DepositPrepareResponse extends StatusEnvelope {
  token: string;
  amount: string;
  allowance_required: boolean;
  current_allowance: string;
  spender: string;
}

export interface WithdrawPrepareResponse extends StatusEnvelope {
  token: string;
  amount: string;
  vault_balance: string;
  sufficient_balance: boolean;
}

export interface VaultFlowRecordRequest {
  user_address: string;
  asset_symbol: string;
  asset_amount: string;
  flow_type?: "deposit" | "withdrawal" | "adjustment";
  usd_value?: string | null;
  asset_address?: string | null;
  tx_hash?: string | null;
  occurred_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface VaultFlowRecordResponse extends StatusEnvelope {
  flow_id: string;
  vault_address: string;
  user_address: string;
  flow_type: string;
  asset_symbol: string;
  asset_amount: string;
  usd_value: string;
  tx_hash?: string | null;
  occurred_at: string;
}

export interface InvestmentPlanResponse extends StatusEnvelope {
  generated_at: string
  plan_id: string
  deposit_asset_symbol: string
  deposit_amount: number
  risk_profile: string
  allocation_mode: string
  ai_target_allocations: AllocationTargetItem[]
  selected_target_allocations: AllocationTargetItem[]
  warning_messages: string[]
  approval_enabled: boolean
  approval_blockers: string[]
  guard_checks: RiskValidationCheck[]
  estimated_gas_native?: string | null
  transaction_steps: TransactionStep[]
  linked_proposals: LinkedProposalSummary[]
  risk_assessment: RiskAssessmentResponse
  metadata: Record<string, unknown>
}

export interface DashboardFreshnessPayload {
  updated_at: string | null;
  age_seconds: number | null;
  status: string;
}

export interface DashboardCachePayload {
  hit: boolean;
  ttl_seconds: number;
}

export interface PriceHistoryPoint {
  time: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  avg: number | null;
  samples: number;
}

export interface PriceHistoryResponse extends StatusEnvelope {
  asset: string;
  range: string;
  bucket: string;
  points: PriceHistoryPoint[];
  demo: boolean;
}

export interface DashboardSummaryResponse {
  portfolio: PortfolioSnapshotResponse | null;
  risk: RiskAssessmentResponse | null;
  allocation: AllocationDecisionResponse | null;
  latest_decision: RecommendationResponse | null;
  pending_proposal: ProposalListItem | null;
  alerts: Record<string, unknown>[];
  freshness: DashboardFreshnessPayload;
  mode: string;
  cache: DashboardCachePayload;
}
