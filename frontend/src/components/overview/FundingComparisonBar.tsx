import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { formatFundingRatePercent } from "@/lib/arbFunding";

type FundingComparisonRow = {
  key: string;
  label: string;
  fundingRate: number;
  nextFundingRate: number | null;
  markPrice: number | null;
  status: string;
  fill: string;
};

type FundingComparisonBarProps = {
  data: FundingComparisonRow[];
  config: Record<string, { label: string; color: string }>;
  onFocusFunding?: () => void;
};

function formatRateAxis(value: number) {
  return `${(value * 100).toFixed(3)}%`;
}

function formatMarkPrice(value: number | null) {
  if (value === null) {
    return "-";
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 1000 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function FundingComparisonBar({
  data,
  config,
  onFocusFunding,
}: FundingComparisonBarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
        <p className="terminal-label">Funding comparison</p>
        {onFocusFunding ? (
          <button
            type="button"
            className="terminal-label text-primary transition-colors hover:text-foreground"
            onClick={onFocusFunding}
          >
            Focus main chart
          </button>
        ) : null}
      </div>

      {data.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <span className="terminal-value text-[12px] text-muted-foreground">
            AWAITING FUNDING RATES...
          </span>
        </div>
      ) : (
        <div className="min-h-0 flex-1 p-3">
          <ChartContainer
            config={config}
            className="h-full w-full min-h-[12rem] min-w-0 !aspect-auto"
          >
            <BarChart
              data={data}
              margin={{ top: 12, right: 12, bottom: 0, left: 12 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="rgba(150, 150, 150, 0.18)"
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{
                  fill: "rgba(200, 200, 200, 0.75)",
                  fontSize: 10,
                }}
              />
              <YAxis
                tickFormatter={formatRateAxis}
                tickLine={false}
                axisLine={false}
                width={58}
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
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as
                        | FundingComparisonRow
                        | undefined;
                      return row?.label ?? "Funding";
                    }}
                    formatter={(value, _name, _item, _index, payload) => {
                      const row = payload as FundingComparisonRow;
                      return (
                        <div className="grid gap-1">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">
                              Funding
                            </span>
                            <span className="terminal-value text-[12px]">
                              {formatFundingRatePercent(
                                typeof value === "number" ? value : null,
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">Next</span>
                            <span className="terminal-value text-[12px]">
                              {formatFundingRatePercent(row.nextFundingRate)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">Mark</span>
                            <span className="terminal-value text-[12px]">
                              {formatMarkPrice(row.markPrice)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">
                              Status
                            </span>
                            <span className="terminal-value text-[12px]">
                              {row.status}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                }
                cursor={{ fill: "rgba(200, 169, 110, 0.08)" }}
              />
              <Bar
                dataKey="fundingRate"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              >
                {data.map((row) => (
                  <Cell key={row.key} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </div>
  );
}
