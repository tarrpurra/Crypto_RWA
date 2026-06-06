"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { useReducedMotion } from "framer-motion";

interface DataPoint {
  month: string;
  value: number;
}

interface AreaChartCardProps {
  data: DataPoint[];
  height?: number;
  gradient?: boolean;
  showAxes?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  annotations?: { value: number; label: string }[];
  className?: string;
}

const defaultData: DataPoint[] = [
  { month: "Jan", value: 2.1 },
  { month: "Feb", value: 3.8 },
  { month: "Mar", value: 5.2 },
  { month: "Apr", value: 8.7 },
  { month: "May", value: 12.4 },
  { month: "Jun", value: 18.9 },
  { month: "Jul", value: 24.1 },
  { month: "Aug", value: 31.5 },
  { month: "Sep", value: 38.2 },
  { month: "Oct", value: 42.7 },
  { month: "Nov", value: 46.3 },
  { month: "Dec", value: 48.9 },
];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-lp-border-muted bg-lp-bg/92 px-3 py-2 shadow-xl backdrop-blur-lg">
      <p className="text-xs text-lp-fg-muted">{label}</p>
      <p className="font-mono text-sm font-medium text-lp-fg">${payload[0].value.toFixed(1)}M</p>
    </div>
  );
};

export function AreaChartCard({
  data = defaultData,
  height = 300,
  gradient = true,
  showAxes = false,
  showGrid = false,
  showTooltip = true,
  annotations,
  className,
}: AreaChartCardProps) {
  const id = useId();
  const reduce = useReducedMotion();

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: showAxes ? 0 : 8 }}>
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
          )}
          {showAxes && (
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              dy={6}
            />
          )}
          {showAxes && (
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              dx={-4}
              tickFormatter={(v: number) => `$${v}M`}
            />
          )}
          {showTooltip && <Tooltip content={<CustomTooltip />} cursor={false} />}

          <defs>
            <linearGradient id={`area-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>

          <Area
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill={gradient ? `url(#area-fill-${id})` : "transparent"}
            isAnimationActive={!reduce}
            animationDuration={1200}
            animationEasing="ease-out"
          />

          {annotations?.map((ann, i) => {
            const point = data.find((d) => Math.abs(d.value - ann.value) < 0.5);
            if (!point) return null;
            const xIndex = data.indexOf(point);
            const xPercent = (xIndex / (data.length - 1)) * 100;
            const minVal = Math.min(...data.map((d) => d.value));
            const maxVal = Math.max(...data.map((d) => d.value));
            const yPercent = ((ann.value - minVal) / (maxVal - minVal)) * 100;

            return (
              <g key={i}>
                <circle
                  cx={`${xPercent}%`}
                  cy={`${100 - yPercent}%`}
                  r={4}
                  fill="hsl(var(--primary))"
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                />
                <text
                  x={`${xPercent + 4}%`}
                  y={`${100 - yPercent - 4}%`}
                  fill="hsl(var(--foreground))"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                >
                  {ann.label}
                </text>
              </g>
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
