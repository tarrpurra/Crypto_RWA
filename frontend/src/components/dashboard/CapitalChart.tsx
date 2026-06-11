import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import type { PortfolioSnapshotResponse } from "@/lib/api/types";

interface CapitalChartProps {
  snapshots: PortfolioSnapshotResponse[] | undefined;
  isLoading: boolean;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-lp-border-muted bg-lp-bg/92 px-3 py-2 shadow-xl backdrop-blur-lg">
      <p className="text-xs text-lp-fg-muted">{label}</p>
      <p className="font-mono text-sm font-medium text-lp-fg">
        ${payload[0].value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
};

export function CapitalChart({ snapshots, isLoading }: CapitalChartProps) {
  const id = useId();

  const chartData = (snapshots ?? [])
    .filter((s) => s.total_value_usd != null)
    .map((s) => ({
      date: formatDate(s.generated_at),
      value: Number(s.total_value_usd),
    }));

  return (
    <div className="terminal-panel p-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="terminal-label text-primary">Capital</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Portfolio value over time</h2>
        </div>
        {chartData.length > 0 && (
          <span className="font-mono text-xs text-muted-foreground">
            {chartData.length} snapshots
          </span>
        )}
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
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                dy={4}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                dx={-4}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} cursor={false} />

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
