import { Activity, Bot, ShieldAlert, Target } from "lucide-react";

import type { AllocationDecisionResponse, RecommendationResponse, RiskAssessmentResponse } from "@/lib/api/types";

function toPercent(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

function toneClass(riskBand: string | undefined, hardVetoStatus: string | undefined) {
  if (hardVetoStatus === "active") {
    return "text-destructive";
  }
  if (riskBand === "RISK_CAUTION" || riskBand === "RISK_REBALANCE_ONLY") {
    return "text-warning";
  }
  return "text-success";
}

function riskScaleLabel(risk: RiskAssessmentResponse | null) {
  if (!risk?.risk_score_scale) {
    return "0-100, higher is worse";
  }
  return `${risk.risk_score_scale.min_score}-${risk.risk_score_scale.max_score}, ${risk.risk_score_scale.higher_is_worse ? "higher is worse" : "higher is better"}`;
}

function bandRangeLabel(minInclusive: number, maxExclusive: number | null) {
  if (maxExclusive == null) {
    return `${minInclusive}+`;
  }
  if (maxExclusive === 100) {
    return `${minInclusive}-${maxExclusive}`;
  }
  return `${minInclusive}-<${maxExclusive}`;
}

function expectedBandFromScore(risk: RiskAssessmentResponse | null) {
  if (!risk?.risk_score_scale || typeof (risk.risk_score_normalized ?? risk.risk_score) !== "number") {
    return null;
  }

  const score = risk.risk_score_normalized ?? risk.risk_score;
  return (
    risk.risk_score_scale.bands.find((band) => {
      const minOk = score >= band.min_inclusive;
      const maxOk = band.max_exclusive == null ? true : score < band.max_exclusive;
      return minOk && maxOk;
    }) ?? null
  );
}

interface RiskConfidenceCardProps {
  risk: RiskAssessmentResponse | null;
  allocation: AllocationDecisionResponse | undefined;
  decisions: RecommendationResponse | undefined;
  isLoading: boolean;
  embedded?: boolean;
}

export function RiskConfidenceCard({
  risk,
  allocation,
  decisions,
  isLoading,
  embedded = false,
}: RiskConfidenceCardProps) {
  const decisionConfidence = allocation?.decision.confidence ?? decisions?.confidence;
  const riskConfidence = risk?.confidence_normalized ?? risk?.confidence;
  const riskBand = risk?.risk_band ?? allocation?.status_code;
  const riskScore = risk?.risk_score_normalized ?? risk?.risk_score;
  const recommendedAction = allocation?.decision.recommended_action ?? decisions?.recommended_action ?? risk?.recommended_action;
  const profile = allocation?.decision.profile_name;
  const hardVetoStatus = risk?.hard_veto_status ?? decisions?.hard_veto_status;
  const expectedBand = expectedBandFromScore(risk);
  const bandEscalated = Boolean(expectedBand && riskBand && expectedBand.band !== riskBand);
  const bandExplanation = hardVetoStatus === "active"
    ? "Hard veto overrides the base score."
    : bandEscalated
      ? `Base score maps to ${expectedBand?.label ?? expectedBand?.band}, but bucket guardrails escalate the live band to ${riskBand}.`
      : "Band matches the current base severity score.";

  if (isLoading) {
    return (
      <section className={embedded ? "p-1" : "terminal-panel border-primary/20 p-4"}>
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-pulse border border-primary/30 bg-primary/10" />
          <span className="text-xs text-muted-foreground">Loading risk and confidence...</span>
        </div>
      </section>
    );
  }

  return (
    <section className={embedded ? "h-full" : "terminal-panel border-primary/25 p-4"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="terminal-label text-primary">Risk & Confidence</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Current guardrail posture and the confidence level behind the latest allocation decision.
          </p>
        </div>
        <span className={`font-mono text-sm ${toneClass(riskBand, hardVetoStatus)}`}>
          {riskBand ?? "PENDING"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />
            Risk Score
          </div>
          <p className={`font-mono text-2xl ${toneClass(riskBand, hardVetoStatus)}`}>
            {typeof riskScore === "number" ? riskScore.toFixed(2) : "--"}
          </p>
          <p className="text-[0.68rem] text-muted-foreground">
            {riskScaleLabel(risk)}
          </p>
          <p className="max-w-[26ch] text-[0.68rem] leading-5 text-muted-foreground">
            {bandExplanation}
          </p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            Risk Confidence
          </div>
          <p className="font-mono text-2xl text-foreground">{toPercent(riskConfidence)}</p>
          <p className="text-[0.68rem] text-muted-foreground">
            Deterministic confidence from portfolio and quote freshness.
          </p>
        </div>
      </div>

      {risk?.risk_score_scale?.bands?.length ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">Risk Scale</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {risk.risk_score_scale.bands.slice(0, 5).map((band) => {
              const active = band.band === riskBand;
              return (
                <div
                  key={band.band}
                  className={`rounded border px-2.5 py-1.5 text-[0.68rem] ${active ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-surface-2 text-muted-foreground"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{band.label}</span>
                    <span className="font-mono">
                      {bandRangeLabel(band.min_inclusive, band.max_exclusive)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-5 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded border border-border/70 bg-surface-2/70 px-3 py-2 text-[0.72rem]">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            Recommended action
          </div>
          <span className="font-sans font-medium text-foreground">{recommendedAction ?? "Monitor"}</span>
          <div className="hidden h-3.5 w-px bg-border sm:block" />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            Decision confidence
          </div>
          <span className="font-mono text-foreground">{toPercent(decisionConfidence)}</span>
          <div className="hidden h-3.5 w-px bg-border sm:block" />
          <span className="text-muted-foreground">Decision profile</span>
          <span className="font-sans font-medium text-foreground">{profile ?? "Balanced"}</span>
          <div className="hidden h-3.5 w-px bg-border sm:block" />
          <span className="text-muted-foreground">Approval mode</span>
          <span className="font-sans font-medium text-foreground">
            {hardVetoStatus === "active" ? "Blocked" : risk?.required_human_approval_status ?? decisions?.required_human_approval_status ?? "Required"}
          </span>
        </div>
      </div>
    </section>
  );
}
