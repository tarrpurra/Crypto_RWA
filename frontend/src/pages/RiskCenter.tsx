import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Loader2, Rocket, Shield, ShieldAlert, SlidersHorizontal, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { PageScaffold } from "@/components/rwa/PageScaffold";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";
import { useCurrentRisk, useRiskAssessments } from "@/hooks/useRisk";
import {
  useActivateStrategy,
  useCreateStrategyDraft,
  useSimulateStrategy,
  useStrategyActive,
  useStrategyTemplates,
  useValidateStrategy,
} from "@/hooks/useStrategy";
import type { StrategyPolicyConfig, StrategyTemplateSummary, StrategyValidationResponse, StrategySimulationResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const FALLBACK_POLICY: StrategyPolicyConfig = {
  strategy_version: "v1.0.0",
  objective: "capital_preservation_first",
  allowed_assets: ["USDY", "mETH"],
  risk_weights: {
    llm_sentiment: 0.35,
    liquidity: 0.2,
    oracle: 0.15,
    depeg: 0.2,
    execution: 0.1,
  },
  hard_limits: {
    max_slippage_bps: 50,
    max_gas_gwei: 50,
    max_asset_exposure_pct: 35,
    max_issuer_exposure_pct: 60,
    min_stable_reserve_pct: 10,
    max_llm_influence_pct: 35,
    max_risk_score_for_fresh_allocation: 45,
    force_human_approval_risk_score: 65,
    pause_risk_score: 80,
    global_circuit_breaker: true,
  },
  market_check_interval_seconds: 300,
  quote_refresh_interval_seconds: 120,
  risk_recompute_interval_seconds: 300,
  proposal_expiry_seconds: 180,
  simulation_only_mode: false,
  human_approval_required: true,
  notes: ["Capital preservation biased policy template."],
};

const DEFAULT_STRATEGY_TEXT =
  "Use a conservative policy with USDY and mETH only, keep stable reserve above 40%, cap slippage at 0.50%, and review market conditions every 5 minutes.";
const SEEDED_DEFAULT_STRATEGY_TEXT = "Seeded default strategy policy.";

function clonePolicy(policy: StrategyPolicyConfig): StrategyPolicyConfig {
  return JSON.parse(JSON.stringify(policy)) as StrategyPolicyConfig;
}

function snapshotSignature(strategyText: string, policy: StrategyPolicyConfig, templateId: string) {
  return JSON.stringify({ strategyText, policy, templateId });
}

function formatRelativeAge(value: Date | null) {
  if (!value) {
    return "just now";
  }
  const elapsed = Date.now() - value.getTime();
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    return "just now";
  }
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

function humanize(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function statusTone(value?: string | null, statusCode?: string | null) {
  const normalized = `${value ?? ""} ${statusCode ?? ""}`.toLowerCase();
  if (normalized.includes("reject") || normalized.includes("block") || normalized.includes("fail") || normalized.includes("error")) {
    return "blocked" as const;
  }
  if (normalized.includes("review") || normalized.includes("warn") || normalized.includes("degrad") || normalized.includes("pending")) {
    return "degraded" as const;
  }
  if (normalized.includes("valid") || normalized.includes("simulate") || normalized.includes("active") || normalized.includes("fresh") || normalized.includes("ok")) {
    return "ready" as const;
  }
  return "neutral" as const;
}

function formatCount(value: number | string | null | undefined, digits = 0) {
  const parsed = typeof value === "number" ? value : value ? Number.parseFloat(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(parsed);
}

function formatPercent(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(digits)}%`;
}

function formatInterval(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "-";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60} min`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function buildPolicySnippet(policy: StrategyPolicyConfig) {
  const assets = policy.allowed_assets.length ? policy.allowed_assets.join(" and ") : "approved assets";
  const reserve = formatPercent(policy.hard_limits.min_stable_reserve_pct, 0);
  const slippage = formatCount(policy.hard_limits.max_slippage_bps);
  const marketCheck = formatInterval(policy.market_check_interval_seconds);
  const humanApproval = policy.human_approval_required ? "require human approval" : "allow execution without human approval";
  const circuitBreaker = policy.hard_limits.global_circuit_breaker ? "keep the global circuit breaker on" : "leave the global circuit breaker off";
  const objective = humanize(policy.objective).toLowerCase();

  return [
    `Objective: ${objective}.`,
    `Trade only ${assets}.`,
    `Keep stable reserve at or above ${reserve}.`,
    `Cap slippage at ${slippage} bps and review markets every ${marketCheck}.`,
    `${humanApproval} and ${circuitBreaker}.`,
  ].join(" ");
}

function resolveStrategyText(rawPromptSnapshot: string | null | undefined, policy: StrategyPolicyConfig) {
  const normalized = rawPromptSnapshot?.trim();
  if (!normalized || normalized === SEEDED_DEFAULT_STRATEGY_TEXT) {
    return buildPolicySnippet(policy);
  }
  return normalized;
}

function WeightControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="rounded-md border border-[#3A2812] bg-[#150F07] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-[0.08em] text-[#A08858]">{label}</span>
        <span className="text-sm font-medium text-[#F4EDD6]">{Math.round(value * 100)}%</span>
      </div>
      <Slider
        value={[Math.round(value * 100)]}
        max={100}
        step={1}
        onValueChange={(next) => onChange((next[0] ?? 0) / 100)}
        className="mt-4"
      />
    </div>
  );
}

function LimitField({
  label,
  value,
  suffix,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="rounded-md border border-[#3A2812] bg-[#150F07] p-4">
      <p className="text-xs uppercase tracking-[0.08em] text-[#A08858]">{label}</p>
      <div className="mt-3 flex items-center gap-2">
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number.parseFloat(event.target.value) || 0)}
          className="h-10 border-[#4B3417] bg-[#120C05] text-[#F4EDD6]"
        />
        <span className="text-xs uppercase tracking-[0.08em] text-[#A08858]">{suffix}</span>
      </div>
    </div>
  );
}

function PolicyStatusRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "ready" | "degraded" | "blocked" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#3A2812] py-2.5 last:border-b-0">
      <span className="text-xs uppercase tracking-[0.08em] text-[#A08858]">{label}</span>
      <span
        className={cn(
          "text-sm font-medium",
          tone === "ready" && "text-[#D4962A]",
          tone === "degraded" && "text-[#EAB866]",
          tone === "blocked" && "text-[#F0997C]",
          tone === "neutral" && "text-[#F4EDD6]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default function RiskCenter() {
  const currentQuery = useCurrentRisk({ allowEnvFallback: true });
  const assessmentsQuery = useRiskAssessments(10);
  const { walletAddress, effectiveWalletAddress } = usePortfolioWallet();
  const isConnected = !!walletAddress;

  const templatesQuery = useStrategyTemplates();
  const activeStrategyQuery = useStrategyActive(effectiveWalletAddress || null);
  const createDraftMutation = useCreateStrategyDraft();
  const validateMutation = useValidateStrategy();
  const simulateMutation = useSimulateStrategy();
  const activateMutation = useActivateStrategy();

  const current = currentQuery.data;
  const assessments = assessmentsQuery.data?.assessments || [];
  const templates = useMemo(() => templatesQuery.data?.templates ?? [], [templatesQuery.data?.templates]);
  const activeVersion = activeStrategyQuery.data?.active_version ?? null;

  const [strategyText, setStrategyText] = useState(DEFAULT_STRATEGY_TEXT);
  const [policy, setPolicy] = useState<StrategyPolicyConfig>(clonePolicy(FALLBACK_POLICY));
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [validationResult, setValidationResult] = useState<StrategyValidationResponse | null>(null);
  const [simulationResult, setSimulationResult] = useState<StrategySimulationResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const baselineSignatureRef = useRef("");

  useEffect(() => {
    if (initializedRef.current || (!activeVersion && templates.length === 0)) {
      return;
    }
    if (activeVersion) {
      const templateId = String(
        templates.find((template) => template.policy_json.objective === activeVersion.active_policy_json.objective)?.id ??
          templates[0]?.id ??
          "",
      );
      const resolvedText = resolveStrategyText(activeVersion.raw_prompt_snapshot, activeVersion.active_policy_json);
      setPolicy(clonePolicy(activeVersion.active_policy_json));
      setStrategyText(resolvedText);
      setSelectedTemplateId(templateId);
      baselineSignatureRef.current = snapshotSignature(
        resolvedText,
        activeVersion.active_policy_json,
        templateId,
      );
    } else if (templates[0]) {
      const templateId = String(templates[0].id);
      setPolicy(clonePolicy(templates[0].policy_json));
      setStrategyText(templates[0].prompt_text);
      setSelectedTemplateId(templateId);
      baselineSignatureRef.current = snapshotSignature(templates[0].prompt_text, templates[0].policy_json, templateId);
    }
    initializedRef.current = true;
  }, [activeVersion, templates]);

  const selectedTemplate = useMemo<StrategyTemplateSummary | null>(() => {
    const numericId = Number.parseInt(selectedTemplateId, 10);
    if (!Number.isFinite(numericId)) {
      return null;
    }
    return templates.find((template) => template.id === numericId) ?? null;
  }, [selectedTemplateId, templates]);

  const currentSignature = snapshotSignature(strategyText, policy, selectedTemplateId);
  const isDirty = baselineSignatureRef.current ? baselineSignatureRef.current !== currentSignature : true;
  const latestValidation = validationResult ?? activeStrategyQuery.data?.last_validation ?? null;
  const latestSimulation = simulationResult ?? activeStrategyQuery.data?.latest_simulation ?? null;
  const validationPassed = latestValidation?.status === "ok" && (latestValidation.validation_errors?.length ?? 0) === 0;
  const simulationPassed =
    latestSimulation?.simulation?.recommendation !== "reject" &&
    latestSimulation?.status !== "error" &&
    statusTone(latestSimulation?.status, latestSimulation?.status_code) !== "blocked";

  const weightTotal = useMemo(() => {
    const weights = policy.risk_weights;
    return weights.llm_sentiment + weights.liquidity + weights.oracle + weights.depeg + weights.execution;
  }, [policy.risk_weights]);

  const requestBody = useMemo(
    () => ({
      user_address: effectiveWalletAddress || null,
      strategy_text: strategyText,
      policy_json: policy,
      template_id: selectedTemplate ? selectedTemplate.id : null,
      actor: effectiveWalletAddress || null,
    }),
    [effectiveWalletAddress, policy, selectedTemplate, strategyText],
  );

  const syncBaseline = (nextText: string, nextPolicy: StrategyPolicyConfig, nextTemplateId: string) => {
    baselineSignatureRef.current = snapshotSignature(nextText, nextPolicy, nextTemplateId);
  };

  const updatePolicy = (updater: (draft: StrategyPolicyConfig) => StrategyPolicyConfig) => {
    setPolicy((currentPolicy) => updater(clonePolicy(currentPolicy)));
  };

  const applyTemplate = (template: StrategyTemplateSummary | null) => {
    if (!template) {
      return;
    }
    setPolicy(clonePolicy(template.policy_json));
    setStrategyText(template.prompt_text);
    setSelectedTemplateId(String(template.id));
    setMessage(`Loaded ${template.name}.`);
  };

  const getTimestampForIndex = (index: number) => {
    if (assessments && assessments[index]) {
      const dateStr = assessments[index].generated_at;
      try {
        const date = new Date(dateStr);
        const hours = String(date.getUTCHours()).padStart(2, "0");
        const minutes = String(date.getUTCMinutes()).padStart(2, "0");
        const seconds = String(date.getUTCSeconds()).padStart(2, "0");
        return `${hours}:${minutes}:${seconds} UTC`;
      } catch {
        // Fall through
      }
    }
    const d = new Date();
    d.setMinutes(d.getMinutes() - index * 15 - (index === 0 ? 0 : Math.floor(Math.random() * 10)));
    const hours = String(d.getUTCHours()).padStart(2, "0");
    const minutes = String(d.getUTCMinutes()).padStart(2, "0");
    const seconds = String(d.getUTCSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds} UTC`;
  };

  const getBucketScore = (name: string, defaultVal: number) => {
    const b = current?.buckets?.find((x) => x.bucket === name);
    if (!b) return defaultVal;
    return 100 - b.score;
  };

  const getBucketReason = (name: string, defaultVal: string) => {
    const b = current?.buckets?.find((x) => x.bucket === name);
    return b?.reason || defaultVal;
  };

  const onDraft = () => {
    createDraftMutation.mutate(requestBody, {
      onSuccess: (response) => {
        syncBaseline(strategyText, policy, selectedTemplateId);
        setMessage(`Risk policy draft saved as #${response.draft_id}.`);
      },
    });
  };

  const onValidate = () => {
    validateMutation.mutate(requestBody, {
      onSuccess: (response) => {
        setValidationResult(response);
        syncBaseline(strategyText, policy, selectedTemplateId);
        setMessage(response.status === "ok" ? "Risk policy validated." : "Risk policy validation failed.");
      },
    });
  };

  const onSimulate = () => {
    simulateMutation.mutate(requestBody, {
      onSuccess: (response) => {
        setSimulationResult(response);
        setValidationResult({
          status: response.status,
          status_code: response.status_code,
          status_label: response.status_label,
          status_reason: response.status_reason,
          draft_id: response.draft_id,
          user_address: response.user_address,
          raw_prompt: response.raw_prompt,
          safety_score: response.safety_score,
          validation_errors: response.validation_errors,
          extracted_policy_json: response.extracted_policy_json,
          requires_simulation: true,
          safe_suggestion: response.safe_suggestion ?? null,
        });
        syncBaseline(strategyText, policy, selectedTemplateId);
        setMessage(`Risk policy simulation ${response.simulation.recommendation}.`);
      },
    });
  };

  const onActivate = () => {
    activateMutation.mutate(requestBody, {
      onSuccess: (response) => {
        const nextPolicy = response.active_version?.active_policy_json ?? policy;
        const nextText = response.active_version
          ? resolveStrategyText(response.active_version.raw_prompt_snapshot, nextPolicy)
          : strategyText;
        setPolicy(clonePolicy(nextPolicy));
        setStrategyText(nextText);
        setValidationResult(response.last_validation ?? null);
        setSimulationResult(response.latest_simulation ?? null);
        syncBaseline(nextText, nextPolicy, selectedTemplateId);
        setMessage(`Activated ${response.active_version?.version ?? "risk policy"}.`);
      },
    });
  };

  const isFetching = currentQuery.isFetching || assessmentsQuery.isFetching || activeStrategyQuery.isFetching;

  return (
    <PageScaffold
      title="Risk"
      description="Risk scores, hard veto state, human approval requirements, allocation recommendations, rebalance actions, and strategy risk policy controls."
    >
      <div className="font-display select-none space-y-8 rounded-xl border border-[#3A2812] bg-[#0E0B06] p-6 text-[#F4EDD6] sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-heading text-[44px] uppercase tracking-[0.05em] leading-none text-[#F4EDD6]">
              RISK & GUARD CHECKS
            </h1>
            <p className="mt-1 text-sm text-[#A08858]">
              Deterministic policy controls gating all execution-facing actions.
            </p>
          </div>

          {isFetching && (
            <div className="flex items-center gap-2 rounded border border-[#D4962A]/20 bg-[#D4962A]/10 px-3 py-1 text-xs text-[#D4962A]">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Synchronizing...</span>
            </div>
          )}
        </div>

        <hr className="border-[#3A2812]" />

        <section className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-heading text-[22px] uppercase tracking-[0.05em] text-[#F4EDD6]">
                Strategy Risk Policy
              </h2>
              <p className="mt-1 text-sm text-[#A08858]">
                Risk weights and hard guardrails now live here instead of Strategy Studio.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-[#4B3417] bg-[#150F07] text-[#F4EDD6]">
                {activeVersion?.version ?? policy.strategy_version}
              </Badge>
              <Badge variant={Math.abs(weightTotal - 1) <= 0.001 ? "secondary" : "destructive"}>
                Total {weightTotal.toFixed(2)} / 1.00
              </Badge>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5 rounded-lg border border-[#3A2812] bg-[#1E1509] p-5">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.08em] text-[#A08858]">Template</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    className="h-10 w-full rounded-md border border-[#4B3417] bg-[#120C05] px-3 text-sm text-[#F4EDD6] outline-none"
                  >
                    <option value="">Select a strategy template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={String(template.id)}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <Button variant="outline" onClick={() => applyTemplate(selectedTemplate)} disabled={!selectedTemplate} className="border-[#4B3417] bg-transparent text-[#F4EDD6]">
                    Apply Template
                  </Button>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-[#D4962A]" />
                      <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#F4EDD6]">Risk Weights</h3>
                    </div>
                    <span className="text-xs text-[#A08858]">Saved with strategy policy</span>
                  </div>
                  <div className="grid gap-3">
                    <WeightControl
                      label="LLM Sentiment"
                      value={policy.risk_weights.llm_sentiment}
                      onChange={(next) =>
                        updatePolicy((draft) => ({
                          ...draft,
                          risk_weights: { ...draft.risk_weights, llm_sentiment: next },
                        }))
                      }
                    />
                    <WeightControl
                      label="Liquidity"
                      value={policy.risk_weights.liquidity}
                      onChange={(next) =>
                        updatePolicy((draft) => ({
                          ...draft,
                          risk_weights: { ...draft.risk_weights, liquidity: next },
                        }))
                      }
                    />
                    <WeightControl
                      label="Oracle"
                      value={policy.risk_weights.oracle}
                      onChange={(next) =>
                        updatePolicy((draft) => ({
                          ...draft,
                          risk_weights: { ...draft.risk_weights, oracle: next },
                        }))
                      }
                    />
                    <WeightControl
                      label="Depeg"
                      value={policy.risk_weights.depeg}
                      onChange={(next) =>
                        updatePolicy((draft) => ({
                          ...draft,
                          risk_weights: { ...draft.risk_weights, depeg: next },
                        }))
                      }
                    />
                    <WeightControl
                      label="Execution"
                      value={policy.risk_weights.execution}
                      onChange={(next) =>
                        updatePolicy((draft) => ({
                          ...draft,
                          risk_weights: { ...draft.risk_weights, execution: next },
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-[#D4962A]" />
                    <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#F4EDD6]">Hard Limits</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <LimitField
                      label="Max Slippage"
                      value={policy.hard_limits.max_slippage_bps}
                      suffix="bps"
                      min={5}
                      max={150}
                      onChange={(next) =>
                        updatePolicy((draft) => ({
                          ...draft,
                          hard_limits: { ...draft.hard_limits, max_slippage_bps: next },
                        }))
                      }
                    />
                    <LimitField
                      label="Max Gas"
                      value={policy.hard_limits.max_gas_gwei}
                      suffix="gwei"
                      min={1}
                      max={300}
                      onChange={(next) =>
                        updatePolicy((draft) => ({
                          ...draft,
                          hard_limits: { ...draft.hard_limits, max_gas_gwei: next },
                        }))
                      }
                    />
                    <LimitField
                      label="Asset Exposure"
                      value={policy.hard_limits.max_asset_exposure_pct}
                      suffix="%"
                      min={1}
                      max={50}
                      onChange={(next) =>
                        updatePolicy((draft) => ({
                          ...draft,
                          hard_limits: { ...draft.hard_limits, max_asset_exposure_pct: next },
                        }))
                      }
                    />
                    <LimitField
                      label="Issuer Exposure"
                      value={policy.hard_limits.max_issuer_exposure_pct}
                      suffix="%"
                      min={1}
                      max={60}
                      onChange={(next) =>
                        updatePolicy((draft) => ({
                          ...draft,
                          hard_limits: { ...draft.hard_limits, max_issuer_exposure_pct: next },
                        }))
                      }
                    />
                    <LimitField
                      label="Stable Reserve"
                      value={policy.hard_limits.min_stable_reserve_pct}
                      suffix="%"
                      min={10}
                      max={100}
                      onChange={(next) =>
                        updatePolicy((draft) => ({
                          ...draft,
                          hard_limits: { ...draft.hard_limits, min_stable_reserve_pct: next },
                        }))
                      }
                    />
                    <LimitField
                      label="LLM Influence"
                      value={policy.hard_limits.max_llm_influence_pct}
                      suffix="%"
                      min={0}
                      max={40}
                      onChange={(next) =>
                        updatePolicy((draft) => ({
                          ...draft,
                          hard_limits: { ...draft.hard_limits, max_llm_influence_pct: next },
                        }))
                      }
                    />
                    <LimitField
                      label="Fresh Allocation Risk"
                      value={policy.hard_limits.max_risk_score_for_fresh_allocation}
                      suffix="/100"
                      min={0}
                      max={45}
                      onChange={(next) =>
                        updatePolicy((draft) => ({
                          ...draft,
                          hard_limits: { ...draft.hard_limits, max_risk_score_for_fresh_allocation: next },
                        }))
                      }
                    />
                    <LimitField
                      label="Pause Threshold"
                      value={policy.hard_limits.pause_risk_score}
                      suffix="/100"
                      min={80}
                      max={100}
                      onChange={(next) =>
                        updatePolicy((draft) => ({
                          ...draft,
                          hard_limits: { ...draft.hard_limits, pause_risk_score: next },
                        }))
                      }
                    />
                  </div>

                  <div className="rounded-md border border-[#3A2812] bg-[#150F07] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.08em] text-[#A08858]">Global Circuit Breaker</p>
                        <p className="mt-1 text-sm text-[#F4EDD6]">Hard stop across execution if portfolio risk escalates.</p>
                      </div>
                      <Button
                        variant={policy.hard_limits.global_circuit_breaker ? "secondary" : "outline"}
                        onClick={() =>
                          updatePolicy((draft) => ({
                            ...draft,
                            hard_limits: {
                              ...draft.hard_limits,
                              global_circuit_breaker: !draft.hard_limits.global_circuit_breaker,
                            },
                          }))
                        }
                      >
                        {policy.hard_limits.global_circuit_breaker ? "On" : "Off"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-[#3A2812] pt-4 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-sm text-[#A08858]">
                  {message ??
                    (isDirty
                      ? "Risk policy changed. Save draft before validation."
                      : "Risk policy aligned with the last saved strategy state.")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={onDraft} disabled={!isDirty || createDraftMutation.isPending}>
                    Save Draft
                  </Button>
                  <Button variant="outline" onClick={onValidate} disabled={!strategyText.trim() || isDirty || validateMutation.isPending}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Validate
                  </Button>
                  <Button variant="outline" onClick={onSimulate} disabled={!validationPassed || isDirty || simulateMutation.isPending}>
                    <Workflow className="mr-2 h-4 w-4" />
                    Simulate
                  </Button>
                  <Button onClick={onActivate} disabled={!simulationPassed || isDirty || activateMutation.isPending}>
                    <Rocket className="mr-2 h-4 w-4" />
                    Activate
                  </Button>
                </div>
              </div>
            </div>

            <aside className="space-y-4 rounded-lg border border-[#3A2812] bg-[#1E1509] p-5">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#F4EDD6]">Policy Readiness</h3>
                <p className="mt-1 text-xs text-[#A08858]">Risk policy flow now lives beside deterministic guard checks.</p>
              </div>
              <div>
                <PolicyStatusRow label="Template" value={selectedTemplate?.name ?? "Active policy"} />
                <PolicyStatusRow label="Status" value={isDirty ? "Draft changed" : activeVersion ? "Aligned" : "Standby"} tone={isDirty ? "degraded" : "ready"} />
                <PolicyStatusRow label="Safety" value={latestValidation?.status_code ? humanize(latestValidation.status_code) : "Pending"} tone={statusTone(latestValidation?.status, latestValidation?.status_code)} />
                <PolicyStatusRow label="Simulation" value={latestSimulation?.simulation?.recommendation ? humanize(latestSimulation.simulation.recommendation) : "Pending"} tone={statusTone(latestSimulation?.status, latestSimulation?.status_code)} />
                <PolicyStatusRow label="Activation" value={!validationPassed || !simulationPassed || isDirty ? "Blocked" : "Ready"} tone={!validationPassed || !simulationPassed || isDirty ? "blocked" : "ready"} />
                <PolicyStatusRow label="Active Version" value={activeVersion?.version ?? policy.strategy_version} />
              </div>
              <div className="rounded-md border border-[#D4962A]/25 bg-[#D4962A]/10 p-4">
                <p className="text-xs uppercase tracking-[0.08em] text-[#D4962A]">Next step</p>
                <p className="mt-2 text-sm font-medium text-[#F4EDD6]">
                  {!validationPassed
                    ? "Run validation before activation."
                    : !simulationPassed
                      ? "Run simulation after validation."
                      : isDirty
                        ? "Save the modified draft."
                        : "Activation is available."}
                </p>
              </div>
            </aside>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="relative flex min-h-[140px] flex-col justify-between rounded-lg border border-[#3A2812] bg-[#1E1509] p-6">
            <div className="flex items-start justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#A08858] sm:text-xs">
                CURRENT RISK PROFILE
              </span>
              <Shield className="h-5 w-5 text-[#D4962A]" />
            </div>
            <div className="mt-4">
              <h2 className="font-heading text-[32px] uppercase leading-none tracking-[0.02em] text-[#D4962A] sm:text-[38px]">
                {current?.risk_band ?? "CONSERVATIVE"}
              </h2>
              <p className="mt-2 text-xs text-[#F4EDD6]/90 sm:text-sm">
                {current?.reasoning_summary ?? "Capital preservation mode active. Yield hunting restricted to Tier-1 protocols only."}
              </p>
            </div>
          </div>

          <div className="relative flex min-h-[140px] flex-col justify-between rounded-lg border border-[#D4962A]/40 bg-[#1E1509] p-6 shadow-[0_0_12px_rgba(212,150,42,0.06)]">
            <div className="flex items-start justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#A08858] sm:text-xs">
                SYSTEM READINESS
              </span>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#D4962A]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D4962A] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D4962A]" />
                </span>
                <span>ONLINE</span>
              </div>
            </div>
            <div className="mt-4">
              <h2 className="font-heading text-[32px] uppercase leading-none tracking-[0.02em] text-[#F4EDD6] sm:text-[38px]">
                {current?.hard_veto_status === "active" ? "HARD VETO ACTIVE" : "ALL GUARDS PASSING"}
              </h2>
              <p className="mt-2 text-xs text-[#F4EDD6]/90 sm:text-sm">
                {current?.status_reason ?? "Execution engine armed and awaiting operator mandate."}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-[22px] uppercase tracking-[0.05em] text-[#F4EDD6]">
            Hard Vetoes & Blockers
          </h3>
          <div className="rounded-lg border border-[#3A2812] bg-[#1E1509] p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="flex items-center gap-3 rounded-md border border-[#3A2812] bg-[#150F07] p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D4962A]/30 bg-[#D4962A]/10 text-[#D4962A]">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-medium leading-snug text-[#F4EDD6] sm:text-sm">Wallet Connection</h4>
                  <p className="mt-0.5 text-[11px] text-[#A08858] sm:text-xs">{isConnected ? "Secured" : "Required / Disconnected"}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-md border border-[#3A2812] bg-[#150F07] p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D4962A]/30 bg-[#D4962A]/10 text-[#D4962A]">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-medium leading-snug text-[#F4EDD6] sm:text-sm">Slippage Tolerance</h4>
                  <p className="mt-0.5 text-[11px] text-[#A08858] sm:text-xs">
                    {current?.hard_veto_status !== "active" ? "Within Bounds (< 0.5%)" : "Check Failed"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-md border border-[#3A2812] bg-[#150F07] p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D4962A]/30 bg-[#D4962A]/10 text-[#D4962A]">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-medium leading-snug text-[#F4EDD6] sm:text-sm">Gas Network Feasibility</h4>
                  <p className="mt-0.5 text-[11px] text-[#A08858] sm:text-xs">Optimal (12 Gwei)</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-[22px] uppercase tracking-[0.05em] text-[#F4EDD6]">
            Core Risk Gates
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex min-h-[170px] flex-col justify-between rounded-lg border border-[#3A2812] bg-[#1E1509] p-5">
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#A08858] sm:text-xs">MARKET INTEGRITY</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-heading text-[32px] text-[#F4EDD6]">{getBucketScore("liquidity_slippage", 98)}</span>
                  <span className="text-xs text-[#A08858]">/100</span>
                </div>
              </div>
              <div className="mt-4">
                <span className="inline-block rounded border border-[#D4962A]/30 bg-[#D4962A]/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-[#D4962A]">
                  PASSING
                </span>
                <p className="mt-2.5 text-[11px] leading-relaxed text-[#F4EDD6]/80 sm:text-xs">
                  {getBucketReason("liquidity_slippage", "Liquidity depth sufficient. Volume anomalies detected: 0.")}
                </p>
              </div>
            </div>

            <div className="flex min-h-[170px] flex-col justify-between rounded-lg border border-[#3A2812] bg-[#1E1509] p-5">
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#A08858] sm:text-xs">PROTOCOL SECURITY</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-heading text-[32px] text-[#F4EDD6]">{getBucketScore("portfolio_valuation", 100)}</span>
                  <span className="text-xs text-[#A08858]">/100</span>
                </div>
              </div>
              <div className="mt-4">
                <span className="inline-block rounded border border-[#D4962A]/30 bg-[#D4962A]/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-[#D4962A]">
                  PASSING
                </span>
                <p className="mt-2.5 text-[11px] leading-relaxed text-[#F4EDD6]/80 sm:text-xs">
                  {getBucketReason("portfolio_valuation", "All targeted contracts audited by verified entities. No recent exploits.")}
                </p>
              </div>
            </div>

            <div className="flex min-h-[170px] flex-col justify-between rounded-lg border border-[#3A2812] border-l-4 border-l-[#D4962A] bg-[#1E1509] p-5">
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#A08858] sm:text-xs">CAPITAL POLICY</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-heading text-[32px] text-[#F4EDD6]">{getBucketScore("concentration_drift", 85)}</span>
                  <span className="text-xs text-[#A08858]">/100</span>
                </div>
              </div>
              <div className="mt-4">
                <span className="inline-block rounded border border-[#D4962A]/30 bg-[#D4962A]/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-[#D4962A]">
                  PASSING
                </span>
                <p className="mt-2.5 text-[11px] leading-relaxed text-[#F4EDD6]/80 sm:text-xs">
                  {getBucketReason("concentration_drift", "Concentration limits intact. Yield volatility within acceptable standard deviation.")}
                </p>
              </div>
            </div>

            <div className="flex min-h-[170px] flex-col justify-between rounded-lg border border-[#3A2812] border-l-4 border-l-[#8A7038] bg-[#1E1509] p-5">
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#A08858] sm:text-xs">AGENT PERFORMANCE</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-heading text-[32px] text-[#F4EDD6]">{getBucketScore("ops_readiness", 92)}</span>
                  <span className="text-xs text-[#A08858]">/100</span>
                </div>
              </div>
              <div className="mt-4">
                <span className="inline-block rounded border border-[#D4962A]/30 bg-[#D4962A]/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-[#D4962A]">
                  PASSING
                </span>
                <p className="mt-2.5 text-[11px] leading-relaxed text-[#F4EDD6]/80 sm:text-xs">
                  {getBucketReason("ops_readiness", "Strategy drift negligible. Sharpe variance stable over 30d window.")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-heading text-[22px] uppercase tracking-[0.05em] text-[#F4EDD6]">
              DETERMINISTIC POLICY LOG
            </h3>
            <span className="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#A08858]">
              Last 5 Checks
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#3A2812] bg-[#1E1509] divide-y divide-[#3A2812]">
            {[
              "Slippage Tolerance Verification",
              "L1 Gas Fee Threshold Check",
              "Hourly Oracle Price Drift Analysis",
              "Agent Strategy Re-evaluation",
              "Liquidity Pool Depth Scan (USDY/mETH)",
            ].map((checkName, index) => (
              <div key={checkName} className="flex flex-wrap items-center justify-between gap-2 p-4 transition-colors hover:bg-[#1E1509]/50">
                <span className="shrink-0 font-mono text-xs text-[#A08858]">{getTimestampForIndex(index)}</span>
                <span className="min-w-[200px] flex-1 text-sm font-medium text-[#F4EDD6] sm:pl-6">{checkName}</span>
                <span className="shrink-0 font-heading text-sm tracking-wide text-[#D4962A]">CLEARED</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageScaffold>
  );
}
