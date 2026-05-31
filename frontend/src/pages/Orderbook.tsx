import { useEffect, useMemo, useState } from "react";

import {
  EmptyPanelState,
  PanelCard,
  StatusPillRow,
} from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useOrderbookImbalance,
  useOrderbookSignal,
  useOrderbookSnapshot,
  useOrderbookSymbols,
  useOrderbookWalls,
} from "@/hooks/useOrderbook";
import { logger } from "@/lib/logger";

function formatApiError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function toPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignalLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function getSignalTone(value: string): "up" | "down" | undefined {
  if (value.includes("long") || value === "bullish" || value === "support") {
    return "up";
  }
  if (
    value.includes("short") ||
    value === "bearish" ||
    value === "resistance"
  ) {
    return "down";
  }
  return undefined;
}

export default function Orderbook() {
  const symbolsQuery = useOrderbookSymbols();
  const [symbol, setSymbol] = useState("");

  const availableSymbols = useMemo(
    () => symbolsQuery.data?.symbols ?? [],
    [symbolsQuery.data?.symbols],
  );

  useEffect(() => {
    if (availableSymbols.length === 0) {
      if (symbol) {
        setSymbol("");
      }
      return;
    }
    if (!availableSymbols.includes(symbol)) {
      setSymbol(availableSymbols[0]);
    }
  }, [availableSymbols, symbol]);

  useEffect(() => {
    logger.debug("orderbook.symbol.selected", { symbol });
  }, [symbol]);

  const snapshotQuery = useOrderbookSnapshot(symbol, Boolean(symbol));
  const imbalanceQuery = useOrderbookImbalance(symbol, Boolean(symbol));
  const signalQuery = useOrderbookSignal(symbol, Boolean(symbol));
  const wallsQuery = useOrderbookWalls(symbol, Boolean(symbol));

  const snapshot = snapshotQuery.data;
  const bids = useMemo(() => snapshot?.bids ?? [], [snapshot?.bids]);
  const asks = useMemo(() => snapshot?.asks ?? [], [snapshot?.asks]);

  const depthBids = useMemo(() => {
    let runningTotal = 0;
    return bids.slice(0, 15).map((level) => {
      runningTotal += level.amount;
      return { ...level, total: runningTotal };
    });
  }, [bids]);

  const depthAsks = useMemo(() => {
    let runningTotal = 0;
    return asks.slice(0, 15).map((level) => {
      runningTotal += level.amount;
      return { ...level, total: runningTotal };
    });
  }, [asks]);

  const maxBidTotal =
    depthBids.length > 0 ? depthBids[depthBids.length - 1].total : 0;
  const maxAskTotal =
    depthAsks.length > 0 ? depthAsks[depthAsks.length - 1].total : 0;
  const maxTotal = Math.max(maxBidTotal, maxAskTotal, 1);
  const spread = bids[0] && asks[0] ? asks[0].price - bids[0].price : null;
  const imbalance = imbalanceQuery.data;
  const signal = signalQuery.data;
  const walls = wallsQuery.data;
  const currentSignal = signal?.execution_signal ?? imbalance?.signal ?? "wait";
  const wallCount =
    (walls?.bid_walls.length ?? 0) + (walls?.ask_walls.length ?? 0);
  const hasError =
    snapshotQuery.isError ||
    imbalanceQuery.isError ||
    signalQuery.isError ||
    wallsQuery.isError;

  return (
    <div
      data-testid="orderbook-page"
      className="w-full flex flex-col gap-3 overflow-x-hidden sm:gap-4"
    >
      <div
        data-testid="orderbook-toolbar"
        className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-border/70 bg-surface-2/40 px-4 py-3"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger
              data-testid="orderbook-symbol-select"
              className="h-9 w-44 border-border bg-background/80 text-xs"
            >
              <SelectValue placeholder="Select symbol" />
            </SelectTrigger>
            <SelectContent>
              {availableSymbols.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No symbols
                </SelectItem>
              ) : (
                availableSymbols.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <StatusPillRow
          items={[
            {
              label: "Symbols",
              value: symbolsQuery.isLoading ? "..." : availableSymbols.length,
              tone: availableSymbols.length > 0 ? "primary" : "neutral",
            },
            {
              label: "Setup",
              value: signalQuery.isLoading
                ? "..."
                : formatSignalLabel(currentSignal),
              tone: currentSignal.includes("long")
                ? "success"
                : currentSignal.includes("short")
                  ? "danger"
                  : "neutral",
            },
            {
              label: "Regime",
              value: signalQuery.isLoading
                ? "..."
                : (signal?.liquidity_regime ?? "offline"),
              tone:
                signal?.liquidity_regime === "tight"
                  ? "primary"
                  : signal?.liquidity_regime === "thin"
                    ? "warning"
                    : "neutral",
            },
            {
              label: "Walls",
              value: wallsQuery.isLoading ? "..." : wallCount,
              tone: wallCount > 0 ? "warning" : "neutral",
            },
          ]}
        />
      </div>

      {hasError ? (
        <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          Failed to load orderbook data:{" "}
          {formatApiError(
            snapshotQuery.error ??
              imbalanceQuery.error ??
              signalQuery.error ??
              wallsQuery.error,
          )}
        </div>
      ) : null}

      <div
        data-testid="orderbook-workspace"
        className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(21rem,0.95fr)] xl:items-stretch"
      >
        <div data-testid="orderbook-depth-card" className="xl:h-[42rem]">
          <PanelCard
            title="Depth ladder"
            description={
              symbol
                ? `Bid and ask depth for ${symbol} stay side by side inside one market panel.`
                : "Select a symbol to load depth."
            }
            action={
              <div className="flex items-center gap-2">
                <Badge variant="outline">{depthBids.length} bids</Badge>
                <Badge variant="outline">{depthAsks.length} asks</Badge>
              </div>
            }
            className="flex h-full min-h-0 flex-col"
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {!symbol ? (
              <EmptyPanelState
                title="No symbol selected"
                description="Select a live symbol to inspect depth."
                className="min-h-64"
              />
            ) : snapshotQuery.isLoading ? (
              <div className="text-xs text-muted-foreground">
                Loading market depth...
              </div>
            ) : depthBids.length === 0 && depthAsks.length === 0 ? (
              <EmptyPanelState
                title="No depth available"
                description="The snapshot endpoint returned no depth levels for the selected symbol."
                className="min-h-64"
              />
            ) : (
              <div
                data-testid="orderbook-depth-panel"
                className="grid h-full min-h-0 gap-3 lg:grid-cols-2"
              >
                <DepthSection
                  side="ask"
                  title="Ask depth"
                  description={`${depthAsks.length} visible levels`}
                  levels={depthAsks}
                  maxTotal={maxTotal}
                />
                <DepthSection
                  side="bid"
                  title="Bid depth"
                  description={`${depthBids.length} visible levels`}
                  levels={depthBids}
                  maxTotal={maxTotal}
                />
              </div>
            )}
          </PanelCard>
        </div>

        <div
          data-testid="orderbook-signal-card"
          className="h-[42rem] xl:sticky xl:top-20"
        >
          <PanelCard
            title="Execution signal"
            description="The signal layer combines imbalance, depth quality, spread, and wall pressure into one execution-ready view."
            className="flex h-full min-h-0 flex-col"
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
            action={
              symbol && signal ? (
                <Badge
                  variant="outline"
                  className={
                    signal.readiness === "actionable"
                      ? "border-success/30 bg-success/10 text-success"
                      : signal.readiness === "blocked"
                        ? "border-danger/30 bg-danger/10 text-danger"
                        : "border-warning/30 bg-warning/10 text-warning"
                  }
                >
                  {signal.readiness}
                </Badge>
              ) : null
            }
          >
            {!symbol ? (
              <EmptyPanelState
                title="No symbol selected"
                description="Choose a live orderbook symbol to unlock the signal summary and TP/SL handoff."
                className="min-h-44"
              />
            ) : signalQuery.isLoading ? (
              <div className="text-xs text-muted-foreground">
                Computing execution signal...
              </div>
            ) : (
              <div
                data-testid="orderbook-signal-panel"
                className="flex h-full min-h-0 flex-col gap-3 overflow-hidden"
              >
                <div className="min-h-[9.5rem] shrink-0 rounded-2xl border border-border/70 bg-surface-2/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        Execution call
                      </div>
                      <div
                        className={`mt-2 text-2xl font-semibold capitalize ${
                          getSignalTone(signal?.execution_signal ?? "wait") ===
                          "up"
                            ? "text-up"
                            : getSignalTone(
                                  signal?.execution_signal ?? "wait",
                                ) === "down"
                              ? "text-down"
                              : "text-foreground"
                        }`}
                      >
                        {formatSignalLabel(signal?.execution_signal ?? "wait")}
                      </div>
                      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                        {signal?.readiness === "actionable"
                          ? "The book is aligned enough for execution-led decision making."
                          : signal?.readiness === "blocked"
                            ? "Liquidity or spread conditions are currently too weak for a clean entry."
                            : "Directional pressure exists, but the book still needs confirmation."}
                      </p>
                    </div>
                    <div className="grid gap-2 text-right">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        Confidence
                      </div>
                      <div className="text-2xl font-mono font-semibold text-foreground">
                        {signal?.confidence ?? 0}%
                      </div>
                      <Badge
                        variant="outline"
                        className="justify-self-end capitalize"
                      >
                        {signal?.signal_bias ?? "neutral"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <StatBox
                    label="Mid price"
                    value={
                      snapshot?.mid_price
                        ? `$${toPrice(snapshot.mid_price)}`
                        : "-"
                    }
                  />
                  <StatBox
                    label="Spread"
                    value={spread !== null ? `$${toPrice(spread)}` : "-"}
                  />
                  <StatBox
                    label="Imbalance ratio"
                    value={imbalance ? imbalance.ratio.toFixed(3) : "-"}
                    tone={
                      imbalance?.signal === "bullish"
                        ? "up"
                        : imbalance?.signal === "bearish"
                          ? "down"
                          : undefined
                    }
                  />
                  <StatBox
                    label="Depth ratio"
                    value={signal ? signal.depth_ratio.toFixed(3) : "-"}
                    tone={getSignalTone(signal?.signal_bias ?? "neutral")}
                  />
                  <StatBox
                    label="Bid walls"
                    value={signal?.bid_walls ?? 0}
                    tone="up"
                  />
                  <StatBox
                    label="Ask walls"
                    value={signal?.ask_walls ?? 0}
                    tone="down"
                  />
                </div>

                <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[1fr,0.9fr]">
                  <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/40 p-4">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Supporting factors
                    </div>
                    <div
                      data-testid="orderbook-supporting-factors-list"
                      className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
                    >
                      {signal?.supporting_factors.length ? (
                        signal.supporting_factors.map((factor) => (
                          <div
                            key={factor}
                            className="rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground"
                          >
                            {factor}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                          No strong confirming factors are available yet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                          Alerts
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Conditions blocking or weakening execution.
                        </p>
                      </div>
                      <Badge variant="outline">
                        {signal?.alerts.length ?? 0}
                      </Badge>
                    </div>

                    <div
                      data-testid="orderbook-alerts-list"
                      className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
                    >
                      {signal?.alerts.length ? (
                        signal.alerts.map((alert) => (
                          <div
                            key={alert.code}
                            className={`rounded-xl border px-3 py-3 text-sm ${
                              alert.severity === "critical"
                                ? "border-danger/30 bg-danger/10 text-danger"
                                : alert.severity === "warning"
                                  ? "border-warning/30 bg-warning/10 text-warning"
                                  : "border-border/70 bg-surface-2/60 text-foreground"
                            }`}
                          >
                            <div className="text-[11px] uppercase tracking-[0.16em]">
                              {alert.severity}
                            </div>
                            <div className="mt-1">{alert.message}</div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-3 text-sm text-success">
                          No adverse alerts are active. The visible book
                          conditions are stable.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </PanelCard>
        </div>
      </div>
    </div>
  );
}

function DepthSection({
  side,
  title,
  description,
  levels,
  maxTotal,
}: {
  side: "bid" | "ask";
  title: string;
  description: string;
  levels: Array<{ price: number; amount: number; total: number }>;
  maxTotal: number;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-border/70 bg-background/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {description}
          </div>
        </div>
      </div>

      <div
        data-testid={`orderbook-${side}-scroll`}
        className="min-h-0 flex-1 space-y-1"
      >
        <DepthHeader side={side} />
        {levels.map((level, index) => (
          <DepthRow
            key={`${side}-${index}-${level.price}`}
            level={level}
            maxTotal={maxTotal}
            side={side}
          />
        ))}
      </div>
    </section>
  );
}

function DepthHeader({ side }: { side: "bid" | "ask" }) {
  return (
    <div className="grid grid-cols-3 rounded-xl border border-border/70 bg-surface-2/60 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      {side === "bid" ? (
        <>
          <span>Total</span>
          <span className="text-right">Size</span>
          <span className="text-right">Price</span>
        </>
      ) : (
        <>
          <span>Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Total</span>
        </>
      )}
    </div>
  );
}

function DepthRow({
  level,
  maxTotal,
  side,
}: {
  level: { price: number; amount: number; total: number };
  maxTotal: number;
  side: "bid" | "ask";
}) {
  const barPercentage = (level.total / maxTotal) * 100;
  return (
    <div
      className="relative grid grid-cols-3 rounded-lg border border-border/50 px-3 py-2 text-xs font-mono bg-background/80 hover:bg-background/95 transition-colors"
      style={{
        backgroundImage:
          side === "bid"
            ? `linear-gradient(to right, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.15) ${barPercentage}%, transparent ${barPercentage}%)`
            : `linear-gradient(to left, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.15) ${barPercentage}%, transparent ${barPercentage}%)`,
      }}
    >
      {side === "bid" ? (
        <>
          <span className="text-muted-foreground">
            {level.total.toFixed(2)}
          </span>
          <span className="text-right text-foreground">
            {level.amount.toFixed(4)}
          </span>
          <span className="text-right text-up font-semibold">
            {level.price.toFixed(2)}
          </span>
        </>
      ) : (
        <>
          <span className="text-down font-semibold">
            {level.price.toFixed(2)}
          </span>
          <span className="text-right text-foreground">
            {level.amount.toFixed(4)}
          </span>
          <span className="text-right text-muted-foreground">
            {level.total.toFixed(2)}
          </span>
        </>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-surface-2/60 p-3">
      <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <p
        className={`mt-2 text-sm font-mono font-semibold ${
          tone === "up"
            ? "text-up"
            : tone === "down"
              ? "text-down"
              : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
