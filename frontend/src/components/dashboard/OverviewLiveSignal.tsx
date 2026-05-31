import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart";
import {
  api,
  type ArbCoinDetailsResponse,
  type FundingRateItem,
} from "@/lib/api";

type OverviewLiveSignalProps = {
  rates: FundingRateItem[];
};

type ChartRow = {
  symbol: string;
  pacificaPrice: number | null;
  hyperliquidPrice: number | null;
  lighterPrice: number | null;
  binancePrice: number | null;
  bybitPrice: number | null;
  pacificaFundingRate: number | null;
  hyperliquidFundingRate: number | null;
  lighterFundingRate: number | null;
  binanceFundingRate: number | null;
  bybitFundingRate: number | null;
  hyperliquidGapBps: number | null;
  lighterGapBps: number | null;
  binanceGapBps: number | null;
  bybitGapBps: number | null;
  widestGapBps: number;
  priceVariationPct: number | null;
};

type TooltipPayloadItem = {
  color?: string;
  dataKey?: string;
  value?: number | string | null;
  payload: ChartRow;
};

const chartConfig = {
  pacificaPrice: {
    label: "Pacifica price",
    color: "hsl(var(--primary))",
  },
  hyperliquidPrice: {
    label: "Hyperliquid price",
    color: "hsl(var(--chart-2))",
  },
  lighterPrice: {
    label: "Lighter perp price",
    color: "hsl(var(--chart-4))",
  },
  binancePrice: {
    label: "Binance price",
    color: "hsl(44 90% 62%)",
  },
  bybitPrice: {
    label: "Bybit price",
    color: "hsl(186 72% 52%)",
  },
  hyperliquidGapBps: {
    label: "Hyperliquid gap",
    color: "hsl(var(--chart-3))",
  },
  lighterGapBps: {
    label: "Lighter perp gap",
    color: "hsl(var(--chart-5))",
  },
  binanceGapBps: {
    label: "Binance gap",
    color: "hsl(44 90% 48%)",
  },
  bybitGapBps: {
    label: "Bybit gap",
    color: "hsl(186 72% 40%)",
  },
};

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatFundingRate(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return `${(value * 100).toFixed(4)}%`;
}

function formatPrice(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 1000 ? 0 : 2,
    minimumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

function formatGapBps(value: number | null): string {
  if (value === null) {
    return "-";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)} bps`;
}

function formatVariationPct(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return `${value.toFixed(2)}%`;
}

function computeVariationPct(values: Array<number | null>): number | null {
  const numericValues = values.filter(
    (value): value is number => value !== null,
  );
  if (numericValues.length < 2) {
    return null;
  }

  const highest = Math.max(...numericValues);
  const lowest = Math.min(...numericValues);
  const baseline = numericValues[0] || highest;
  if (!baseline) {
    return null;
  }

  return ((highest - lowest) / baseline) * 100;
}

function computeGapBps(
  pacificaPrice: number | null,
  venuePrice: number | null,
  fallback?: number | null,
): number | null {
  if (fallback !== null && fallback !== undefined) {
    return fallback;
  }

  if (pacificaPrice === null || venuePrice === null || venuePrice === 0) {
    return null;
  }

  return ((pacificaPrice - venuePrice) / venuePrice) * 10_000;
}

function getGapCandidates(
  row: ChartRow,
): Array<{ venue: string; gapBps: number }> {
  return [
    { venue: "Hyperliquid", gapBps: row.hyperliquidGapBps },
    { venue: "Lighter perp", gapBps: row.lighterGapBps },
    { venue: "Binance", gapBps: row.binanceGapBps },
    { venue: "Bybit", gapBps: row.bybitGapBps },
  ].filter(
    (
      candidate,
    ): candidate is {
      venue: string;
      gapBps: number;
    } => candidate.gapBps !== null,
  );
}

function buildChartRows(details: ArbCoinDetailsResponse[]): ChartRow[] {
  return details
    .map((detail) => {
      const pacificaPrice = toNumber(detail.pacifica.mark_price);
      const hyperliquidPrice = toNumber(detail.hyperliquid?.mark_price);
      const lighterPrice = toNumber(detail.lighter?.mark_price);
      const binancePrice = toNumber(detail.binance?.mark_price);
      const bybitPrice = toNumber(detail.bybit?.mark_price);
      const hyperliquidGapBps = computeGapBps(
        pacificaPrice,
        hyperliquidPrice,
        detail.mark_price_spread_bps_vs_hyperliquid,
      );
      const lighterGapBps = computeGapBps(
        pacificaPrice,
        lighterPrice,
        detail.mark_price_spread_bps_vs_lighter,
      );
      const binanceGapBps = computeGapBps(pacificaPrice, binancePrice);
      const bybitGapBps = computeGapBps(pacificaPrice, bybitPrice);
      const widestGapBps = Math.max(
        Math.abs(hyperliquidGapBps ?? 0),
        Math.abs(lighterGapBps ?? 0),
        Math.abs(binanceGapBps ?? 0),
        Math.abs(bybitGapBps ?? 0),
      );

      return {
        symbol: detail.symbol,
        pacificaPrice,
        hyperliquidPrice,
        lighterPrice,
        binancePrice,
        bybitPrice,
        pacificaFundingRate: toNumber(detail.pacifica.funding_rate),
        hyperliquidFundingRate: toNumber(detail.hyperliquid?.funding_rate),
        lighterFundingRate: toNumber(detail.lighter?.funding_rate),
        binanceFundingRate: toNumber(detail.binance?.funding_rate),
        bybitFundingRate: toNumber(detail.bybit?.funding_rate),
        hyperliquidGapBps,
        lighterGapBps,
        binanceGapBps,
        bybitGapBps,
        widestGapBps,
        priceVariationPct: computeVariationPct([
          pacificaPrice,
          hyperliquidPrice,
          lighterPrice,
          binancePrice,
          bybitPrice,
        ]),
      };
    })
    .sort((left, right) => right.widestGapBps - left.widestGapBps)
    .slice(0, 6);
}

function OverviewGraphTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const row = payload[0]?.payload;
  if (!row) {
    return null;
  }

  return (
    <div className="min-w-[16rem] rounded-xl border border-border/60 bg-background/95 p-3 text-xs shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">
            Cross-exchange mark prices and live spread gaps
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Variation
          </p>
          <p className="font-mono text-foreground">
            {formatVariationPct(row.priceVariationPct)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-5">
        <TooltipMetric
          label="Pacifica"
          price={row.pacificaPrice}
          funding={row.pacificaFundingRate}
          accentClass="text-primary"
        />
        <TooltipMetric
          label="Hyperliquid"
          price={row.hyperliquidPrice}
          funding={row.hyperliquidFundingRate}
          gap={row.hyperliquidGapBps}
          accentClass="text-[hsl(var(--chart-2))]"
        />
        <TooltipMetric
          label="Lighter perp"
          price={row.lighterPrice}
          funding={row.lighterFundingRate}
          gap={row.lighterGapBps}
          accentClass="text-[hsl(var(--chart-4))]"
        />
        <TooltipMetric
          label="Binance"
          price={row.binancePrice}
          funding={row.binanceFundingRate}
          gap={row.binanceGapBps}
          accentClass="text-[hsl(44_90%_62%)]"
        />
        <TooltipMetric
          label="Bybit"
          price={row.bybitPrice}
          funding={row.bybitFundingRate}
          gap={row.bybitGapBps}
          accentClass="text-[hsl(186_72%_52%)]"
        />
      </div>
    </div>
  );
}

function TooltipMetric({
  label,
  price,
  funding,
  gap,
  accentClass,
}: {
  label: string;
  price: number | null;
  funding: number | null;
  gap?: number | null;
  accentClass: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/80 p-2">
      <p className={`text-[10px] uppercase tracking-[0.16em] ${accentClass}`}>
        {label}
      </p>
      <p className="mt-1 font-mono text-foreground">{formatPrice(price)}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        FR {formatFundingRate(funding)}
      </p>
      {gap !== undefined ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Gap {formatGapBps(gap ?? null)}
        </p>
      ) : null}
    </div>
  );
}

export function OverviewLiveSignal({ rates }: OverviewLiveSignalProps) {
  const symbols = useMemo(() => {
    return rates
      .map((rate) => ({
        symbol: rate.symbol,
        absFunding: Math.abs(Number(rate.funding_rate || 0)),
      }))
      .sort((left, right) => right.absFunding - left.absFunding)
      .slice(0, 6)
      .map((item) => item.symbol);
  }, [rates]);

  const detailsQueries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["arb", "details", symbol],
      queryFn: () => api.arb.getCoinDetails(symbol),
      refetchInterval: 10_000,
      staleTime: 8_000,
    })),
  });

  const chartRows = useMemo(() => {
    const details = detailsQueries
      .map((query) => query.data)
      .filter((detail): detail is ArbCoinDetailsResponse => Boolean(detail));

    return buildChartRows(details);
  }, [detailsQueries]);

  const loadingDetails = detailsQueries.some((query) => query.isLoading);

  const strongestGap = useMemo(() => {
    return chartRows.reduce<{
      symbol: string;
      venue: string;
      gapBps: number;
    } | null>((best, row) => {
      const candidates = getGapCandidates(row);

      return candidates.reduce<typeof best>((currentBest, candidate) => {
        if (
          !currentBest ||
          Math.abs(candidate.gapBps) > Math.abs(currentBest.gapBps)
        ) {
          return {
            symbol: row.symbol,
            venue: candidate.venue,
            gapBps: candidate.gapBps,
          };
        }

        return currentBest;
      }, best);
    }, null);
  }, [chartRows]);

  const widestVariation = useMemo(() => {
    return chartRows.reduce<ChartRow | null>((best, row) => {
      if (!best) {
        return row;
      }

      return (row.priceVariationPct ?? 0) > (best.priceVariationPct ?? 0)
        ? row
        : best;
    }, null);
  }, [chartRows]);

  return (
    <div
      data-testid="overview-live-signal"
      className="panel-strong flex min-h-[42rem] flex-col overflow-visible border border-border/80 p-4 sm:p-5"
    >
      <div className="shrink-0 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Live price variation
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-foreground">
            Cross-exchange mark-price view for Pacifica, Hyperliquid, Lighter
            perp, Binance, and Bybit with live funding context and spread-gap
            bars.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Widest gap
            </p>
            <p className="mt-1 font-mono text-sm text-foreground">
              {strongestGap ? strongestGap.symbol : "--"}
            </p>
            <p className="text-xs text-muted-foreground">
              {strongestGap
                ? `${strongestGap.venue} ${formatGapBps(strongestGap.gapBps)}`
                : "Waiting for exchange details"}
            </p>
          </div>
          <div className="rounded-lg border border-border/80 bg-background/40 px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Price variation
            </p>
            <p className="mt-1 font-mono text-sm text-foreground">
              {widestVariation ? widestVariation.symbol : "--"}
            </p>
            <p className="text-xs text-muted-foreground">
              {widestVariation
                ? formatVariationPct(widestVariation.priceVariationPct)
                : "Waiting for mark prices"}
            </p>
          </div>
        </div>
      </div>

      <div className="panel-muted mt-4 flex min-h-0 flex-col overflow-visible rounded-lg border border-border/70 p-3 sm:p-4">
        <div
          data-testid="overview-live-signal-chart"
          className="relative h-[22rem] shrink-0 overflow-hidden rounded-[1rem] border border-border/60 bg-background/15 sm:h-[24rem] xl:h-[26rem]"
        >
          {chartRows.length > 0 ? (
            <ChartContainer
              config={chartConfig}
              className="h-full w-full !aspect-auto"
            >
              <ComposedChart
                data={chartRows}
                margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="4 4" />
                <XAxis
                  dataKey="symbol"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  minTickGap={24}
                />
                <YAxis
                  yAxisId="price"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => formatPrice(value)}
                  width={74}
                />
                <YAxis
                  yAxisId="gap"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => `${value.toFixed(1)}bps`}
                  width={64}
                />
                <ReferenceLine
                  yAxisId="gap"
                  y={0}
                  stroke="hsl(var(--border))"
                  strokeDasharray="5 5"
                />
                <ChartTooltip
                  cursor={{
                    stroke: "hsl(var(--border))",
                    strokeDasharray: "3 3",
                  }}
                  content={<OverviewGraphTooltip />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  yAxisId="gap"
                  dataKey="hyperliquidGapBps"
                  fill="var(--color-hyperliquidGapBps)"
                  radius={[6, 6, 0, 0]}
                  barSize={12}
                />
                <Bar
                  yAxisId="gap"
                  dataKey="lighterGapBps"
                  fill="var(--color-lighterGapBps)"
                  radius={[6, 6, 0, 0]}
                  barSize={12}
                />
                <Bar
                  yAxisId="gap"
                  dataKey="binanceGapBps"
                  fill="var(--color-binanceGapBps)"
                  radius={[6, 6, 0, 0]}
                  barSize={12}
                />
                <Bar
                  yAxisId="gap"
                  dataKey="bybitGapBps"
                  fill="var(--color-bybitGapBps)"
                  radius={[6, 6, 0, 0]}
                  barSize={12}
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="pacificaPrice"
                  stroke="var(--color-pacificaPrice)"
                  strokeWidth={3}
                  dot={{ r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="hyperliquidPrice"
                  stroke="var(--color-hyperliquidPrice)"
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="lighterPrice"
                  stroke="var(--color-lighterPrice)"
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="binancePrice"
                  stroke="var(--color-binancePrice)"
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="bybitPrice"
                  stroke="var(--color-bybitPrice)"
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </ComposedChart>
            </ChartContainer>
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
              {loadingDetails
                ? "Loading exchange snapshots for the overview graph..."
                : "Waiting for exchange price variation data from the backend."}
            </div>
          )}
        </div>

        <div
          data-testid="overview-live-signal-details"
          className="mt-3 grid gap-2 pr-1 md:grid-cols-2"
        >
          {chartRows.length > 0 ? (
            chartRows.map((row) => {
              const bestGap =
                getGapCandidates(row).sort(
                  (left, right) =>
                    Math.abs(right.gapBps) - Math.abs(left.gapBps),
                )[0] ?? null;

              return (
                <div
                  key={row.symbol}
                  className="rounded-xl border border-border/70 bg-background/45 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm text-foreground">
                        {row.symbol}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Variation {formatVariationPct(row.priceVariationPct)}
                      </p>
                    </div>
                    <div
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] ${
                        !bestGap
                          ? "bg-background/60 text-muted-foreground"
                          : bestGap.gapBps > 0
                            ? "bg-success/15 text-up"
                            : "bg-danger/15 text-down"
                      }`}
                    >
                      {bestGap ? (
                        bestGap.gapBps > 0 ? (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5" />
                        )
                      ) : null}
                      Best gap{" "}
                      {bestGap
                        ? `${bestGap.venue} ${formatGapBps(bestGap.gapBps)}`
                        : "-"}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    <MetricPill
                      label="Pacifica"
                      price={row.pacificaPrice}
                      fundingRate={row.pacificaFundingRate}
                      accentClass="text-primary"
                    />
                    <MetricPill
                      label="Hyperliquid"
                      price={row.hyperliquidPrice}
                      fundingRate={row.hyperliquidFundingRate}
                      gapBps={row.hyperliquidGapBps}
                      accentClass="text-[hsl(var(--chart-2))]"
                    />
                    <MetricPill
                      label="Lighter perp"
                      price={row.lighterPrice}
                      fundingRate={row.lighterFundingRate}
                      gapBps={row.lighterGapBps}
                      accentClass="text-[hsl(var(--chart-4))]"
                    />
                    <MetricPill
                      label="Binance"
                      price={row.binancePrice}
                      fundingRate={row.binanceFundingRate}
                      gapBps={row.binanceGapBps}
                      accentClass="text-[hsl(44_90%_62%)]"
                    />
                    <MetricPill
                      label="Bybit"
                      price={row.bybitPrice}
                      fundingRate={row.bybitFundingRate}
                      gapBps={row.bybitGapBps}
                      accentClass="text-[hsl(186_72%_52%)]"
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-xs text-muted-foreground">
              {loadingDetails
                ? "Loading exchange details..."
                : "No exchange comparison details available."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricPill({
  label,
  price,
  fundingRate,
  gapBps,
  accentClass,
}: {
  label: string;
  price: number | null;
  fundingRate: number | null;
  gapBps?: number | null;
  accentClass: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/70 p-2">
      <p className={`text-[10px] uppercase tracking-[0.16em] ${accentClass}`}>
        {label}
      </p>
      <p className="mt-1 font-mono text-foreground">{formatPrice(price)}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        FR {formatFundingRate(fundingRate)}
      </p>
      {gapBps !== undefined ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Gap {formatGapBps(gapBps ?? null)}
        </p>
      ) : null}
    </div>
  );
}
