import type {
  AllocationDecisionResponse,
  RiskAssessmentResponse,
  RecommendationResponse,
} from "@/lib/api/types";

export type ReasoningStepStatus =
  | "idle"
  | "running"
  | "complete"
  | "warning"
  | "blocked"
  | "failed";

export type AIAction =
  | "HOLD"
  | "PAUSE"
  | "REBALANCE"
  | "REDUCE_RISK"
  | "APPROVE_PROPOSAL"
  | "SIMULATION_ONLY";

export type ExecutionGate =
  | "allowed"
  | "needs_human_approval"
  | "blocked_by_guardrail"
  | "simulation_only"
  | "paused";

export interface ReasoningStage {
  id: string;
  title: string;
  status: ReasoningStepStatus;
  description: string;
  detail?: string;
  evidenceTags?: string[];
  startedAt?: string;
  completedAt?: string;
}

export interface GuardrailInfo {
  name: string;
  severity: "info" | "warning" | "hard_block";
  message: string;
  blocksExecution: boolean;
}

export interface DecisionInfo {
  recommendedAction: string;
  reasoningSummary: string;
  constraints: string[];
  nextStep: string;
}

export interface AgentEvent {
  timestamp: string;
  level: "info" | "warning" | "error";
  message: string;
}

export interface AIReasoningData {
  summary: {
    action: AIAction;
    riskBand: string;
    executionGate: ExecutionGate;
    confidence: number;
    mode: string;
    lastUpdated: string;
  };
  stages: ReasoningStage[];
  guardrails: GuardrailInfo[];
  decision: DecisionInfo;
  events: AgentEvent[];
}

export interface AIReasoningPanelProps {
  allocation: AllocationDecisionResponse | undefined;
  risk: RiskAssessmentResponse | undefined;
  decisions: RecommendationResponse | undefined;
  isLoading: boolean;
  hasConnectedWallet: boolean;
  aiDecisionMakerEnabled: boolean;
  onAiAccessChange: (enabled: boolean) => void;
  isAiAccessPending: boolean;
  swapRecommendations: SwapRecommendation[];
  aiReasoningData?: AIReasoningData;
}

export interface SwapRecommendation {
  action: string;
  amount: number;
  asset_symbol: string;
  token_in_symbol?: string;
  token_out_symbol?: string;
  swap_pair_label?: string;
}
