import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "primary" | "success" | "warning" | "danger";

type StatusItem = {
  label: string;
  value: ReactNode;
  tone?: StatusTone;
};

type MetricItem = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatusTone;
};

type PageTabItem = {
  value: string;
  label: string;
  badge?: ReactNode;
};

const toneClasses: Record<StatusTone, string> = {
  neutral: "border-border/80 bg-background/50 text-muted-foreground",
  primary: "border-primary/25 bg-primary/10 text-primary",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  danger: "border-danger/25 bg-danger/10 text-danger",
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "panel-strong border border-border/80 p-4 sm:p-5 h-full-screen",
        className,
      )}
    >
      <div className="flex  flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          {eyebrow ? (
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <div className="space-y-0.5">
            <h1 className="highlight-text text-base font-semibold tracking-tight">
              {title}
            </h1>
            {description ? (
              <div className="max-w-3xl text-xs leading-5 text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children ? (
        <div className="mt-3 border-t border-border/70 pt-3">{children}</div>
      ) : null}
    </section>
  );
}

export function PageTabs({
  value,
  onValueChange,
  items,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: PageTabItem[];
  className?: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onValueChange(item.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
              active
                ? "border-primary/30 bg-primary/12 text-primary shadow-[0_16px_36px_-24px_hsl(var(--primary)/0.9)]"
                : "border-border bg-surface-2 text-muted-foreground hover:border-accent/30 hover:bg-surface-2/80 hover:text-foreground",
            )}
          >
            <span>{item.label}</span>
            {item.badge !== undefined ? (
              <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] text-foreground">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function StatusPillRow({
  items,
  className,
}: {
  items: StatusItem[];
  className?: string;
}) {
  const visibleItems = items.filter(
    (item) => item.value !== undefined && item.value !== null,
  );

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {visibleItems.map((item) => (
        <div
          key={item.label}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium",
            toneClasses[item.tone ?? "neutral"],
          )}
        >
          <span className="uppercase tracking-[0.14em] text-muted-foreground">
            {item.label}
          </span>
          <span className="text-foreground">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function MetricStrip({
  items,
  className,
}: {
  items: MetricItem[];
  className?: string;
}) {
  return (
    <section
      className={cn(
        "grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6",
        className,
      )}
    >
      {items.map((item) => (
        <StatCard
          key={item.label}
          label={item.label}
          value={item.value}
          hint={item.hint}
          tone={item.tone}
        />
      ))}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  const dotClass =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-danger"
          : tone === "primary"
            ? "bg-primary"
            : "bg-muted";

  return (
    <div
      className={cn(
        "panel-muted rounded-[1.25rem] border border-border/80 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <div
          className={cn(
            "h-2 w-2 rounded-full border border-background",
            dotClass,
          )}
        />
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="font-mono text-lg font-semibold text-foreground">
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

export function PanelCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  variant = "default",
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  variant?: "default" | "compact" | "flat" | "bordered";
}) {
  const variantClasses = {
    default: "panel-strong  border border-border/80",
    compact: "panel-muted rounded-[1.25rem] border border-border/60",
    flat: "rounded-[1.25rem] bg-card/50",
    bordered: "panel-muted  border border-border",
  };

  return (
    <section
      className={cn("overflow-hidden", variantClasses[variant], className)}
    >
      {title || description || action ? (
        <div
          className={cn(
            "flex items-center justify-between border-b border-border/70 px-4 py-3",
            !title && !description ? "justify-end" : "",
          )}
        >
          {(title || description) && (
            <div className="min-w-0 space-y-0.5">
              {title ? (
                <h2 className="text-sm font-semibold text-foreground">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="text-xs leading-4 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          )}
          {action ? (
            <div className="flex shrink-0 items-center gap-2">{action}</div>
          ) : null}
        </div>
      ) : null}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelSplit({
  left,
  right,
  className,
  ratio = "1:1",
}: {
  left: ReactNode;
  right: ReactNode;
  className?: string;
  ratio?: "1:1" | "2:1" | "1:2" | "3:2" | "2:3";
}) {
  const ratioClasses = {
    "1:1": "grid-cols-1 lg:grid-cols-2",
    "2:1": "grid-cols-1 lg:grid-cols-[2fr_1fr]",
    "1:2": "grid-cols-1 lg:grid-cols-[1fr_2fr]",
    "3:2": "grid-cols-1 lg:grid-cols-[3fr_2fr]",
    "2:3": "grid-cols-1 lg:grid-cols-[2fr_3fr]",
  };

  return (
    <div className={cn("grid gap-3", ratioClasses[ratio], className)}>
      {left}
      {right}
    </div>
  );
}

export function EmptyPanelState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-surface-2/60 px-4 sm:px-6 py-6 text-center",
        "panel-muted",
        className,
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-xs leading-4 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function DataCard({
  title,
  badge,
  action,
  children,
  className,
}: {
  title?: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "panel-muted rounded-[1.25rem] border border-border/70",
        className,
      )}
    >
      {(title || badge || action) && (
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
          <div className="flex items-center gap-2">
            {title && (
              <h3 className="text-xs font-semibold text-foreground">{title}</h3>
            )}
            {badge}
          </div>
          {action}
        </div>
      )}
      <div className="p-2">{children}</div>
    </div>
  );
}
