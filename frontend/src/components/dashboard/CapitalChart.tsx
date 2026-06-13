import { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import type { PortfolioSnapshotResponse } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CapitalChartProps {
  snapshots: PortfolioSnapshotResponse[] | undefined;
  isLoading: boolean;
}

type ChartSeriesKey = string;

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTooltipDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAxisDate(timestamp: number, sameDayRange: boolean) {
  const date = new Date(timestamp);
  if (sameDayRange) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return formatDate(date.toISOString());
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

export function CapitalChart({ snapshots, isLoading }: CapitalChartProps) {
  const id = useId();
  const [selectedSeries, setSelectedSeries] = useState<ChartSeriesKey>("");

  const sortedSnapshots = useMemo(
    () =>
      [...(snapshots ?? [])].sort((left, right) => new Date(left.generated_at).getTime() - new Date(right.generated_at).getTime()),
    [snapshots],
  );

  const tokenSeriesOptions = useMemo(() => {
    const symbols = new Set<string>();

    sortedSnapshots.forEach((snapshot) => {
      snapshot.positions.forEach((position) => {
        if (position.asset_symbol && position.price_usd != null) {
          symbols.add(position.asset_symbol);
        }
      });
    });

    const preferredOrder = ["mETH", "USDY", "WMNT", "MNT"];
    return Array.from(symbols).sort((left, right) => {
      const leftIndex = preferredOrder.indexOf(left);
      const rightIndex = preferredOrder.indexOf(right);
      if (leftIndex === -1 && rightIndex === -1) {
        return left.localeCompare(right);
      }
      if (leftIndex === -1) {
        return 1;
      }
      if (rightIndex === -1) {
        return -1;
      }
      return leftIndex - rightIndex;
    }) as ChartSeriesKey[];
  }, [sortedSnapshots]);

  useEffect(() => {
    if (tokenSeriesOptions.length === 0) {
      if (selectedSeries !== "") {
        setSelectedSeries("");
      }
      return;
    }

    if (!tokenSeriesOptions.includes(selectedSeries)) {
      setSelectedSeries(tokenSeriesOptions[0]);
    }
  }, [selectedSeries, tokenSeriesOptions]);

  const chartData = useMemo(() => {
    return sortedSnapshots
      .map((snapshot) => {
        const position = snapshot.positions.find(
          (item) => item.asset_symbol === selectedSeries && item.price_usd != null,
        );
        if (!position?.price_usd) {
          return null;
        }

        return {
          timestamp: new Date(snapshot.generated_at).getTime(),
          value: Number(position.price_usd),
        };
      })
      .filter((entry): entry is { timestamp: number; value: number } => entry !== null);
  }, [selectedSeries, sortedSnapshots]);

  const activeLabel = selectedSeries;
  const title = selectedSeries ? `${selectedSeries} price history` : "Token price history";
  const latestValue = chartData[chartData.length - 1]?.value ?? null;

  const sameDayRange =
    chartData.length > 1
      ? new Date(chartData[0].timestamp).toDateString() === new Date(chartData[chartData.length - 1].timestamp).toDateString()
      : false;

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
            <span className="pt-1 font-mono text-xs text-muted-foreground">{chartData.length} snapshots</span>
          )}
        </div>

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
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-pulse border border-primary/30 bg-primary/10" />
          <span className="ml-2 text-xs text-muted-foreground">Loading chart...</span>
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-xs text-muted-foreground">No snapshot data available for chart.</p>
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
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                dy={4}
                interval="preserveStartEnd"
                tickFormatter={(value: number) => formatAxisDate(value, sameDayRange)}
                scale="time"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                dx={-4}
                tickFormatter={formatYAxisValue}
                width={48}
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
