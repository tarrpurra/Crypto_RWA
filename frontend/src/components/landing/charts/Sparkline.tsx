"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data?: number[];
  height?: number;
  width?: number;
  color?: string;
}

const defaultData = [
  2.1, 2.4, 2.8, 3.2, 4.1, 5.3, 6.8, 7.2, 9.5, 11.3, 13.8, 16.2, 18.7, 21.3, 24.8, 27.1, 29.4, 31.0, 32.8, 34.2, 36.1, 38.5, 40.2, 41.8,
];

export function Sparkline({
  data = defaultData,
  height = 40,
  width = 120,
  color,
}: SparklineProps) {
  const chartData = data.map((v, i) => ({ i, v }));
  const strokeColor = color || "hsl(var(--primary))";

  return (
    <ResponsiveContainer width={width} height={height}>
      <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-fill-${strokeColor.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={strokeColor}
          strokeWidth={1.5}
          fill={`url(#spark-fill-${strokeColor.replace(/\s/g, "")})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
