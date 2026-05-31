import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { formatFundingRatePercent } from "@/lib/arbFunding";

type FundingHistorySeries = {
  key: string;
  label: string;
  color: string;
};

type FundingHistoryPoint = {
  label: string;
  [key: string]: string | number | null;
};

type FundingHistoryChartProps = {
  data: FundingHistoryPoint[];
  series: FundingHistorySeries[];
  config: Record<string, { label: string; color: string }>;
};

function formatRateAxis(value: number) {
  return `${(value * 100).toFixed(3)}%`;
}

export function FundingHistoryChart({
  data,
  series,
  config,
}: FundingHistoryChartProps) {
  const values = data.flatMap((point) =>
    series
      .map((entry) => point[entry.key])
      .filter((value): value is number => typeof value === "number"),
  );

  const yDomain =
    values.length === 0
      ? ([-0.0005, 0.0005] as const)
      : (() => {
          const max = Math.max(...values.map((value) => Math.abs(value)));
          const padding = max * 0.28 || 0.00015;
          return [-(max + padding), max + padding] as const;
        })();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2">
        <p className="terminal-label">Funding history</p>
      </div>

      {data.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <span className="terminal-value text-[12px] text-muted-foreground">
            AWAITING FUNDING HISTORY...
          </span>
        </div>
      ) : (
        <div className="min-h-0 flex-1 p-3">
          <ChartContainer
            config={config}
            className="h-full w-full min-h-[12rem] min-w-0 !aspect-auto"
          >
            <ComposedChart
              data={data}
              margin={{ top: 12, right: 12, bottom: 12, left: 58 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="rgba(150, 150, 150, 0.18)"
              />
              <XAxis
                dataKey="label"
                interval="preserveStartEnd"
                minTickGap={28}
                tickLine={false}
                axisLine={false}
                tick={{
                  fill: "rgba(200, 200, 200, 0.75)",
                  fontSize: 10,
                }}
                tickMargin={8}
                height={26}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={formatRateAxis}
                tickLine={false}
                axisLine={false}
                width={54}
                tick={{
                  fill: "rgba(200, 200, 200, 0.75)",
                  fontSize: 10,
                }}
              />
              <ReferenceLine
                y={0}
                stroke="rgba(200, 169, 110, 0.85)"
                strokeDasharray="4 4"
              />
              <Tooltip
                content={
                  <ChartTooltipContent
                    className="rounded-lg border border-primary bg-card/95"
                    formatter={(value, name) => {
                      const label =
                        series.find((entry) => entry.key === name)?.label ??
                        String(name);
                      return (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="terminal-value text-[12px]">
                            {formatFundingRatePercent(
                              typeof value === "number" ? value : null,
                            )}
                          </span>
                        </div>
                      );
                    }}
                  />
                }
                cursor={{
                  stroke: "rgba(200, 200, 200, 0.3)",
                  strokeWidth: 2,
                }}
              />
              {series.map((entry) => (
                <Line
                  key={entry.key}
                  type="monotone"
                  dataKey={entry.key}
                  stroke={entry.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ChartContainer>
        </div>
      )}
    </div>
  );
}
