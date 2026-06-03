import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatusTone = "ready" | "degraded" | "blocked" | "neutral";

const toneClass: Record<StatusTone, string> = {
  ready: "border-success/35 bg-success/10 text-success",
  degraded: "border-warning/35 bg-warning/10 text-warning",
  blocked: "border-destructive/35 bg-destructive/10 text-destructive",
  neutral: "border-border bg-surface-2 text-muted-foreground",
};

const toneLabel: Record<StatusTone, string> = {
  ready: "Operational",
  degraded: "Warning",
  blocked: "Blocked",
  neutral: "Standby",
};

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center border-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
        toneClass[tone],
      )}
    >
      {children ?? toneLabel[tone]}
    </span>
  );
}

export function MetricPanel({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: StatusTone;
}) {
  return (
    <section className="terminal-panel flex min-h-32 flex-col justify-between p-4 transition-colors hover:border-primary/35">
      <div className="flex items-start justify-between gap-3">
        <p className="terminal-label">{label}</p>
        <StatusPill tone={tone} />
      </div>
      <div>
        <p className="terminal-value mt-6 text-2xl">{value}</p>
        <p className="mt-2 text-sm leading-5 text-muted-foreground">{detail}</p>
      </div>
    </section>
  );
}

export function toneFromStatus(status?: string | null): StatusTone {
  if (!status) {
    return "neutral";
  }
  if (status === "ok") {
    return "ready";
  }
  if (status === "degraded") {
    return "degraded";
  }
  if (status === "error" || status === "blocked") {
    return "blocked";
  }
  return "neutral";
}

export function PageScaffold({
    eyebrow,
    title,
    description,
    children,
  }: {
    eyebrow: string;
    title: string;
    description: string;
    children: ReactNode;
  }) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="border-b-2 border-border pb-6">
          <p className="text-xs font-semibold text-primary">{eyebrow}</p>
          <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="terminal-wordmark text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
                {title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                {description}
              </p>
            </div>
            <StatusPill tone="ready">Live</StatusPill>
          </div>
        </section>
        {children}
      </div>
    );
  }
