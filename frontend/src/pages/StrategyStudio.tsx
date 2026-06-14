import { useEffect, useMemo, useRef, useState } from "react";
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
import { Slider } from "@/components/ui/slider";
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
} from "@/hooks/useStrategy";
import { useChainStatus, useServiceStatus, useSettings, useSystemHealth } from "@/hooks/useSystem";
import type {
  StrategyAuditEventResponse,
  StrategyPolicyConfig,
  StrategySimulationResponse,
  StrategyTemplateSummary,
  StrategyValidationResponse,
  StrategyVersionRecordResponse,
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

const DEFAULT_STRATEGY_TEXT =
  "Use a conservative policy with USDY and mETH only, keep stable reserve above 40%, cap slippage at 0.50%, and review market conditions every 5 minutes.";
const SEEDED_DEFAULT_STRATEGY_TEXT = "Seeded default strategy policy.";

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

function panelClassName(extra?: string) {
  return cn("border border-border bg-card px-4 py-4 sm:px-5", extra);
}

function toneClasses(tone: StatusTone) {
  if (tone === "ready") {
    return "border-success/25 bg-success/8 text-success";
  }
  if (tone === "degraded") {
    return "border-warning/25 bg-warning/10 text-warning";
  }
  if (tone === "blocked") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  return "border-border bg-surface-2/70 text-muted-foreground";
}

function HeroStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function PolicyChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-sm border border-border bg-surface-2/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function ReadinessRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: StatusTone;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-medium", tone === "blocked" ? "text-destructive" : tone === "degraded" ? "text-warning" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

function CompactStatusCard({
  title,
  tone,
  status,
  summary,
  detail,
  children,
}: {
  title: string;
  tone: StatusTone;
  status: string;
  summary: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-sm border px-4 py-4", toneClasses(tone))}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
          <p className="mt-2 text-base font-semibold text-foreground">{status}</p>
          <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        </div>
        <StatusPill tone={tone}>{status}</StatusPill>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{detail}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function WeightSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-sm border border-border bg-surface-2/55 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">{formatPercent(value * 100, 0)}</span>
      </div>
      <Slider
        value={[Math.round(value * 100)]}
        max={100}
        step={1}
        onValueChange={(next) => onChange((next[0] ?? 0) / 100)}
      />
    </div>
  );
}

function LimitCard({
  label,
  value,
  suffix,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  suffix: string;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="rounded-sm border border-border bg-surface-2/55 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-3 flex items-center gap-2">
        <Input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number.parseFloat(event.target.value) || 0)}
          className="h-9"
        />
        <span className="whitespace-nowrap text-xs text-muted-foreground">{suffix}</span>
      </div>
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
    <div className="flex flex-col gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{version.version}</span>
            <Badge variant={isActive ? "secondary" : "outline"}>{isActive ? "Active" : "Previous"}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {humanize(version.active_policy_json.objective)} • {formatRelativeAge(version.activated_at ? new Date(version.activated_at) : null)}
          </p>
        </div>
        {!isActive ? (
          <Button variant="outline" size="sm" onClick={() => onRevert(version.version)} disabled={disabled}>
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
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-foreground">{humanize(event.event_type)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatAddress(event.actor)} • {formatRelativeAge(new Date(event.created_at))}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">{event.strategy_version_id ?? "system"}</span>
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
  const [activeTab, setActiveTab] = useState("policy");
  const [editingScheduler, setEditingScheduler] = useState(false);
  const initializedRef = useRef(false);
  const baselineSignatureRef = useRef<string>("");

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
  const activeTone = statusTone(activeVersion?.status, activeVersion?.status);

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
  const simulationPassed =
    latestSimulation?.simulation?.recommendation !== "reject" &&
    latestSimulation?.status !== "error" &&
    simulationTone !== "blocked";

  const latestDraftId =
    createDraftMutation.data?.draft_id ??
    latestValidation?.draft_id ??
    latestSimulation?.draft_id ??
    activeData?.last_validation?.draft_id ??
    null;

  const workflowLabel = isDirty
    ? "Draft"
    : validationPassed
        ? "Validated"
        : simulationPassed
          ? "Simulated"
        : activeVersion
          ? "Active"
          : "Standby";

  const allowedAssetsInput = useMemo(() => policy.allowed_assets.join(", "), [policy.allowed_assets]);

  const updatePolicy = (updater: (draft: StrategyPolicyConfig) => StrategyPolicyConfig) => {
    setPolicy((current) => updater(clonePolicy(current)));
  };

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
      setLastActionMessage("Loaded active strategy into the editor.");
      return;
    }
    if (templates[0]) {
      setPolicy(clonePolicy(templates[0].policy_json));
      setStrategyText(templates[0].prompt_text);
      setSelectedTemplateId(String(templates[0].id));
      setLastActionMessage(`Loaded ${templates[0].name}.`);
    }
  };

  const onDraft = () => {
    createDraftMutation.mutate(requestBody, {
      onSuccess: (response) => {
        syncBaseline(strategyText, policy, selectedTemplateId);
        setLastActionMessage(`Draft saved as #${response.draft_id}.`);
      },
    });
  };

  const onValidate = () => {
    validateMutation.mutate(requestBody, {
      onSuccess: (response) => {
        setValidationResult(response);
        syncBaseline(strategyText, policy, selectedTemplateId);
        setLastActionMessage(
          response.status === "ok"
            ? `Safety check passed at ${response.safety_score}/100.`
            : "Safety check found blocking issues.",
        );
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
        setLastActionMessage(`Impact simulation ${response.simulation.recommendation}.`);
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
        setLastActionMessage(`Activated ${response.active_version?.version ?? "strategy"}.`);
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
          setEditingScheduler(false);
          setLastActionMessage("Scheduler settings updated.");
        },
      },
    );
  };

  const policyChips = [
    { label: "Objective", value: humanize(policy.objective) },
    { label: "Assets", value: policy.allowed_assets.join(" · ") || "-" },
    { label: "Max Slippage", value: `${formatCount(policy.hard_limits.max_slippage_bps)} bps` },
    { label: "Stable Reserve", value: formatPercent(policy.hard_limits.min_stable_reserve_pct, 0) },
    { label: "LLM Influence", value: formatPercent(policy.hard_limits.max_llm_influence_pct, 0) },
    { label: "Market Check", value: formatInterval(policy.market_check_interval_seconds) },
    { label: "Circuit Breaker", value: policy.hard_limits.global_circuit_breaker ? "On" : "Off" },
  ];

  const safetySummary = validationPassed
    ? `Passed · ${formatCount(latestValidation?.safety_score ?? 0)}/100`
    : latestValidation
      ? `${humanize(latestValidation.status_code)} · ${formatCount(latestValidation.safety_score)}/100`
      : "Pending";
  const safetyDetail = validationPassed
    ? `${formatCount(latestValidation?.validation_errors.length ?? 0)} blocking errors.`
    : latestValidation?.status_reason ?? "Run validation before activation.";
  const simulationSummary = latestSimulation
    ? `${humanize(latestSimulation.simulation.recommendation)} · ${formatCount(latestSimulation.simulation.expected_risk_score)}/100`
    : "Pending";
  const simulationDetail = latestSimulation
    ? `Expected slippage ${formatCount(latestSimulation.simulation.expected_slippage_bps)} bps · Protective actions ${formatCount(
        latestSimulation.simulation.protective_actions.length,
      )}`
    : "Simulation is optional before activation.";
  const activationDetail = !validationPassed
    ? "Validate the policy first."
    : isDirty
      ? "Unsaved edits must be revalidated."
      : "Activation gate is clear.";
  const nextStep = !validationPassed
    ? "Run validation before activation."
    : isDirty
      ? "Save or revalidate the modified draft."
      : "Activation is available.";

  return (
    <PageScaffold
      title="Strategy Studio"
      description="Bounded strategy policy controls, simulation, versioning, and audit history backed by the strategy policy service."
    >
      <div className="flex flex-col gap-4 pb-24">
        <section className={panelClassName("py-3 sm:py-4")}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-start gap-3">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-primary/20 bg-primary/8 text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h1 className="text-[1.75rem] font-semibold tracking-[-0.03em] text-foreground">Strategy Studio</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Edit the bounded policy the AI can use. The system prompt stays locked.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <HeroStat label="signals" value={formatCount(liveSignalCount)} />
                    <HeroStat label="chain" value={targetChain} />
                    <HeroStat label="runtime" value={humanize(runtimeMode)} />
                    <HeroStat label="checked" value={formatRelativeAge(latestGeneratedAt)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start">
              <StatusPill tone={isDirty ? "degraded" : activeTone}>{workflowLabel}</StatusPill>
              <Badge variant="outline">{activeVersion?.version ?? policy.strategy_version}</Badge>
            </div>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-3">
          <TabsList className="h-12 w-full justify-start gap-1 rounded-none border border-border bg-card p-1">
            <TabsTrigger value="policy" className="rounded-none px-4 py-2 text-sm">
              Policy
            </TabsTrigger>
            <TabsTrigger value="scheduler" className="rounded-none px-4 py-2 text-sm">
              Scheduler
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-none px-4 py-2 text-sm">
              History
            </TabsTrigger>
          </TabsList>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              <TabsContent value="policy" className="mt-0">
                <section className={panelClassName()}>
                  <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Strategy Policy</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Choose a template, edit the strategy brief, then validate before activation.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={loadActiveIntoForm}>
                        Load Active
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                      <label className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Template</span>
                        <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                          <SelectTrigger className="rounded-none">
                            <SelectValue placeholder="Select a strategy template" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map((template) => (
                              <SelectItem key={template.id} value={String(template.id)}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <div className="flex items-end">
                        <Button variant="outline" className="w-full md:w-auto" onClick={() => applyTemplate(selectedTemplate)} disabled={!selectedTemplate}>
                          Apply Template
                        </Button>
                      </div>
                    </div>

                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Strategy Brief</span>
                      <Textarea
                        value={strategyText}
                        onChange={(event) => setStrategyText(event.target.value)}
                        className="min-h-[108px] rounded-none"
                      />
                    </label>

                    <div className="space-y-3 border-t border-border pt-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Policy Preview</h3>
                          <p className="mt-1 text-sm text-muted-foreground">7 active rules. Show summary first and open details only on demand.</p>
                        </div>
                        <Drawer>
                          <DrawerTrigger asChild>
                            <Button variant="link" size="sm" className="h-auto px-0 text-sm">
                              View JSON
                            </Button>
                          </DrawerTrigger>
                          <DrawerContent className="max-h-[85vh]">
                            <DrawerHeader>
                              <DrawerTitle>Policy JSON</DrawerTitle>
                              <DrawerDescription>Raw policy data is available on demand, not by default.</DrawerDescription>
                            </DrawerHeader>
                            <div className="px-4 pb-5">
                              <pre className="max-h-[60vh] overflow-auto rounded-sm border border-border bg-surface-2/60 p-4 text-[12px] leading-6 text-foreground">
                                {JSON.stringify(policy, null, 2)}
                              </pre>
                            </div>
                          </DrawerContent>
                        </Drawer>
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Assets</span>
                          {policy.allowed_assets.map((asset) => (
                            <Badge key={asset} variant="outline">
                              {asset}
                            </Badge>
                          ))}
                        </div>
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-auto px-0 text-xs">
                              Edit assets
                              <ChevronDown className="ml-2 h-3.5 w-3.5" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pt-2">
                            <Input
                              value={allowedAssetsInput}
                              onChange={(event) =>
                                updatePolicy((draft) => ({
                                  ...draft,
                                  allowed_assets: splitAssets(event.target.value),
                                }))
                              }
                              className="rounded-none"
                            />
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {policyChips.map((item) => (
                          <PolicyChip key={item.label} label={item.label} value={item.value} />
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="scheduler" className="mt-0">
                <section className={panelClassName()}>
                  <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Scheduler</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Keep timing rules separate from policy editing so they only appear when needed.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setEditingScheduler((current) => !current)}>
                      <Settings2 className="mr-2 h-4 w-4" />
                      {editingScheduler ? "Hide Edit" : "Edit Schedule"}
                    </Button>
                  </div>

                  <div className="mt-4 divide-y divide-border">
                    <DetailRow label="Market Check" value={`Every ${formatInterval(policy.market_check_interval_seconds)}`} />
                    <DetailRow label="Quote Refresh" value={`Every ${formatInterval(policy.quote_refresh_interval_seconds)}`} />
                    <DetailRow label="Risk Recompute" value={`Every ${formatInterval(policy.risk_recompute_interval_seconds)}`} />
                    <DetailRow label="Proposal Expiry" value={formatInterval(policy.proposal_expiry_seconds)} />
                  </div>

                  {editingScheduler ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <LimitCard
                        label="Market Check"
                        value={policy.market_check_interval_seconds}
                        suffix="seconds"
                        min={60}
                        max={3600}
                        step={15}
                        onChange={(next) =>
                          updatePolicy((draft) => ({
                            ...draft,
                            market_check_interval_seconds: next,
                          }))
                        }
                      />
                      <LimitCard
                        label="Quote Refresh"
                        value={policy.quote_refresh_interval_seconds}
                        suffix="seconds"
                        min={30}
                        max={1800}
                        step={15}
                        onChange={(next) =>
                          updatePolicy((draft) => ({
                            ...draft,
                            quote_refresh_interval_seconds: next,
                          }))
                        }
                      />
                      <LimitCard
                        label="Risk Recompute"
                        value={policy.risk_recompute_interval_seconds}
                        suffix="seconds"
                        min={60}
                        max={3600}
                        step={15}
                        onChange={(next) =>
                          updatePolicy((draft) => ({
                            ...draft,
                            risk_recompute_interval_seconds: next,
                          }))
                        }
                      />
                      <LimitCard
                        label="Proposal Expiry"
                        value={policy.proposal_expiry_seconds}
                        suffix="seconds"
                        min={60}
                        max={3600}
                        step={15}
                        onChange={(next) =>
                          updatePolicy((draft) => ({
                            ...draft,
                            proposal_expiry_seconds: next,
                          }))
                        }
                      />
                    </div>
                  ) : null}

                  {editingScheduler ? (
                    <div className="mt-4 flex justify-end">
                      <Button onClick={onUpdateScheduler} disabled={schedulerMutation.isPending}>
                        Save Schedule
                      </Button>
                    </div>
                  ) : null}
                </section>
              </TabsContent>

              <TabsContent value="history" className="mt-0">
                <div className="grid gap-4">
                  <section className={panelClassName()}>
                    <div className="border-b border-border pb-4">
                      <h2 className="text-lg font-semibold text-foreground">Version History</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Compact first, details only if the version matters.</p>
                    </div>
                    <div className="mt-2">
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
                        <p className="py-4 text-sm text-muted-foreground">No strategy versions available yet.</p>
                      )}
                    </div>
                  </section>

                  <section className={panelClassName()}>
                    <div className="border-b border-border pb-4">
                      <h2 className="text-lg font-semibold text-foreground">Audit Trail</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Collapsed event rows keep the record visible without dominating the page.</p>
                    </div>
                    <div className="mt-2">
                      {auditEvents.length ? (
                        auditEvents.slice(0, 12).map((event) => <AuditRow key={event.id} event={event} />)
                      ) : (
                        <p className="py-4 text-sm text-muted-foreground">No audit events available yet.</p>
                      )}
                    </div>
                  </section>
                </div>
              </TabsContent>
            </div>

            <aside className="min-w-0">
              <section className={panelClassName("sticky top-20 space-y-4 px-4 py-4")}>
                <div className="border-b border-border pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Readiness</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Compact status rows keep the next action obvious.</p>
                    </div>
                    <StatusPill tone={isDirty ? "degraded" : activeTone}>{workflowLabel}</StatusPill>
                  </div>
                </div>

                <div>
                  <ReadinessRow label="Status" value={workflowLabel} tone={isDirty ? "degraded" : activeTone} />
                  <ReadinessRow label="Active Version" value={activeVersion?.version ?? policy.strategy_version} tone={activeTone} />
                  <ReadinessRow label="Safety" value={safetySummary} tone={validationTone} />
                  <ReadinessRow label="Risk" value={`${formatCount(currentRiskScore)}/100`} tone={statusTone(riskQuery.data?.status, riskQuery.data?.status_code)} />
                  <ReadinessRow label="Simulation" value={simulationSummary} tone={simulationTone} />
                  <ReadinessRow label="Activation" value={!validationPassed || isDirty ? "Blocked" : "Ready"} tone={!validationPassed || isDirty ? "blocked" : "ready"} />
                  <ReadinessRow label="Runtime" value={humanize(runtimeMode)} />
                  <ReadinessRow label="AI Access" value={aiAccessEnabled ? "On" : "Off"} />
                  <ReadinessRow label="Checked" value={formatRelativeAge(latestGeneratedAt)} />
                </div>

                <div className="rounded-sm border border-border bg-surface-2/55 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Next step</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{nextStep}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{activationDetail}</p>
                </div>
              </section>
            </aside>
          </div>
        </Tabs>

        <section className="grid gap-3 lg:grid-cols-3">
          <CompactStatusCard
            title="Safety Check"
            tone={validationTone}
            status={safetySummary}
            summary={latestValidation?.validation_errors?.length ? `${latestValidation.validation_errors.length} blocking issues` : "Run validation before activation."}
            detail={safetyDetail}
          >
            {latestValidation?.validation_errors?.length ? (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-auto px-0 text-xs">
                    View details
                    <ChevronDown className="ml-2 h-3.5 w-3.5" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-3">
                  {latestValidation.validation_errors.slice(0, 4).map((error) => (
                    <div key={`${error.code}-${error.field ?? "field"}`} className="rounded-sm border border-border bg-background px-3 py-2">
                      <p className="text-xs font-semibold text-foreground">{error.code}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{error.message}</p>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </CompactStatusCard>

          <CompactStatusCard
            title="Impact Simulation"
            tone={simulationTone}
            status={simulationSummary}
            summary={latestSimulation ? `${formatCount(latestSimulation.simulation.protective_actions.length)} protective actions` : "Pending"}
            detail={simulationDetail}
          >
            {latestSimulation ? (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-auto px-0 text-xs">
                    View details
                    <ChevronDown className="ml-2 h-3.5 w-3.5" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-3">
                  {latestSimulation.simulation.critical_findings.length ? (
                    latestSimulation.simulation.critical_findings.map((finding) => (
                      <div key={finding} className="rounded-sm border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                        {finding}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-sm border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                      No critical findings. Protective actions stay available in backend policy checks.
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </CompactStatusCard>

          <CompactStatusCard
            title="Activation Gate"
            tone={!validationPassed || isDirty ? "degraded" : "ready"}
            status={!validationPassed || isDirty ? "Not ready" : "Ready"}
            summary={latestDraftId ? `Draft #${latestDraftId}` : "No saved draft yet"}
            detail={activationDetail}
          />
        </section>

        <section className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 shadow-sm backdrop-blur-md">
          <div className="mx-auto flex min-h-14 w-full max-w-[1440px] flex-col gap-2 py-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <span className="truncate">
                {lastActionMessage ??
                  (isDirty ? "Unsaved changes present. Save the draft, then validate before activation." : "Policy is aligned with the last saved state.")}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onDraft} disabled={!isDirty || createDraftMutation.isPending}>
                <Database className="mr-2 h-4 w-4" />
                Save Draft
              </Button>
              <Button
                variant="outline"
                onClick={onValidate}
                disabled={!strategyText.trim() || isDirty || validateMutation.isPending}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Validate
              </Button>
              <Button
                variant="outline"
                onClick={onSimulate}
                disabled={!validationPassed || isDirty || simulateMutation.isPending}
              >
                <Workflow className="mr-2 h-4 w-4" />
                Simulate
              </Button>
              <Button onClick={onActivate} disabled={!validationPassed || isDirty || activateMutation.isPending}>
                <Rocket className="mr-2 h-4 w-4" />
                Activate
              </Button>
            </div>
          </div>
        </section>
      </div>
    </PageScaffold>
  );
}
