import { Bar, BarChart, Cell, Tooltip, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart"
import type { RiskAssessmentResponse } from "@/lib/api/types"
import { cn } from "@/lib/utils"

const BUCKET_COLORS: Record<string, string> = {
  concentration: "hsl(var(--primary))",
  liquidity: "hsl(var(--muted-foreground))",
  volatility: "hsl(var(--success))",
  counterparty: "hsl(var(--warning))",
  market: "hsl(var(--destructive))",
  operational: "hsl(var(--info))",
  credit: "hsl(var(--purple))",
}

interface RiskBucketChartProps {
  risk: RiskAssessmentResponse | undefined
  isLoading: boolean
}

export function RiskBucketChart({ risk, isLoading }: RiskBucketChartProps) {
  const buckets = risk?.buckets ?? []

  const chartData = buckets.map((b) => ({
    name: b.bucket.charAt(0).toUpperCase() + b.bucket.slice(1),
    value: b.score,
    weight: b.weight,
    status: b.status,
    reason: b.reason,
    fill: BUCKET_COLORS[b.bucket] ?? "hsl(var(--muted-foreground))",
  }))

  const config = {
    score: { label: "Score", color: "hsl(var(--primary))" },
  }

  return (
    <div className="terminal-panel p-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="terminal-label text-primary">Risk</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Assessment buckets</h2>
        </div>
        {risk?.risk_score != null && (
          <span className={cn("font-mono text-xs", risk.risk_band === "NORMAL" ? "text-success" : risk.risk_band === "CAUTION" ? "text-warning" : "text-destructive")}>
            {risk.risk_band} / {risk.risk_score}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-pulse border border-primary/30 bg-primary/10" />
          <span className="ml-2 text-xs text-muted-foreground">Loading risk assessment...</span>
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-xs text-muted-foreground">No risk bucket data available.</p>
        </div>
      ) : (
        <div className="mt-4 h-48">
          <ChartContainer config={config} className="h-full w-full !aspect-auto">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
              barCategoryGap="20%"
            >
              <XAxis type="number" hide domain={[0, 100]} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip
                content={
                  <ChartTooltipContent
                    className="rounded border border-border bg-card"
                    formatter={(_value, _name, props) => (
                      <div className="space-y-1 text-xs">
                        <p className="font-medium text-foreground">{props.payload.name}</p>
                        <p className="text-muted-foreground">
                          Score: <span className="font-mono text-foreground">{props.payload.value}</span>
                        </p>
                        <p className="text-muted-foreground">
                          Weight: <span className="font-mono text-foreground">{(props.payload.weight * 100).toFixed(0)}%</span>
                        </p>
                        {props.payload.reason && (
                          <p className="text-[0.6rem] text-muted-foreground">{props.payload.reason}</p>
                        )}
                      </div>
                    )}
                  />
                }
                cursor={{ fill: "hsl(var(--muted-foreground) / 0.08)" }}
              />
              <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={20}>
                {chartData.map((entry, i) => (
                  <Cell key={entry.name} fill={entry.fill} fillOpacity={entry.status === "veto" ? 1 : 0.7} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </div>
  )
}
