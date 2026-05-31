import { Cell, Pie, PieChart, Tooltip } from "recharts"
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart"
import type { PortfolioPosition, PortfolioSnapshotResponse } from "@/lib/api/types"
import { cn } from "@/lib/utils"

const COLORS = [
  "#C8A96E", "#5C6B7A", "#4A7C59", "#A8A89E", "#8B3A3A",
  "#6E8BC8", "#C86EA9", "#6EC8A9", "#C8A96E", "#7A5C6B",
]

interface PortfolioAllocationChartProps {
  portfolio: PortfolioSnapshotResponse | undefined
  isLoading: boolean
}

export function PortfolioAllocationChart({ portfolio, isLoading }: PortfolioAllocationChartProps) {
  const positions = portfolio?.positions ?? []

  const chartData = positions
    .filter((p) => p.weight != null && Number(p.weight) > 0)
    .map((p, i) => ({
      name: p.asset_symbol,
      value: Number(p.weight),
      valueUsd: p.value_usd ? Number(p.value_usd) : null,
      fill: COLORS[i % COLORS.length],
    }))
    .sort((a, b) => b.value - a.value)

  const config = chartData.reduce(
    (acc, item) => {
      acc[item.name] = { label: item.name, color: item.fill }
      return acc
    },
    {} as Record<string, { label: string; color: string }>,
  )

  return (
    <div className="terminal-panel p-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="terminal-label text-primary">Portfolio</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Allocation breakdown</h2>
        </div>
        {portfolio?.total_value_usd && (
          <span className="font-mono text-xs text-muted-foreground">
            ${Number(portfolio.total_value_usd).toLocaleString()}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-pulse rounded-full border border-primary/30 bg-primary/10" />
          <span className="ml-2 text-xs text-muted-foreground">Loading allocation...</span>
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-xs text-muted-foreground">No position data available.</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-4">
          <div className="h-44">
            <ChartContainer config={config} className="h-full w-full !aspect-auto">
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  strokeWidth={1}
                  stroke="hsl(var(--border))"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  content={
                    <ChartTooltipContent
                      className="rounded border border-border bg-card"
                      formatter={(value, name) => (
                        <div className="flex items-center justify-between gap-4 text-xs">
                          <span className="font-medium text-foreground">{name}</span>
                          <span className="font-mono text-muted-foreground">{(Number(value) * 100).toFixed(1)}%</span>
                        </div>
                      )}
                    />
                  }
                />
              </PieChart>
            </ChartContainer>
          </div>

          <div className="flex flex-col justify-center gap-1.5">
            {chartData.map((item) => {
              const position = positions.find((p) => p.asset_symbol === item.name)
              return (
                <div key={item.name} className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} />
                  <span className="text-[0.65rem] text-muted-foreground">{item.name}</span>
                  <span className={cn("font-mono text-[0.6rem] font-medium", positions.length > 0 && position?.drift_status === "over_weight" ? "text-warning" : position?.drift_status === "under_weight" ? "text-destructive" : "text-foreground")}>
                    {(item.value * 100).toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
