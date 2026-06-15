import { useEffect, useMemo, useRef, useState } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  History,
  Rocket,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  Save,
  RotateCcw,
} from "lucide-react";

import { PageScaffold, StatusPill } from "@/components/rwa/PageScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAllocationRecommendation } from "@/hooks/useAllocation";
import { useLatestPrices, useLatestQuotes, useMarketIngestionStatus, useMarketRoutes } from "@/hooks/useMarket";
import { useCurrentPortfolio } from "@/hooks/usePortfolio";
import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";
import { useCurrentRisk } from "@/hooks/useRisk";
import {
  useActivateStrategy,
  useCreateStrategyDraft,
  useRevertStrategy,
  useSimulateStrategy,
  useStrategyActive,
  useStrategyAudit,
  useStrategyTemplates,
  useStrategyVersions,
  useUpdateStrategyScheduler,
  useValidateStrategy,
  useUpdateActiveStrategy,
} from "@/hooks/useStrategy";
import { useChainStatus, useServiceStatus, useSettings, useSystemHealth } from "@/hooks/useSystem";
import type {
  StrategyAuditEventResponse,
  StrategyPolicyConfig,
  StrategySimulationResponse,
  StrategyTemplateSummary,
  StrategyValidationResponse,
  StrategyVersionRecordResponse,
  StrategyValidationError,
} from "@/lib/api/types";
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

const DEFAULT_STRATEGY_TEXT = `/**
 * YieldMind Institutional Core Directives
 * Last updated: 2024-10-24 14:30 UTC
 */

Act as a conservative institutional yield optimizer.
Prioritize capital preservation over high-risk yield spikes.
Validate all RWA yields against Pyth oracles.

Veto any liquidity pool with <$5M depth.
Require multi-sig approval for transactions exceeding 500 ETH equivalent.

// Fallback procedure
If execution fails or slippage exceeds threshold, revert to stablecoin baseline strategy.`;
const SEEDED_DEFAULT_STRATEGY_TEXT = "Seeded default strategy policy.";

function highlightPrompt(text: string): string {
  if (!text) return "";
  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const keywords = ["Act as", "Prioritize", "Validate", "Veto", "Require", "If", "revert"];
  const lines = escaped.split("\n");
  const highlightedLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("//")) {
      return `<span class="text-[#A08858]/50">${line}</span>`;
    }
    
    let newLine = line;
    keywords.forEach(keyword => {
      const escapedKeyword = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'g');
      newLine = newLine.replace(regex, `<span class="text-[#D4962A] font-semibold">${keyword}</span>`);
    });

    newLine = newLine.replace(/(\b\d+(?:\.\d+)?%|\b\d+\s+ETH\b|\b\$\d+M\b)/gi, `<span class="text-[#D4962A]/90 font-medium">$1</span>`);
    return newLine;
  });

  return highlightedLines.join("\n");
}

type StatusTone = "ready" | "degraded" | "blocked" | "neutral";

function clonePolicy(policy: StrategyPolicyConfig): StrategyPolicyConfig {
  return JSON.parse(JSON.stringify(policy)) as StrategyPolicyConfig;
}

function parseNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function formatRelativeAge(value: Date | null) {
  if (!value) {
    return "Just now";
  }
  const elapsed = Date.now() - value.getTime();
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    return "Just now";
  }
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) {
    return "Just now";
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

function formatPercent(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(digits)}%`;
}

function formatCount(value: string | number | null | undefined, digits = 0) {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(parsed);
}

function formatAddress(value: string | null | undefined) {
  if (!value) {
    return "Operator";
  }
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatInterval(seconds: number | null | undefined) {
  const parsed = parseNumber(seconds);
  if (parsed === null) {
    return "-";
  }
  if (parsed < 60) {
    return `${parsed}s`;
  }
  if (parsed % 60 === 0) {
    return `${parsed / 60} min`;
  }
  const minutes = Math.floor(parsed / 60);
  const remaining = parsed % 60;
  return `${minutes}m ${remaining}s`;
}

function statusTone(value?: string | null, statusCode?: string | null): StatusTone {
  const normalized = `${value ?? ""} ${statusCode ?? ""}`.toLowerCase();
  if (normalized.includes("reject") || normalized.includes("block") || normalized.includes("fail") || normalized.includes("error")) {
    return "blocked";
  }
  if (normalized.includes("review") || normalized.includes("warn") || normalized.includes("degrad") || normalized.includes("pending")) {
    return "degraded";
  }
  if (normalized.includes("valid") || normalized.includes("simulate") || normalized.includes("active") || normalized.includes("fresh") || normalized.includes("ok")) {
    return "ready";
  }
  return "neutral";
}

function latestTimestamp(values: Array<string | null | undefined>) {
  let latest: Date | null = null;
  for (const value of values) {
    if (!value) {
      continue;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    if (!latest || parsed.getTime() > latest.getTime()) {
      latest = parsed;
    }
  }
  return latest;
}

function splitAssets(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPolicySnippet(policy: StrategyPolicyConfig) {
  const objectiveMap: Record<string, string> = {
    capital_preservation_first: "conservative institutional yield optimizer",
    balanced_yield: "balanced yield optimizer seeking optimal risk-adjusted returns",
    emergency_defensive: "defensive capital preservation vault driver",
    yield_guard: "risk-capped yield generator",
  };
  const objDesc = objectiveMap[policy.objective] ?? "institutional yield optimizer";
  const assets = policy.allowed_assets.length ? policy.allowed_assets.join(" and ") : "approved assets";
  const reserve = formatPercent(policy.hard_limits.min_stable_reserve_pct, 0);
  const slippage = (policy.hard_limits.max_slippage_bps / 100).toFixed(2) + "%";
  const humanApproval = policy.human_approval_required 
    ? `Require human approval if risk score exceeds ${policy.hard_limits.force_human_approval_risk_score}%.`
    : "Allow execution without manual intervention under safe conditions.";
  const circuitBreaker = policy.hard_limits.global_circuit_breaker 
    ? "If system risk levels cross safety thresholds, revert to stablecoin baseline strategy and trigger circuit breakers."
    : "Monitor risk levels and adjust allocations dynamically.";

  return [
    "/**",
    " * YieldMind Institutional Core Directives",
    ` * Strategy Version: ${policy.strategy_version}`,
    " */",
    "",
    `Act as a ${objDesc}.`,
    "Prioritize capital preservation over high-risk yield spikes.",
    `Validate all yields against Pyth oracles and only allocate to ${assets}.`,
    "",
    `Veto execution if stable reserve falls below ${reserve} or slippage exceeds ${slippage}.`,
    humanApproval,
    "",
    "// Fallback procedure",
    circuitBreaker
  ].join("\n");
}

function resolveStrategyText(rawPromptSnapshot: string | null | undefined, policy: StrategyPolicyConfig) {
  const normalized = rawPromptSnapshot?.trim();
  if (!normalized || normalized === SEEDED_DEFAULT_STRATEGY_TEXT || normalized === "Seeded default strategy policy.") {
    return buildPolicySnippet(policy);
  }
  return normalized;
}

function snapshotSignature(
  strategyText: string,
  policy: StrategyPolicyConfig,
  templateId: string,
) {
  return JSON.stringify({
    strategyText,
    policy,
    templateId,
  });
}

function HeroStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[#A08858]">
      <span className="font-semibold text-[#D4962A] font-mono">{value}</span>
      <span>{label}</span>
      <span className="text-[#3A2812] px-1.5">•</span>
    </div>
  );
}

function PremiumSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (val: number) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs tracking-wide font-sans">
        <span className="font-semibold uppercase tracking-[0.12em] text-[#A08858]">{label}</span>
        <span className="font-mono font-medium text-[#D4962A]">{value}{suffix}</span>
      </div>
      <SliderPrimitive.Root
        className="relative flex w-full touch-none select-none items-center cursor-pointer py-1"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => onChange(vals[0] ?? 0)}
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden bg-[#150F07] border border-[#3A2812]/50 rounded-none">
          <SliderPrimitive.Range className="absolute h-full bg-[#D4962A]" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-3.5 w-2 bg-[#D4962A] border border-[#0E0B06] rounded-none focus:outline-none focus:ring-1 focus:ring-[#D4962A] transition-transform hover:scale-y-110 active:scale-y-110" />
      </SliderPrimitive.Root>
    </div>
  );
}

function HistoryRow({
  version,
  onRevert,
  disabled,
}: {
  version: StrategyVersionRecordResponse;
  onRevert: (value: string) => void;
  disabled: boolean;
}) {
  const isActive = version.status === "active";
  return (
    <div className="flex flex-col gap-3 py-3 border-b border-[#3A2812]/30 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold font-mono text-[#F4EDD6]">{version.version}</span>
            <Badge variant={isActive ? "secondary" : "outline"} className="rounded-none text-[10px] uppercase font-mono px-1.5 py-0 border-[#3A2812] bg-[#1E1509] text-[#D4962A]">
              {isActive ? "Active" : "Previous"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-[#A08858]">
            {humanize(version.active_policy_json.objective)} • {formatRelativeAge(version.activated_at ? new Date(version.activated_at) : null)}
          </p>
        </div>
        {!isActive ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRevert(version.version)}
            disabled={disabled}
            className="rounded-none border-[#3A2812] h-7 text-[10px] uppercase tracking-wider font-semibold text-[#F4EDD6] hover:bg-[#1E1509] hover:text-[#D4962A]"
          >
            Revert
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AuditRow({
  event,
}: {
  event: StrategyAuditEventResponse;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-[#3A2812]/30 last:border-b-0">
      <div>
        <p className="text-xs font-semibold text-[#D4962A] uppercase tracking-wider">{humanize(event.event_type)}</p>
        <p className="mt-1 text-[11px] text-[#A08858]">
          {formatAddress(event.actor)} • {formatRelativeAge(new Date(event.created_at))}
        </p>
      </div>
      <span className="text-[10px] font-mono text-[#A08858]/60">{event.strategy_version_id ?? "system"}</span>
    </div>
  );
}

export default function StrategyStudio() {
  const wallet = usePortfolioWallet();
  const operatorAddress = wallet.effectiveWalletAddress ?? null;

  const healthQuery = useSystemHealth();
  const serviceQuery = useServiceStatus();
  const settingsQuery = useSettings();
  const chainQuery = useChainStatus();
  const portfolioQuery = useCurrentPortfolio();
  const riskQuery = useCurrentRisk();
  const allocationQuery = useAllocationRecommendation();
  const marketQuery = useMarketIngestionStatus();
  const pricesQuery = useLatestPrices();
  const quotesQuery = useLatestQuotes();
  const routesQuery = useMarketRoutes();

  const templatesQuery = useStrategyTemplates();
  const activeQuery = useStrategyActive(operatorAddress);
  const versionsQuery = useStrategyVersions(operatorAddress);
  const auditQuery = useStrategyAudit(activeQuery.data?.active_version?.version ?? null);

  const createDraftMutation = useCreateStrategyDraft();
  const validateMutation = useValidateStrategy();
  const simulateMutation = useSimulateStrategy();
  const activateMutation = useActivateStrategy();
  const updateActiveMutation = useUpdateActiveStrategy();
  const revertMutation = useRevertStrategy();
  const schedulerMutation = useUpdateStrategyScheduler();

  const activeData = activeQuery.data;
  const activeVersion = activeData?.active_version ?? null;
  const activeScheduler = activeData?.scheduler ?? null;
  const templates = useMemo(() => templatesQuery.data?.templates ?? [], [templatesQuery.data?.templates]);
  const versions = useMemo(() => versionsQuery.data?.versions ?? activeData?.versions ?? [], [versionsQuery.data?.versions, activeData?.versions]);
  const auditEvents = useMemo(() => auditQuery.data?.events ?? activeData?.audit_events ?? [], [auditQuery.data?.events, activeData?.audit_events]);

  const [strategyText, setStrategyText] = useState(DEFAULT_STRATEGY_TEXT);
  const [policy, setPolicy] = useState<StrategyPolicyConfig>(clonePolicy(FALLBACK_POLICY));
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [validationResult, setValidationResult] = useState<StrategyValidationResponse | null>(null);
  const [simulationResult, setSimulationResult] = useState<StrategySimulationResponse | null>(null);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("strategy");
  const [validationError, setValidationError] = useState<{
    status?: string;
    safety_score?: number;
    errors?: StrategyValidationError[];
    safe_suggestion?: string | null;
    message?: string;
  } | null>(null);

  // Local UI States
  const [assetsInputText, setAssetsInputText] = useState("");
  const [minProtocolTier, setMinProtocolTier] = useState("Tier 2");
  const [kellyAggressiveness, setKellyAggressiveness] = useState(0.45);
  const [riskEngineSensitivity, setRiskEngineSensitivity] = useState(65);

  const initializedRef = useRef(false);
  const baselineSignatureRef = useRef<string>("");

  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightPreRef = useRef<HTMLPreElement>(null);

  const handleScroll = () => {
    if (lineNumbersRef.current && textareaRef.current && highlightPreRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightPreRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightPreRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const dynamicLinesCount = useMemo(() => {
    const count = strategyText.split("\n").length;
    return Math.max(12, count);
  }, [strategyText]);

  const targetChain = healthQuery.data?.target_chain ?? serviceQuery.data?.target_chain ?? chainQuery.data?.target_chain ?? "Loading";
  const runtimeMode = healthQuery.data?.runtime_mode ?? serviceQuery.data?.runtime_mode ?? "Loading";
  const aiAccessEnabled = settingsQuery.data?.ai_decision_maker_enabled ?? serviceQuery.data?.ai_decision_maker_enabled ?? false;

  useEffect(() => {
    if (initializedRef.current || !activeData) {
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
      setAssetsInputText(activeVersion.active_policy_json.allowed_assets.join(", "));
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
      setAssetsInputText(templates[0].policy_json.allowed_assets.join(", "));
      baselineSignatureRef.current = snapshotSignature(templates[0].prompt_text, templates[0].policy_json, templateId);
    }
    initializedRef.current = true;
  }, [activeData, activeVersion, templates]);

  const selectedTemplate = useMemo<StrategyTemplateSummary | null>(() => {
    const numericId = Number.parseInt(selectedTemplateId, 10);
    if (!Number.isFinite(numericId)) {
      return null;
    }
    return templates.find((template) => template.id === numericId) ?? null;
  }, [selectedTemplateId, templates]);

  const requestBody = useMemo(
    () => ({
      user_address: operatorAddress,
      strategy_text: strategyText,
      policy_json: policy,
      template_id: selectedTemplate ? selectedTemplate.id : null,
      actor: operatorAddress,
    }),
    [operatorAddress, policy, selectedTemplate, strategyText],
  );

  const currentRiskScore = Math.max(0, Math.min(100, Math.round(parseNumber(riskQuery.data?.risk_score) ?? 0)));
  const latestValidation = validationResult ?? activeData?.last_validation ?? null;
  const latestSimulation = simulationResult ?? activeData?.latest_simulation ?? null;
  const validationTone = statusTone(latestValidation?.status, latestValidation?.status_code);
  const simulationTone = statusTone(latestSimulation?.status, latestSimulation?.status_code);

  const latestGeneratedAt = latestTimestamp([
    portfolioQuery.data?.generated_at,
    riskQuery.data?.generated_at,
    allocationQuery.data?.generated_at,
    marketQuery.data?.generated_at,
    pricesQuery.data?.generated_at,
    quotesQuery.data?.generated_at,
    activeVersion?.activated_at,
    activeScheduler?.updated_at,
  ]);

  const liveSignalCount = useMemo(() => {
    const signals = new Set<string>();
    for (const source of portfolioQuery.data?.data_sources_used ?? []) {
      signals.add(source);
    }
    for (const source of riskQuery.data?.data_sources_used ?? []) {
      signals.add(source);
    }
    for (const source of allocationQuery.data?.data_sources_used ?? []) {
      signals.add(source);
    }
    for (const asset of marketQuery.data?.assets ?? []) {
      signals.add(asset.asset_symbol);
    }
    signals.add(String(pricesQuery.data?.prices.length ?? 0));
    signals.add(String(quotesQuery.data?.quotes.length ?? 0));
    signals.add(String(routesQuery.data?.routes.length ?? 0));
    return signals.size;
  }, [
    allocationQuery.data?.data_sources_used,
    marketQuery.data?.assets,
    portfolioQuery.data?.data_sources_used,
    pricesQuery.data?.prices.length,
    quotesQuery.data?.quotes.length,
    riskQuery.data?.data_sources_used,
    routesQuery.data?.routes.length,
  ]);

  const riskWeightTotal = useMemo(() => {
    const weights = policy.risk_weights;
    return weights.llm_sentiment + weights.liquidity + weights.oracle + weights.depeg + weights.execution;
  }, [policy.risk_weights]);

  const baselineSignature = baselineSignatureRef.current;
  const currentSignature = snapshotSignature(strategyText, policy, selectedTemplateId);
  const isDirty = baselineSignature ? baselineSignature !== currentSignature : true;

  const validationPassed = latestValidation?.status === "ok" && (latestValidation.validation_errors?.length ?? 0) === 0;

  const syncBaseline = (nextText: string, nextPolicy: StrategyPolicyConfig, nextTemplateId: string) => {
    baselineSignatureRef.current = snapshotSignature(nextText, nextPolicy, nextTemplateId);
  };

  const applyTemplate = (template: StrategyTemplateSummary | null) => {
    if (!template) {
      return;
    }
    setPolicy(clonePolicy(template.policy_json));
    setStrategyText(template.prompt_text);
    setSelectedTemplateId(String(template.id));
    setAssetsInputText(template.policy_json.allowed_assets.join(", "));
    setValidationError(null);
    setLastActionMessage(`Applied ${template.name}.`);
  };

  const loadActiveIntoForm = () => {
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
      setAssetsInputText(activeVersion.active_policy_json.allowed_assets.join(", "));
      setLastActionMessage("Loaded active strategy into the editor.");
      return;
    }
    if (templates[0]) {
      setPolicy(clonePolicy(templates[0].policy_json));
      setStrategyText(templates[0].prompt_text);
      setSelectedTemplateId(String(templates[0].id));
      setAssetsInputText(templates[0].policy_json.allowed_assets.join(", "));
      setLastActionMessage(`Loaded ${templates[0].name}.`);
    }
  };

  const onDiscardChanges = () => {
    loadActiveIntoForm();
    setValidationError(null);
    setLastActionMessage("Discarded unsaved modifications.");
  };

  const onSimulate = () => {
    setValidationError(null);
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
        setLastActionMessage(`Impact simulation: ${response.simulation.recommendation}.`);
      },
      onError: (error: any) => {
        const details = error.details;
        if (details && typeof details === "object" && details.detail) {
          const det = details.detail;
          setValidationError({
            status: det.status || "rejected",
            safety_score: det.safety_score,
            errors: det.errors || [],
            safe_suggestion: det.safe_suggestion,
            message: det.message || "Strategy simulation failed validation checks.",
          });
        } else {
          setValidationError({
            message: error.message || "An unexpected error occurred during simulation.",
          });
        }
        setLastActionMessage("Simulation failed due to policy validation exceptions.");
      },
    });
  };

  const onSaveStrategy = () => {
    setValidationError(null);
    updateActiveMutation.mutate(requestBody, {
      onSuccess: (response) => {
        const nextPolicy = response.active_version?.active_policy_json ?? policy;
        const nextText = response.active_version
          ? resolveStrategyText(response.active_version.raw_prompt_snapshot, nextPolicy)
          : strategyText;
        setPolicy(clonePolicy(nextPolicy));
        setStrategyText(nextText);
        setAssetsInputText(nextPolicy.allowed_assets.join(", "));
        setValidationResult(response.last_validation ?? null);
        setSimulationResult(response.latest_simulation ?? null);
        syncBaseline(nextText, nextPolicy, selectedTemplateId);
        setLastActionMessage(`Saved and activated ${response.active_version?.version ?? "strategy"}.`);
      },
      onError: (error: any) => {
        const details = error.details;
        if (details && typeof details === "object" && details.detail) {
          const det = details.detail;
          setValidationError({
            status: det.status || "rejected",
            safety_score: det.safety_score,
            errors: det.errors || [],
            safe_suggestion: det.safe_suggestion,
            message: det.message || "Strategy activation failed validation checks.",
          });
        } else {
          setValidationError({
            message: error.message || "An unexpected error occurred while saving the strategy.",
          });
        }
        setLastActionMessage("Save failed due to policy validation exceptions.");
      },
    });
  };

  const onRevert = (version: string) => {
    revertMutation.mutate(
      {
        version,
        actor: operatorAddress,
      },
      {
        onSuccess: (response) => {
          if (response.active_version) {
            const nextPolicy = response.active_version.active_policy_json;
            const nextText = resolveStrategyText(response.active_version.raw_prompt_snapshot, nextPolicy);
            setPolicy(clonePolicy(nextPolicy));
            setStrategyText(nextText);
            setAssetsInputText(nextPolicy.allowed_assets.join(", "));
            syncBaseline(nextText, nextPolicy, selectedTemplateId);
          }
          setLastActionMessage(`Reverted to ${version}.`);
        },
      },
    );
  };

  const onUpdateScheduler = () => {
    schedulerMutation.mutate(
      {
        version: activeVersion?.version ?? null,
        market_check_interval_seconds: policy.market_check_interval_seconds,
        quote_refresh_interval_seconds: policy.quote_refresh_interval_seconds,
        risk_recompute_interval_seconds: policy.risk_recompute_interval_seconds,
        execution_window_seconds: policy.proposal_expiry_seconds,
        actor: operatorAddress,
      },
      {
        onSuccess: () => {
          setLastActionMessage("Scheduler settings updated.");
        },
      },
    );
  };

  const updatePolicy = (updater: (draft: StrategyPolicyConfig) => StrategyPolicyConfig) => {
    setPolicy((current) => updater(clonePolicy(current)));
    setValidationError(null);
  };

  const safetySummary = validationPassed
    ? `Passed · ${formatCount(latestValidation?.safety_score ?? 0)}/100`
    : latestValidation
      ? `${humanize(latestValidation.status_code)} · ${formatCount(latestValidation.safety_score)}/100`
      : "Pending";
  const safetyDetail = validationPassed
    ? `${formatCount(latestValidation?.validation_errors?.length ?? 0)} blocking errors.`
    : latestValidation?.status_reason ?? "Run validation/simulation before activation.";
  const simulationSummary = latestSimulation
    ? `${humanize(latestSimulation.simulation.recommendation)} · ${formatCount(latestSimulation.simulation.expected_risk_score)}/100`
    : "Pending";
  const simulationDetail = latestSimulation
    ? `Expected slippage ${formatCount(latestSimulation.simulation.expected_slippage_bps)} bps · Protective actions ${formatCount(
        latestSimulation.simulation.protective_actions.length,
      )}`
    : "Simulation is optional before activation.";

  return (
    <PageScaffold
      title="Strategic Studio"
      description="Bounded strategy policy controls, simulation, versioning, and audit history backed by the strategy policy service."
    >
      <div className="font-sans select-none space-y-8 rounded-xl border border-[#3A2812] bg-[#0E0B06] p-6 text-[#F4EDD6] sm:p-8 pb-28">
        {/* Header Block */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-heading text-[44px] uppercase tracking-[0.05em] leading-none text-[#F4EDD6]">
              STRATEGIC STUDIO
            </h1>
            <p className="mt-1 text-sm text-[#A08858]">
              Institutional control center for configuring AI reasoning, risk parameters, and execution protocols.
            </p>
            <div className="mt-3 flex flex-wrap gap-y-1">
              <HeroStat label="signals" value={formatCount(liveSignalCount)} />
              <HeroStat label="chain" value={targetChain} />
              <HeroStat label="runtime" value={humanize(runtimeMode)} />
              <HeroStat label="checked" value={formatRelativeAge(latestGeneratedAt)} />
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center">
            <div className="flex items-center gap-2 border border-[#D4962A]/40 bg-[#D4962A]/10 px-3 py-1.5 text-xs text-[#D4962A]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D4962A] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D4962A]" />
              </span>
              <span className="text-[10px] font-bold tracking-[0.1em] uppercase font-sans">
                MODIFICATION MODE ACTIVE
              </span>
            </div>
          </div>
        </div>

        <hr className="border-[#3A2812]" />

        {/* Tabs container */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="h-10 w-full justify-start gap-1 rounded-none border-b border-[#3A2812] bg-[#0E0B06] p-0 mb-6">
            <TabsTrigger
              value="strategy"
              className="rounded-none border-b-2 border-transparent px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#A08858] data-[state=active]:border-[#D4962A] data-[state=active]:bg-[#1E1509] data-[state=active]:text-[#D4962A] hover:text-[#F4EDD6]"
            >
              Strategy
            </TabsTrigger>
            <TabsTrigger
              value="weights"
              className="rounded-none border-b-2 border-transparent px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#A08858] data-[state=active]:border-[#D4962A] data-[state=active]:bg-[#1E1509] data-[state=active]:text-[#D4962A] hover:text-[#F4EDD6]"
            >
              Risk Weights
            </TabsTrigger>
            <TabsTrigger
              value="scheduler"
              className="rounded-none border-b-2 border-transparent px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#A08858] data-[state=active]:border-[#D4962A] data-[state=active]:bg-[#1E1509] data-[state=active]:text-[#D4962A] hover:text-[#F4EDD6]"
            >
              Scheduler
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-none border-b-2 border-transparent px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#A08858] data-[state=active]:border-[#D4962A] data-[state=active]:bg-[#1E1509] data-[state=active]:text-[#D4962A] hover:text-[#F4EDD6]"
            >
              History
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: STRATEGY */}
          <TabsContent value="strategy" className="mt-0 outline-none">
            <div className="grid gap-6 lg:grid-cols-12">
              {/* Left Column: Prompt Architect */}
              <div className="lg:col-span-7 space-y-6">
                <div className="border border-[#3A2812] bg-[#1E1509] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-[#D4962A]" />
                      <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#A08858]">
                        SYSTEM PROMPT ARCHITECT
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-none border-[#3A2812] text-xs font-mono bg-[#150F07] text-[#F4EDD6]">
                        {activeVersion?.version ?? policy.strategy_version}
                      </Badge>
                      <Badge className="rounded-none bg-[#D4962A]/15 text-[#D4962A] border border-[#D4962A]/30 text-[10px] font-bold font-sans uppercase px-2 py-0.5">
                        Core Engine
                      </Badge>
                    </div>
                  </div>

                  {/* Template Picker */}
                  <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-end">
                    <div className="flex-1 space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#A08858]">Select Base Template</span>
                      <Select
                        value={selectedTemplateId}
                        onValueChange={(val) => {
                          setSelectedTemplateId(val);
                          setValidationError(null);
                        }}
                      >
                        <SelectTrigger className="rounded-none border-[#3A2812] bg-[#150F07] text-[#F4EDD6] h-9 text-xs focus:ring-[#D4962A]">
                          <SelectValue placeholder="Select a strategy template" />
                        </SelectTrigger>
                        <SelectContent className="border-[#3A2812] bg-[#0E0B06] text-[#F4EDD6] rounded-none">
                          {templates.map((template) => (
                            <SelectItem key={template.id} value={String(template.id)} className="text-xs focus:bg-[#1E1509] focus:text-[#D4962A] rounded-none">
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="outline"
                      className="rounded-none border-[#3A2812] hover:bg-[#150F07] hover:text-[#D4962A] h-9 text-xs uppercase font-semibold text-[#F4EDD6]"
                      onClick={() => applyTemplate(selectedTemplate)}
                      disabled={!selectedTemplate}
                    >
                      Apply Template
                    </Button>
                  </div>

                  {/* Custom Code Editor */}
                  <div className="flex rounded-none border border-[#3A2812] bg-[#0E0B06] font-mono text-xs overflow-hidden h-72">
                    {/* Line Numbers */}
                    <div
                      ref={lineNumbersRef}
                      className="select-none border-r border-[#3A2812]/50 bg-[#150F07]/70 px-2.5 py-3 text-right text-[#A08858]/40 w-10 flex flex-col font-mono text-[11px] leading-[18px] overflow-hidden scrollbar-none"
                    >
                      {Array.from({ length: dynamicLinesCount }, (_, i) => (
                        <div key={i}>{i + 1}</div>
                      ))}
                    </div>
                    {/* Editor Container */}
                    <div className="relative flex-1 h-full overflow-hidden">
                      {/* Highlighted Pre */}
                      <pre
                        ref={highlightPreRef}
                        className="absolute inset-0 pointer-events-none px-3 py-3 font-mono text-[11px] leading-[18px] whitespace-pre-wrap break-all overflow-hidden bg-transparent text-[#F4EDD6] text-left"
                        dangerouslySetInnerHTML={{ __html: highlightPrompt(strategyText) }}
                      />
                      {/* Editor Textarea */}
                      <textarea
                        ref={textareaRef}
                        onScroll={handleScroll}
                        value={strategyText}
                        onChange={(event) => {
                          setStrategyText(event.target.value);
                          setValidationError(null);
                        }}
                        className="absolute inset-0 h-full w-full resize-none border-0 bg-transparent px-3 py-3 font-mono text-[11px] leading-[18px] text-transparent caret-[#F4EDD6] placeholder:text-[#A08858]/30 focus:outline-none focus:ring-0 focus-visible:ring-0 overflow-y-auto"
                        placeholder="Enter system prompt guidelines here..."
                      />
                    </div>
                  </div>

                  {/* Editor Footer */}
                  <div className="flex items-center justify-between border-t border-[#3A2812] bg-[#150F07] px-3.5 py-2 text-[11px] font-mono text-[#A08858]">
                    <div className="flex items-center gap-4">
                      <span>Characters: <span className="text-[#D4962A]">{strategyText.length}</span></span>
                      <span>Tokens: <span className="text-[#D4962A]">~{Math.ceil(strategyText.length / 4)}</span></span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadActiveIntoForm}
                      className="h-6 gap-1 px-1.5 text-[11px] text-[#D4962A] hover:bg-[#1E1509] hover:text-[#D4962A] rounded-none font-sans font-semibold uppercase tracking-wider"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Revert to previous
                    </Button>
                  </div>

                  <p className="mt-3 text-[11px] text-[#A08858] leading-relaxed font-sans">
                    The prompt acts as the policy boundary constraint for AI decisions. Keep objective statements concise and clear.
                  </p>
                </div>

                {validationError && (
                  <div className="border border-[#D4962A]/40 bg-[#1E1509] p-5 font-mono space-y-4 text-xs">
                    <div className="flex items-center justify-between border-b border-[#D4962A]/20 pb-2">
                      <div className="flex items-center gap-2 text-[#D4962A]">
                        <AlertTriangle className="h-4 w-4 animate-pulse" />
                        <span className="font-bold uppercase tracking-wider">// POLICY VALIDATION EXCEPTION</span>
                      </div>
                      {validationError.safety_score !== undefined && (
                        <span className="text-[10px] text-[#A08858]">
                          Safety Score: <span className="text-[#D4962A] font-semibold">{validationError.safety_score}/100</span>
                        </span>
                      )}
                    </div>

                    {validationError.message && (
                      <div className="text-[#F4EDD6] leading-relaxed">
                        {validationError.message}
                      </div>
                    )}

                    {validationError.errors && validationError.errors.length > 0 && (
                      <div className="space-y-2.5">
                        {validationError.errors.map((err, idx) => (
                          <div key={idx} className="border-l-2 border-[#D4962A] pl-3 py-1 bg-[#150F07]/50">
                            <div className="flex items-center gap-2 text-[#D4962A] font-semibold text-[11px]">
                              <span>{err.code}</span>
                              {err.field && (
                                <span className="text-[#A08858] font-normal text-[10px]">
                                  (Target: {err.field})
                                </span>
                              )}
                            </div>
                            <div className="text-[#F4EDD6]/90 mt-1 text-[11px] leading-relaxed">
                              {err.message}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {validationError.safe_suggestion && (
                      <div className="border-t border-[#3A2812]/50 pt-3 text-[11px]">
                        <span className="text-[#D4962A] uppercase font-bold tracking-wider block mb-1">
                          💡 Safe Suggestion:
                        </span>
                        <span className="text-[#A08858] leading-relaxed block font-sans">
                          {validationError.safe_suggestion}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Guardrails & Sources */}
              <div className="lg:col-span-5 space-y-6">
                {/* Hard Veto Guardrails */}
                <div className="border border-[#3A2812] bg-[#1E1509] p-5 space-y-5">
                  <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#A08858]">
                    HARD VETO GUARDRAILS
                  </h2>

                  {/* Slippage Slider */}
                  <PremiumSlider
                    label="Max Slippage Threshold"
                    value={Number((policy.hard_limits.max_slippage_bps / 100).toFixed(1))}
                    min={0.1}
                    max={5.0}
                    step={0.1}
                    suffix="%"
                    onChange={(val) =>
                      updatePolicy((draft) => ({
                        ...draft,
                        hard_limits: { ...draft.hard_limits, max_slippage_bps: Math.round(val * 100) },
                      }))
                    }
                  />

                  {/* Gas Slider */}
                  <PremiumSlider
                    label="Max Execution Gas Fee"
                    value={policy.hard_limits.max_gas_gwei}
                    min={10}
                    max={300}
                    step={5}
                    suffix=" GWEI"
                    onChange={(val) =>
                      updatePolicy((draft) => ({
                        ...draft,
                        hard_limits: { ...draft.hard_limits, max_gas_gwei: val },
                      }))
                    }
                  />

                  {/* Allowed Assets Tag Editor */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#A08858]">Allowed Assets</span>
                      <span className="text-[10px] text-[#A08858]/70 font-mono">Comma-separated</span>
                    </div>
                    <Input
                      value={assetsInputText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAssetsInputText(val);
                        const parsed = val.split(",").map(a => a.trim()).filter(Boolean);
                        updatePolicy((draft) => ({
                          ...draft,
                          allowed_assets: parsed,
                        }));
                      }}
                      placeholder="USDY, mETH, WMNT"
                      className="rounded-none border-[#3A2812] bg-[#150F07] text-[#F4EDD6] text-xs h-9 focus-visible:ring-[#D4962A]"
                    />
                    <div className="flex flex-wrap gap-1 mt-1">
                      {policy.allowed_assets.map((asset) => (
                        <Badge
                          key={asset}
                          variant="outline"
                          className="rounded-none border-[#3A2812] bg-[#150F07] text-[#F4EDD6] font-mono text-[10px] px-2 py-0.5"
                        >
                          {asset}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Protocol Tier Dropdown */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#A08858]">Min Protocol Tier</span>
                    <Select
                      value={minProtocolTier}
                      onValueChange={(val) => {
                        setMinProtocolTier(val);
                        setValidationError(null);
                      }}
                    >
                      <SelectTrigger className="rounded-none border-[#3A2812] bg-[#150F07] text-[#F4EDD6] h-9 text-xs focus:ring-[#D4962A]">
                        <SelectValue placeholder="Select Tier" />
                      </SelectTrigger>
                      <SelectContent className="border-[#3A2812] bg-[#0E0B06] text-[#F4EDD6] rounded-none">
                        <SelectItem value="Tier 1" className="text-xs rounded-none focus:bg-[#1E1509] focus:text-[#D4962A]">Tier 1 - High Liquidity / Low Risk</SelectItem>
                        <SelectItem value="Tier 2" className="text-xs rounded-none focus:bg-[#1E1509] focus:text-[#D4962A]">Tier 2 - Balanced Liquidity / Medium Risk</SelectItem>
                        <SelectItem value="Tier 3" className="text-xs rounded-none focus:bg-[#1E1509] focus:text-[#D4962A]">Tier 3 - Higher Yield / Higher Risk</SelectItem>
                        <SelectItem value="Tier 4" className="text-xs rounded-none focus:bg-[#1E1509] focus:text-[#D4962A]">Tier 4 - Experimental Feeds / Maximum Risk</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Global Circuit Breaker Toggle */}
                  <div className="flex items-center justify-between border-t border-[#3A2812]/50 pt-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#F4EDD6]">Global Circuit Breaker</p>
                      <p className="text-[10px] text-[#A08858] leading-normal mt-0.5 max-w-[280px]">
                        Forces immediate freeze of trade execution if system risk levels cross limits.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={policy.hard_limits.global_circuit_breaker}
                      onClick={() => updatePolicy((draft) => ({
                        ...draft,
                        hard_limits: {
                          ...draft.hard_limits,
                          global_circuit_breaker: !draft.hard_limits.global_circuit_breaker,
                        },
                      }))}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4962A] disabled:cursor-not-allowed disabled:opacity-50 border border-[#3A2812]",
                        policy.hard_limits.global_circuit_breaker ? "bg-[#D4962A]" : "bg-[#1C150D]"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none block h-3 w-3 rounded-none bg-[#0E0B06] shadow-lg ring-0 transition-transform",
                          policy.hard_limits.global_circuit_breaker ? "translate-x-5" : "translate-x-1"
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* Active Data Sources */}
                <div className="border border-[#3A2812] bg-[#1E1509] p-5">
                  <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#A08858]">
                    ACTIVE DATA SOURCES
                  </h2>
                  <div className="space-y-3 mt-4 font-sans">
                    <div className="flex items-center justify-between py-1 text-xs">
                      <span className="text-[#F4EDD6]">Pyth Network Oracles</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-[#D4962A] uppercase tracking-[0.1em]">Connected</span>
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-1 text-xs">
                      <span className="text-[#F4EDD6]">Governance Forum Scraper</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-[#D4962A] uppercase tracking-[0.1em]">Active</span>
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Simulation & Safety Feedback */}
            {(latestValidation || latestSimulation) && (
              <div className="grid gap-4 md:grid-cols-2 mt-6">
                {/* Safety Check Status Card */}
                <div className={cn(
                  "border p-4 rounded-none",
                  validationTone === "ready" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200" :
                  validationTone === "degraded" ? "border-amber-500/20 bg-amber-500/5 text-amber-200" :
                  validationTone === "blocked" ? "border-red-500/20 bg-red-500/5 text-red-200" :
                  "border-[#3A2812] bg-[#1E1509] text-[#A08858]"
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em]">Safety Gate Status</span>
                    <Badge className={cn(
                      "rounded-none text-[10px] uppercase tracking-wider px-2 py-0.5",
                      validationTone === "ready" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" :
                      validationTone === "degraded" ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" :
                      "bg-red-500/10 text-red-400 border border-red-500/30"
                    )}>
                      {safetySummary}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#A08858] leading-relaxed font-sans">{safetyDetail}</p>
                  {latestValidation?.validation_errors?.length ? (
                    <div className="mt-3 space-y-2 border-t border-[#3A2812]/50 pt-2.5 font-mono">
                      {latestValidation.validation_errors.slice(0, 3).map((error, idx) => (
                        <div key={idx} className="text-[11px] leading-relaxed">
                          <span className="font-semibold text-red-400">{error.code}:</span> {error.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Impact Simulation Status Card */}
                <div className={cn(
                  "border p-4 rounded-none",
                  simulationTone === "ready" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200" :
                  simulationTone === "degraded" ? "border-amber-500/20 bg-amber-500/5 text-amber-200" :
                  simulationTone === "blocked" ? "border-red-500/20 bg-red-500/5 text-red-200" :
                  "border-[#3A2812] bg-[#1E1509] text-[#A08858]"
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em]">Impact Simulation</span>
                    <Badge className={cn(
                      "rounded-none text-[10px] uppercase tracking-wider px-2 py-0.5",
                      simulationTone === "ready" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" :
                      simulationTone === "degraded" ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" :
                      "bg-red-500/10 text-red-400 border border-red-500/30"
                    )}>
                      {simulationSummary}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#A08858] leading-relaxed font-sans">{simulationDetail}</p>
                  {latestSimulation?.simulation?.critical_findings?.length ? (
                    <div className="mt-3 space-y-1.5 border-t border-[#3A2812]/50 pt-2.5 font-mono">
                      {latestSimulation.simulation.critical_findings.map((finding, idx) => (
                        <div key={idx} className="text-[11px] text-amber-400/90 leading-relaxed">
                          • {finding}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </TabsContent>

          {/* TAB 2: RISK WEIGHTS */}
          <TabsContent value="weights" className="mt-0 outline-none">
            <div className="border border-[#3A2812] bg-[#1E1509] p-5 space-y-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-[#3A2812]/50 pb-4">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#A08858]">
                    STRATEGIC RISK WEIGHTS
                  </h2>
                  <p className="text-xs text-[#A08858] mt-1 max-w-xl font-sans">
                    Configure the weights allocated to the risk assessment inputs. All core risk factors must equal 100% total.
                  </p>
                </div>
                <div className="self-start md:self-center font-mono">
                  {Math.abs(riskWeightTotal - 1.0) > 0.001 ? (
                    <div className="flex items-center gap-2 border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400 font-sans">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Total: {(riskWeightTotal * 100).toFixed(0)}%</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 font-sans">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Total: 100%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sliders Grid */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Core Weights */}
                <PremiumSlider
                  label="LLM Sentiment Influence"
                  value={Math.round(policy.risk_weights.llm_sentiment * 100)}
                  suffix="%"
                  onChange={(val) =>
                    updatePolicy((draft) => ({
                      ...draft,
                      risk_weights: { ...draft.risk_weights, llm_sentiment: val / 100 },
                    }))
                  }
                />

                <PremiumSlider
                  label="Liquidity Weight"
                  value={Math.round(policy.risk_weights.liquidity * 100)}
                  suffix="%"
                  onChange={(val) =>
                    updatePolicy((draft) => ({
                      ...draft,
                      risk_weights: { ...draft.risk_weights, liquidity: val / 100 },
                    }))
                  }
                />

                <PremiumSlider
                  label="Oracle Stability Weight"
                  value={Math.round(policy.risk_weights.oracle * 100)}
                  suffix="%"
                  onChange={(val) =>
                    updatePolicy((draft) => ({
                      ...draft,
                      risk_weights: { ...draft.risk_weights, oracle: val / 100 },
                    }))
                  }
                />

                <PremiumSlider
                  label="Depeg Risk Weight"
                  value={Math.round(policy.risk_weights.depeg * 100)}
                  suffix="%"
                  onChange={(val) =>
                    updatePolicy((draft) => ({
                      ...draft,
                      risk_weights: { ...draft.risk_weights, depeg: val / 100 },
                    }))
                  }
                />

                <PremiumSlider
                  label="Execution Route Weight"
                  value={Math.round(policy.risk_weights.execution * 100)}
                  suffix="%"
                  onChange={(val) =>
                    updatePolicy((draft) => ({
                      ...draft,
                      risk_weights: { ...draft.risk_weights, execution: val / 100 },
                    }))
                  }
                />

                {/* Simulated Sliders (UI Only to match mockup) */}
                <PremiumSlider
                  label="Kelly Aggressiveness"
                  value={kellyAggressiveness}
                  min={0.0}
                  max={1.0}
                  step={0.05}
                  suffix=""
                  onChange={(val) => {
                    setKellyAggressiveness(val);
                    setValidationError(null);
                  }}
                />

                <PremiumSlider
                  label="Risk Engine Sensitivity"
                  value={riskEngineSensitivity}
                  suffix="%"
                  onChange={(val) => {
                    setRiskEngineSensitivity(val);
                    setValidationError(null);
                  }}
                />
              </div>

              {/* Status Message */}
              <div className="mt-4 font-sans">
                {Math.abs(riskWeightTotal - 1.0) > 0.001 ? (
                  <div className="flex items-center gap-2 border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Attention: Core risk weights total is {(riskWeightTotal * 100).toFixed(0)}%. They must normalize to 100% before saving.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Weights are fully normalized (100%).</span>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* TAB 3: SCHEDULER */}
          <TabsContent value="scheduler" className="mt-0 outline-none">
            <div className="border border-[#3A2812] bg-[#1E1509] p-5 space-y-6">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#A08858]">
                  SCHEDULER SETTINGS
                </h2>
                <p className="text-xs text-[#A08858] mt-1 font-sans">
                  Configure the timing parameters for pricing updates, risk check triggers, and execution parameters.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <PremiumSlider
                  label="Market Check Cadence"
                  value={policy.market_check_interval_seconds}
                  min={60}
                  max={3600}
                  step={15}
                  suffix=" seconds"
                  onChange={(val) =>
                    updatePolicy((draft) => ({
                      ...draft,
                      market_check_interval_seconds: val,
                    }))
                  }
                />

                <PremiumSlider
                  label="Quote Refresh Cadence"
                  value={policy.quote_refresh_interval_seconds}
                  min={30}
                  max={1800}
                  step={15}
                  suffix=" seconds"
                  onChange={(val) =>
                    updatePolicy((draft) => ({
                      ...draft,
                      quote_refresh_interval_seconds: val,
                    }))
                  }
                />

                <PremiumSlider
                  label="Risk Recompute Cadence"
                  value={policy.risk_recompute_interval_seconds}
                  min={60}
                  max={3600}
                  step={15}
                  suffix=" seconds"
                  onChange={(val) =>
                    updatePolicy((draft) => ({
                      ...draft,
                      risk_recompute_interval_seconds: val,
                    }))
                  }
                />

                <PremiumSlider
                  label="Proposal Expiry Window"
                  value={policy.proposal_expiry_seconds}
                  min={60}
                  max={3600}
                  step={15}
                  suffix=" seconds"
                  onChange={(val) =>
                    updatePolicy((draft) => ({
                      ...draft,
                      proposal_expiry_seconds: val,
                    }))
                  }
                />
              </div>

              <div className="flex justify-end border-t border-[#3A2812]/50 pt-4">
                <Button
                  onClick={onUpdateScheduler}
                  disabled={schedulerMutation.isPending}
                  className="rounded-none bg-[#D4962A] hover:bg-[#b0781e] text-[#0E0B06] text-xs uppercase tracking-wider font-bold h-9"
                >
                  {schedulerMutation.isPending ? "Saving Schedule..." : "Save Schedule Settings"}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* TAB 4: HISTORY */}
          <TabsContent value="history" className="mt-0 outline-none space-y-6">
            {/* Version History */}
            <div className="border border-[#3A2812] bg-[#1E1509] p-5">
              <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#A08858] mb-4">
                VERSION HISTORY
              </h2>
              <div className="divide-y divide-[#3A2812]/40 font-sans">
                {versions.length ? (
                  versions.slice(0, 10).map((version) => (
                    <HistoryRow
                      key={version.id}
                      version={version}
                      onRevert={onRevert}
                      disabled={revertMutation.isPending}
                    />
                  ))
                ) : (
                  <p className="py-4 text-xs text-[#A08858]">No strategy versions available.</p>
                )}
              </div>
            </div>

            {/* Audit Trail */}
            <div className="border border-[#3A2812] bg-[#1E1509] p-5">
              <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#A08858] mb-4">
                AUDIT LOGS
              </h2>
              <div className="divide-y divide-[#3A2812]/40 font-sans">
                {auditEvents.length ? (
                  auditEvents.slice(0, 12).map((event) => <AuditRow key={event.id} event={event} />)
                ) : (
                  <p className="py-4 text-xs text-[#A08858]">No audit events logged.</p>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky Bottom Action Footer */}
      <section className="fixed inset-x-0 bottom-0 z-30 border-t border-[#3A2812] bg-[#0E0B06]/95 px-6 shadow-2xl backdrop-blur-md">
        <div className="mx-auto flex min-h-16 w-full max-w-[1440px] flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-xs font-mono">
            {isDirty ? (
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" />
                <span className="font-sans">Unsaved modifications present. Discard changes or save to update active strategy.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[#A08858]">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="font-sans">Active strategy aligned with persistent configuration state.</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={onDiscardChanges}
              disabled={!isDirty}
              className="rounded-none border-[#3A2812] text-[#F4EDD6] hover:bg-[#1E1509] hover:text-[#D4962A] h-9 text-xs uppercase tracking-wider font-semibold"
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Discard Changes
            </Button>

            <Button
              variant="outline"
              onClick={onSimulate}
              disabled={!strategyText.trim() || simulateMutation.isPending}
              className="rounded-none border-[#3A2812] text-[#F4EDD6] hover:bg-[#1E1509] hover:text-[#D4962A] h-9 text-xs uppercase tracking-wider font-semibold"
            >
              {simulateMutation.isPending ? "Simulating..." : "Simulate Changes"}
            </Button>

            <Button
              onClick={onSaveStrategy}
              disabled={!strategyText.trim() || updateActiveMutation.isPending || Math.abs(riskWeightTotal - 1.0) > 0.001}
              className="rounded-none bg-[#D4962A] hover:bg-[#b0781e] text-[#0E0B06] h-9 text-xs uppercase tracking-wider font-bold"
            >
              <Save className="mr-2 h-3.5 w-3.5" />
              {updateActiveMutation.isPending ? "Saving..." : "Save Strategy"}
            </Button>
          </div>
        </div>
      </section>
    </PageScaffold>
  );
}
