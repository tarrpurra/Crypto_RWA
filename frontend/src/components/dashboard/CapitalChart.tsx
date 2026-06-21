import { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import type { PriceHistoryPoint } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CapitalChartProps {
  points: Record<string, PriceHistoryPoint[]>;
  isLoading: boolean;
  isDemo: boolean;
  availableAssets: string[];
  range: string;
  bucket: string;
  onRangeChange: (range: string) => void;
  onBucketChange: (bucket: string) => void;
}

type ChartSeriesKey = string;

const RANGE_OPTIONS = [
  { label: "1H", value: "1h" },
  { label: "6H", value: "6h" },
  { label: "24H", value: "24h" },
  { label: "7D", value: "7d" },
];

const BUCKET_OPTIONS = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "1H", value: "1h" },
  { label: "6H", value: "6h" },
];

function formatTooltipDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatCapitalAxisDate(timestamp: number, range: string) {
  const date = new Date(timestamp);
  if (range === "7d") {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (range === "1h" || range === "6h" || range === "24h") {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  });
}

function formatYAxisValue(value: number) {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  if (Math.abs(value) >= 100) {
    return `$${value.toFixed(0)}`;
  }
  return `$${value.toFixed(2)}`;
}

const CustomTooltip = ({
  active,
  payload,
  label,
  valueLabel,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: number;
  valueLabel: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-lp-border-muted bg-lp-bg/92 px-3 py-2 shadow-xl backdrop-blur-lg">
      <p className="text-xs text-lp-fg-muted">{label ? formatTooltipDate(label) : ""}</p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lp-fg-muted">{valueLabel}</p>
      <p className="font-mono text-sm font-medium text-lp-fg">{formatCurrency(payload[0].value)}</p>
    </div>
  );
};

export function CapitalChart({
  points,
  isLoading,
  isDemo,
  availableAssets,
  range,
  bucket,
  onRangeChange,
  onBucketChange,
}: CapitalChartProps) {
  const id = useId();
  const [selectedSeries, setSelectedSeries] = useState<ChartSeriesKey>("");

  const tokenSeriesOptions = useMemo(() => {
    const preferredOrder = ["mETH", "USDY", "WMNT", "MNT"];
    return [...availableAssets].sort((left, right) => {
      const leftIndex = preferredOrder.indexOf(left);
      const rightIndex = preferredOrder.indexOf(right);
      if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    }) as ChartSeriesKey[];
  }, [availableAssets]);

  useEffect(() => {
    if (tokenSeriesOptions.length === 0) {
      if (selectedSeries !== "") setSelectedSeries("");
      return;
    }
    if (!tokenSeriesOptions.includes(selectedSeries)) {
      setSelectedSeries(tokenSeriesOptions[0]);
    }
  }, [selectedSeries, tokenSeriesOptions]);

  const currentPoints = useMemo(
    () => (selectedSeries ? points[selectedSeries] ?? [] : []),
    [points, selectedSeries],
  );

  const chartData = useMemo(() => {
    return currentPoints.map((pt) => ({
      timestamp: new Date(pt.time).getTime(),
      value: pt.close ?? pt.avg ?? 0,
      low: pt.low ?? pt.close ?? pt.avg ?? 0,
      high: pt.high ?? pt.close ?? pt.avg ?? 0,
    }));
  }, [currentPoints]);

  const yDomain = useMemo<[number, number] | undefined>(() => {
    if (chartData.length === 0) {
      return undefined;
    }

    const lows = chartData
      .map((point) => point.low)
      .filter((value) => Number.isFinite(value));
    const highs = chartData
      .map((point) => point.high)
      .filter((value) => Number.isFinite(value));

    if (lows.length === 0 || highs.length === 0) {
      return undefined;
    }

    const min = Math.min(...lows);
    const max = Math.max(...highs);

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return undefined;
    }

    if (min === max) {
      const fallbackPadding = Math.max(Math.abs(min) * 0.02, 1);
      return [Math.max(0, min - fallbackPadding), max + fallbackPadding];
    }

    const padding = Math.max((max - min) * 0.12, max * 0.005);
    return [Math.max(0, min - padding), max + padding];
  }, [chartData]);

  const activeLabel = selectedSeries;
  const title = selectedSeries ? `${selectedSeries} price history` : "Token price history";
  const latestValue = chartData[chartData.length - 1]?.value ?? null;

  const bucketLabel = BUCKET_OPTIONS.find((o) => o.value === bucket)?.label ?? "1H";
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "24H";

  return (
    <div className="terminal-panel p-4">
      <div className="flex flex-col gap-3 border-b border-border pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="terminal-label text-primary">Capital</p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">{title}</h2>
            {latestValue != null && (
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-lg font-semibold text-foreground">{formatCurrency(latestValue)}</span>
                <span className="text-xs text-muted-foreground">
                  Current {selectedSeries} price
                </span>
              </div>
            )}
          </div>
          {chartData.length > 0 && (
            <span className="pt-1 font-mono text-xs text-muted-foreground">
              {rangeLabel} &middot; {bucketLabel}
              {isDemo ? " demo" : ""}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2" aria-label="Capital chart series">
            {tokenSeriesOptions.map((series) => {
              const isActive = selectedSeries === series;
              return (
                <Button
                  key={series}
                  type="button"
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSeries(series)}
                  className={cn(
                    "h-8 px-3 text-[10px]",
                    !isActive && "border-border/70 bg-background text-muted-foreground hover:border-primary/40",
                  )}
                  aria-pressed={isActive}
                >
                  {series}
                </Button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] text-muted-foreground sm:inline">Range</span>
            <div className="flex gap-1">
              {RANGE_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={range === opt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => onRangeChange(opt.value)}
                  className={cn(
                    "h-7 px-2 text-[10px]",
                    range !== opt.value && "border-border/70 bg-background text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            <span className="ml-1 hidden text-[10px] text-muted-foreground sm:inline">Bucket</span>
            <div className="flex gap-1">
              {BUCKET_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={bucket === opt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => onBucketChange(opt.value)}
                  className={cn(
                    "h-7 px-2 text-[10px]",
                    bucket !== opt.value && "border-border/70 bg-background text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-pulse border border-primary/30 bg-primary/10" />
          <span className="ml-2 text-xs text-muted-foreground">Loading chart...</span>
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-xs text-muted-foreground">No price history data available.</p>
        </div>
      ) : (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={["dataMin", "dataMax"]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "Space Grotesk" }}
                dy={4}
                interval="preserveStartEnd"
                tickFormatter={(value: number) => formatCapitalAxisDate(value, range)}
                scale="time"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "Space Grotesk" }}
                dx={-4}
                tickFormatter={formatYAxisValue}
                width={48}
                domain={yDomain ?? ["auto", "auto"]}
              />
              <Tooltip content={<CustomTooltip valueLabel={activeLabel} />} cursor={false} />

              <defs>
                <linearGradient id={`capital-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>

              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill={`url(#capital-fill-${id})`}
                isAnimationActive={true}
                animationDuration={1200}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
