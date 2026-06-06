"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { useReducedMotion } from "framer-motion";

interface BarChartCardProps {
  data?: { label: string; value: number; fill?: string }[];
  height?: number;
  className?: string;
}

const defaultData = [
  { label: "TradFi Bonds", value: 3.2 },
  { label: "RWA Yield", value: 12.8 },
  { label: "TradFi REITs", value: 4.5 },
  { label: "RWA Credit", value: 14.2 },
  { label: "TradFi HY", value: 6.1 },
  { label: "RWA Pool", value: 16.7 },
];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: { label: string } }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-lp-border-muted bg-lp-bg/92 px-3 py-2 shadow-xl backdrop-blur-lg">
      <p className="text-xs text-lp-fg-muted">{payload[0].payload.label}</p>
      <p className="font-mono text-sm font-medium text-lp-fg">{payload[0].value}% APY</p>
    </div>
  );
};

export function BarChartCard({ data = defaultData, height = 220, className }: BarChartCardProps) {
  const reduce = useReducedMotion();

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.2)" vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
            dy={4}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--primary) / 0.06)" }} />
          <Bar
            dataKey="value"
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
            isAnimationActive={!reduce}
            animationDuration={800}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
