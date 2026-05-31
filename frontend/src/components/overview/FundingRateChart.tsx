import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FundingComparisonBar } from "@/components/overview/FundingComparisonBar";
import { FundingDrawer } from "@/components/overview/FundingDrawer";
import { FundingHistoryChart } from "@/components/overview/FundingHistoryChart";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { formatFundingRatePercent, parseFundingNumber } from "@/lib/arbFunding";
import type { ArbCoinDetailsResponse, ExchangeCoinDetails } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ExchangeSeriesKey =
  | "pacifica"
  | "hyperliquid"
  | "lighter"
  | "binance"
  | "bybit";

type ChartMode = "price" | "funding";

type HistoryPoint = {
  timestamp: number;
  label: string;
  pacificaPrice: number | null;
  hyperliquidPrice: number | null;
  lighterPrice: number | null;
  binancePrice: number | null;
  bybitPrice: number | null;
  pacificaFunding: number | null;
  hyperliquidFunding: number | null;
  lighterFunding: number | null;
  binanceFunding: number | null;
  bybitFunding: number | null;
};

type ExchangeSeriesMeta = {
  key: ExchangeSeriesKey;
  label: string;
  color: string;
};

type FundingComparisonRow = {
  key: ExchangeSeriesKey;
  label: string;
  fundingRate: number;
  nextFundingRate: number | null;
  markPrice: number | null;
  status: string;
  fill: string;
};

const EXCHANGE_SERIES: ExchangeSeriesMeta[] = [
  { key: "pacifica", label: "Pacifica", color: "#C8A96E" },
  { key: "hyperliquid", label: "Hyperliquid", color: "#5C6B7A" },
  { key: "lighter", label: "Lighter", color: "#4A7C59" },
  { key: "binance", label: "Binance", color: "#A8A89E" },
  { key: "bybit", label: "Bybit", color: "#8B3A3A" },
];

type FundingRateChartProps = {
  symbol: string;
  details: ArbCoinDetailsResponse | undefined;
  isLoading: boolean;
  visibility: Record<ExchangeSeriesKey, boolean>;
  onToggleExchange: (exchange: ExchangeSeriesKey) => void;
};

function readFundingRate(details: ExchangeCoinDetails | null | undefined) {
  return parseFundingNumber(details?.funding_rate);
}

function readMarkPrice(details: ExchangeCoinDetails | null | undefined) {
  return parseFundingNumber(details?.mark_price);
}

function readNumericValue(value: string | null | undefined) {
  return parseFundingNumber(value);
}

function formatRateAxis(value: number) {
  return `${(value * 100).toFixed(3)}%`;
}

function formatMarketValue(value: string | number | null | undefined) {
  const parsed =
    typeof value === "number" ? value : parseFundingNumber(value ?? null);
  if (parsed === null) {
    return "-";
  }

  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: parsed >= 1000 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatTimestampLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toHistoryPoint(details: ArbCoinDetailsResponse): HistoryPoint {
  const timestamp = details.timestamp;
  return {
    timestamp,
    label: formatTimestampLabel(timestamp),
    pacificaPrice: readMarkPrice(details.pacifica),
    hyperliquidPrice: readMarkPrice(details.hyperliquid),
    lighterPrice: readMarkPrice(details.lighter),
    binancePrice: readMarkPrice(details.binance),
    bybitPrice: readMarkPrice(details.bybit),
    pacificaFunding: readFundingRate(details.pacifica),
    hyperliquidFunding: readFundingRate(details.hyperliquid),
    lighterFunding: readFundingRate(details.lighter),
    binanceFunding: readFundingRate(details.binance),
    bybitFunding: readFundingRate(details.bybit),
  };
}

function firstVenueWithData(details: ArbCoinDetailsResponse | undefined) {
  if (!details) {
    return null;
  }

  return (
    details.pacifica ??
    details.hyperliquid ??
    details.lighter ??
    details.binance ??
    details.bybit ??
    null
  );
}

function historyFieldName(seriesKey: ExchangeSeriesKey, mode: ChartMode) {
  return `${seriesKey}${mode === "price" ? "Price" : "Funding"}` as const;
}

export function FundingRateChart({
  symbol,
  details,
  isLoading,
  visibility,
  onToggleExchange,
}: FundingRateChartProps) {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [mode, setMode] = useState<ChartMode>("price");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setHistory([]);
    setMode("price");
    setDrawerOpen(false);
  }, [symbol]);

  useEffect(() => {
    if (!details) {
      return;
    }

    const nextPoint = toHistoryPoint(details);
    setHistory((current) => {
      const previous = current[current.length - 1];
      if (previous?.timestamp === nextPoint.timestamp) {
        return [...current.slice(0, -1), nextPoint];
      }
      return [...current, nextPoint].slice(-60);
    });
  }, [details]);

  const visibleSeries = EXCHANGE_SERIES.filter(
    (series) => visibility[series.key],
  );

  const mainChartConfig = useMemo(
    () =>
      EXCHANGE_SERIES.reduce<Record<string, { label: string; color: string }>>(
        (acc, series) => {
          acc[series.key] = {
            label: series.label,
            color: series.color,
          };
          return acc;
        },
        {},
      ),
    [],
  );

  const fundingOnlyConfig = useMemo(
    () =>
      EXCHANGE_SERIES.reduce<Record<string, { label: string; color: string }>>(
        (acc, series) => {
          acc[series.key] = {
            label: series.label,
            color: series.color,
          };
          return acc;
        },
        {},
      ),
    [],
  );

  const fundingComparisonConfig = useMemo(
    () => ({
      fundingRate: {
        label: "Funding rate",
        color: "#C8A96E",
      },
    }),
    [],
  );

  const chartData = useMemo(() => {
    return history.map((point) =>
      EXCHANGE_SERIES.reduce<Record<string, number | string | null>>(
        (acc, series) => {
          acc.label = point.label;
          acc.timestamp = point.timestamp;
          acc[series.key] =
            mode === "price"
              ? point[historyFieldName(series.key, "price")]
              : point[historyFieldName(series.key, "funding")];
          return acc;
        },
        {},
      ),
    );
  }, [history, mode]);

  const fundingHistoryData = useMemo(() => {
    return history.map((point) =>
      EXCHANGE_SERIES.reduce<Record<string, number | string | null>>(
        (acc, series) => {
          acc.label = point.label;
          acc.timestamp = point.timestamp;
          acc[series.key] = point[historyFieldName(series.key, "funding")];
          return acc;
        },
        {},
      ),
    );
  }, [history]);

  const yDomain = useMemo(() => {
    const values = chartData.flatMap((point) =>
      visibleSeries
        .map((series) => point[series.key])
        .filter((value): value is number => typeof value === "number"),
    );

    if (values.length === 0) {
      return mode === "price" ? ([0, 1] as const) : ([-0.0005, 0.0005] as const);
    }

    if (mode === "price") {
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      const range = maximum - minimum;
      const padding = range > 0 ? range * 0.16 : 0.25;
      return [minimum - padding, maximum + padding] as const;
    }

    const max = Math.max(...values.map((value) => Math.abs(value)));
    const padding = max * 0.28 || 0.00015;
    return [-(max + padding), max + padding] as const;
  }, [chartData, mode, visibleSeries]);

  const exchangeCards = useMemo(() => {
    if (!details) {
      return [];
    }

    return EXCHANGE_SERIES.map((series) => {
      const source = details[series.key];
      return {
        ...series,
        fundingRate: readFundingRate(source),
        nextFundingRate: parseFundingNumber(source?.next_funding_rate),
        markPrice: source?.mark_price ?? null,
        indexPrice: source?.index_price ?? null,
        status: source?.status ?? "offline",
      };
    });
  }, [details]);

  const fundingComparison = useMemo<FundingComparisonRow[]>(() => {
    return exchangeCards
      .filter(
        (exchange): exchange is (typeof exchangeCards)[number] & {
          fundingRate: number;
        } => exchange.fundingRate !== null,
      )
      .map((exchange) => ({
        key: exchange.key,
        label: exchange.label,
        fundingRate: exchange.fundingRate,
        nextFundingRate: exchange.nextFundingRate,
        markPrice: readNumericValue(exchange.markPrice),
        status: exchange.status,
        fill: exchange.color,
      }));
  }, [exchangeCards]);

  const primaryVenue = firstVenueWithData(details);
  const liveSources = exchangeCards.filter(
    (exchange) => exchange.fundingRate !== null || exchange.markPrice !== null,
  ).length;
  const latestMark = primaryVenue?.mark_price ?? null;
  const latestIndex = primaryVenue?.index_price ?? null;
  const latestFunding = primaryVenue?.funding_rate ?? null;
  const latestNextFunding = primaryVenue?.next_funding_rate ?? null;
  const activeViewLabel = mode === "price" ? "Price history" : "Funding history";
  const activeViewDetail =
    mode === "price"
      ? "Raw mark-price history for the selected token."
      : "Rolling funding-rate history across the visible exchanges.";

  return (
    <section
      data-testid="overview-funding-chart"
      className="flex min-h-0 flex-1 flex-col overflow-visible bg-card"
    >
      <div className="shrink-0 border-b border-border bg-surface-2">
        <div className="flex flex-col gap-2 px-3 py-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="terminal-label">Center Panel</span>
              <span className="truncate font-mono text-[16px] text-foreground">
                {symbol || "Funding"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="terminal-label">Mark</span>
                <span className="terminal-value text-[12px]">
                  {formatMarketValue(latestMark)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="terminal-label">Index</span>
                <span className="terminal-value text-[12px]">
                  {formatMarketValue(latestIndex)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="terminal-label">Funding</span>
                <span className="terminal-value text-[12px]">
                  {formatFundingRatePercent(readNumericValue(latestFunding))}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="terminal-label">Next</span>
                <span className="terminal-value text-[12px]">
                  {formatFundingRatePercent(
                    readNumericValue(latestNextFunding),
                  )}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-[12px]">
            <span className="terminal-label">View</span>
            <Button
              data-testid="overview-market-view-toggle"
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-8 px-3 text-[10px]",
                mode === "price"
                  ? "border-primary bg-secondary text-primary"
                  : "border-border bg-card text-muted-foreground",
              )}
              onClick={() => setMode("price")}
            >
              Market
            </Button>
            <Button
              data-testid="overview-funding-view-toggle"
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-8 px-3 text-[10px]",
                mode === "funding"
                  ? "border-primary bg-secondary text-primary"
                  : "border-border bg-card text-muted-foreground",
              )}
              onClick={() => setMode("funding")}
            >
              Funding
            </Button>
            <span className="terminal-label">Sources</span>
            <span className="terminal-value text-[12px]">{liveSources}</span>
            <span className="terminal-label">Prints</span>
            <span className="terminal-value text-[12px]">{history.length}</span>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-b border-border bg-card px-3 py-2">
        <div className="flex flex-wrap gap-2">
          {EXCHANGE_SERIES.map((series) => (
            <Button
              key={series.key}
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-8 px-3 text-[10px]",
                visibility[series.key]
                  ? "border-primary bg-secondary text-primary"
                  : "border-border bg-card text-muted-foreground",
              )}
              onClick={() => onToggleExchange(series.key)}
            >
              <span
                className="h-2 w-2"
                style={{ backgroundColor: series.color }}
              />
              {series.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-visible border-b border-border bg-background">
        {!isLoading && history.length === 0 ? (
          <div className="flex h-full min-h-[14rem] items-center justify-center px-6 text-center sm:min-h-[16rem] xl:min-h-[18rem]">
            <span className="terminal-value text-[12px] text-muted-foreground">
              AWAITING MARKET DATA...
            </span>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col overflow-visible">
            <div className="shrink-0 border-b border-border bg-surface-2 px-3 py-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p
                    data-testid="overview-chart-mode-label"
                    className="terminal-label text-primary"
                  >
                    {activeViewLabel}
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {activeViewDetail}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-[10px]"
                  onClick={() =>
                    setMode((current) =>
                      current === "price" ? "funding" : "price",
                    )
                  }
                >
                  Swap Main Chart
                </Button>
              </div>
            </div>

            <div className="p-3 pb-2 sm:p-4 sm:pb-2">
              <div className="h-[18rem] sm:h-[24rem] xl:h-[34rem]">
                <ChartContainer
                  data-testid="overview-funding-plot"
                  config={mainChartConfig}
                  className="h-full w-full min-w-0 !aspect-auto"
                >
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 12, right: 20, bottom: 18, left: 70 }}
                  >
                    <CartesianGrid
                      vertical={true}
                      strokeDasharray="3 3"
                      stroke="rgba(150, 150, 150, 0.25)"
                      horizontalPoints={[]}
                    />
                    <XAxis
                      dataKey="label"
                      interval="preserveStartEnd"
                      minTickGap={32}
                      tickMargin={8}
                      tickLine={true}
                      axisLine={true}
                      stroke="rgba(200, 200, 200, 0.5)"
                      tick={{ fill: "rgba(200, 200, 200, 0.8)", fontSize: 10 }}
                      height={34}
                    />
                    <YAxis
                      domain={yDomain}
                      tickFormatter={
                        mode === "price" ? formatMarketValue : formatRateAxis
                      }
                      tickLine={true}
                      axisLine={true}
                      width={65}
                      stroke="rgba(200, 200, 200, 0.5)"
                      tick={{ fill: "rgba(200, 200, 200, 0.8)", fontSize: 11 }}
                      label={{
                        value: mode === "price" ? "Mark Price" : "Funding Rate",
                        angle: -90,
                        position: "insideLeft",
                        offset: 10,
                        style: { fill: "rgba(200, 200, 200, 0.7)" },
                      }}
                    />
                    {mode === "funding" ? (
                      <ReferenceLine
                        y={0}
                        stroke="rgba(200, 169, 110, 1)"
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        label={{
                          value: "0%",
                          position: "right",
                          fill: "rgba(200, 169, 110, 0.8)",
                          fontSize: 10,
                        }}
                      />
                    ) : null}
                    <Tooltip
                      content={
                        <ChartTooltipContent
                          className="rounded-lg border-2 border-primary bg-card/95 shadow-xl"
                          formatter={(value, name) => {
                            const exchangeName =
                              EXCHANGE_SERIES.find((series) => series.key === name)
                                ?.label || String(name);
                            return (
                              <div className="flex w-full items-center justify-between gap-4">
                                <span className="font-semibold text-primary">
                                  {exchangeName}
                                </span>
                                <span className="terminal-value text-[12px] font-mono font-bold">
                                  {mode === "price"
                                    ? formatMarketValue(
                                        typeof value === "number" ? value : null,
                                      )
                                    : formatFundingRatePercent(
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
                    {visibleSeries.map((series) => (
                      <Line
                        key={series.key}
                        type="natural"
                        dataKey={series.key}
                        stroke={series.color}
                        strokeWidth={3}
                        dot={{
                          r: 4,
                          fill: series.color,
                          strokeWidth: 2,
                          stroke: "#000",
                        }}
                        activeDot={{ r: 6, strokeWidth: 2 }}
                        connectNulls
                        isAnimationActive={false}
                      />
                    ))}
                  </ComposedChart>
                </ChartContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      <FundingDrawer
        open={drawerOpen}
        onToggle={() => {
          setDrawerOpen((current) => !current);
          setMode("funding");
        }}
      >
        <div className="grid h-full min-h-0 grid-cols-1 xl:grid-cols-2">
          <div className="min-h-0 border-b border-border xl:border-b-0 xl:border-r">
            <FundingHistoryChart
              data={fundingHistoryData}
              series={visibleSeries}
              config={fundingOnlyConfig}
            />
          </div>
          <div className="min-h-0">
            <FundingComparisonBar
              data={fundingComparison}
              config={fundingComparisonConfig}
              onFocusFunding={() => setMode("funding")}
            />
          </div>
        </div>
      </FundingDrawer>

      <div
        data-testid="overview-funding-summary"
        className="grid shrink-0 auto-cols-[minmax(12rem,1fr)] grid-flow-col gap-px overflow-x-auto bg-border"
      >
        {exchangeCards.map((exchange) => (
          <div
            key={exchange.key}
            className={cn(
              "min-w-0 bg-card px-3 py-2",
              !visibility[exchange.key] && "opacity-55",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2"
                  style={{ backgroundColor: exchange.color }}
                />
                <span className="terminal-label text-foreground">
                  {exchange.label}
                </span>
              </div>
              <span className="terminal-label">{exchange.status}</span>
            </div>
            <div className="mt-2 grid gap-1 text-[12px]">
              <div className="flex items-center justify-between gap-3">
                <span className="terminal-label">Funding</span>
                <span className="terminal-value text-[12px]">
                  {formatFundingRatePercent(exchange.fundingRate)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="terminal-label">Next</span>
                <span className="terminal-value text-[12px]">
                  {formatFundingRatePercent(exchange.nextFundingRate)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="terminal-label">Mark</span>
                <span className="terminal-value text-[12px]">
                  {formatMarketValue(exchange.markPrice)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="terminal-label">Index</span>
                <span className="terminal-value text-[12px]">
                  {formatMarketValue(exchange.indexPrice)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
