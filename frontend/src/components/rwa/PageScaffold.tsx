import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatusTone = "ready" | "degraded" | "blocked" | "neutral";

const toneClass: Record<StatusTone, string> = {
  ready: "border-success/40 bg-success/10 text-success",
  degraded: "border-warning/40 bg-warning/10 text-warning",
  blocked: "border-destructive/40 bg-destructive/10 text-destructive",
  neutral: "border-border bg-surface-2 text-muted-foreground",
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
        "inline-flex h-7 items-center border px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
        toneClass[tone],
      )}
    >
      {children}
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
    <section className="terminal-panel flex min-h-32 flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="terminal-label">{label}</p>
        <StatusPill tone={tone}>{tone}</StatusPill>
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
      <div className="flex min-h-screen w-full flex-col gap-6 px-4 py-6 sm:px-8 lg:px-10">
        <section className="border-b border-border pb-6">
          <p className="terminal-label text-primary">{eyebrow}</p>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="terminal-wordmark text-4xl leading-none text-foreground sm:text-5xl">
                {title}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
                {description}
              </p>
            </div>
            <StatusPill tone="ready">LIVE</StatusPill>
          </div>
        </section>
        {children}
      </div>
    );
  }
