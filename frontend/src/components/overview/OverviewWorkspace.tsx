import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock3,
  Info,
  Loader2,
  LogIn,
  Pause,
  Play,
  Plus,
  Send,
  Target,
  Trash2,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  FundingRateChart,
  type ExchangeSeriesKey,
} from "@/components/overview/FundingRateChart";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useArbBots,
  useArbCoinDetails,
  useArbRates,
  useStartArbBot,
  useStopArbBot,
} from "@/hooks/useArb";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  useOrderbookImbalance,
  useOrderbookSignal,
  useOrderbookSnapshot,
  useOrderbookSymbols,
} from "@/hooks/useOrderbook";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useSystemHealth, useSystemWorkerHealth } from "@/hooks/useSystem";
import {
  useCancelTpslSession,
  useCloseTpslSession,
  useCreateTpslSession,
  useTpslSessions,
} from "@/hooks/useTpsl";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import {
  formatFundingRatePercent,
  getAggregatedFundingSnapshot,
  parseFundingNumber,
} from "@/lib/arbFunding";
import type {
  ArbBot,
  OrderbookLevel,
  OrderbookSignalResult,
  OrderbookSnapshot,
  TpslSession,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type LeftPanelTab = "orderbook" | "tpsl";
type RightPanelTab = "trading" | "bots";

type PanelTone = "neutral" | "success" | "warning" | "danger" | "accent";

type DepthRowData = {
  price: number;
  amount: number;
  total: number;
};

const DEFAULT_EXCHANGE_VISIBILITY: Record<ExchangeSeriesKey, boolean> = {
  pacifica: true,
  hyperliquid: true,
  lighter: true,
  binance: true,
  bybit: true,
};

const LEFT_RAIL_WIDTH = 320;
const RIGHT_RAIL_WIDTH = 360;
const COLLAPSED_RAIL_WIDTH = 32;

function formatPrice(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "-";
  }

  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: parsed >= 1000 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatAmount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

function formatAge(timestamp?: number | null) {
  if (!timestamp) {
    return "-";
  }

  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }
  return `${Math.floor(diffMinutes / 60)}h`;
}

function resolveOrderbookSymbol(symbol: string, symbols: string[]) {
  if (!symbol) {
    return "";
  }

  const direct = symbols.find((item) => item === symbol);
  if (direct) {
    return direct;
  }

  const prefixed = symbols.find(
    (item) =>
      item.startsWith(`${symbol}-`) ||
      item.startsWith(`${symbol}_`) ||
      item.startsWith(`${symbol}/`),
  );
  return prefixed ?? "";
}

function getSignalTone(signal: string | undefined): PanelTone {
  if (!signal) {
    return "neutral";
  }
  if (signal.includes("long") || signal === "bullish" || signal === "support") {
    return "success";
  }
  if (
    signal.includes("short") ||
    signal === "bearish" ||
    signal === "resistance"
  ) {
    return "danger";
  }
  return "neutral";
}

function getSpread(snapshot: OrderbookSnapshot | undefined) {
  const bestBid = snapshot?.bids[0]?.price;
  const bestAsk = snapshot?.asks[0]?.price;
  if (bestBid === undefined || bestAsk === undefined) {
    return null;
  }
  return bestAsk - bestBid;
}

function sortBots(bots: ArbBot[], selectedSymbol: string) {
  return [...bots].sort((left, right) => {
    const leftScore =
      (left.symbol === selectedSymbol ? 4 : 0) +
      (left.status === "running" ? 2 : 0);
    const rightScore =
      (right.symbol === selectedSymbol ? 4 : 0) +
      (right.status === "running" ? 2 : 0);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return left.name.localeCompare(right.name);
  });
}

function toneClasses(tone: PanelTone) {
  switch (tone) {
    case "success":
      return "border-success/40 text-success";
    case "warning":
      return "border-warning/40 text-warning";
    case "danger":
      return "border-destructive/40 text-destructive-foreground";
    case "accent":
      return "border-primary/50 text-primary";
    default:
      return "border-border text-foreground";
  }
}

function toneTextClass(tone: PanelTone) {
  switch (tone) {
    case "success":
      return "text-success";
    case "warning":
      return "text-warning";
    case "danger":
      return "text-destructive-foreground";
    case "accent":
      return "text-primary";
    default:
      return "text-foreground";
  }
}

function buildDepthRows(levels: OrderbookLevel[], reverse = false) {
  const visible = levels.slice(0, 8);
  let total = 0;
  const rows = visible.map((level) => {
    total += level.amount;
    return {
      price: level.price,
      amount: level.amount,
      total,
    };
  });

  return reverse ? rows.reverse() : rows;
}

function botStatusTone(status: string): PanelTone {
  if (status === "running") {
    return "success";
  }
  if (status === "error") {
    return "danger";
  }
  return "warning";
}

export function OverviewWorkspace() {
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const isTablet = useMediaQuery("(min-width: 1024px)");
  const isCompactMobile = useMediaQuery("(max-width: 639px)");

  const [selectedSymbol, setSelectedSymbol] = usePersistentState<string>(
    "pacifica.overview.symbol",
    "",
  );
  const [leftRailOpen, setLeftRailOpen] = usePersistentState<boolean>(
    "pacifica.overview.v2.left-rail-open",
    true,
  );
  const [rightRailOpen, setRightRailOpen] = usePersistentState<boolean>(
    "pacifica.overview.v2.right-rail-open",
    true,
  );
  const [leftPanelTab, setLeftPanelTab] = usePersistentState<LeftPanelTab>(
    "pacifica.overview.left-tab",
    "orderbook",
  );
  const [rightPanelTab, setRightPanelTab] = usePersistentState<RightPanelTab>(
    "pacifica.overview.right-tab",
    "trading",
  );
  const [exchangeVisibility, setExchangeVisibility] = usePersistentState<
    Record<ExchangeSeriesKey, boolean>
  >("pacifica.overview.exchange-visibility", DEFAULT_EXCHANGE_VISIBILITY);

  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [selectedTpslSessionId, setSelectedTpslSessionId] = useState<
    number | null
  >(null);
  const [tpslAutoFill, setTpslAutoFill] = useState<{
    entryPrice: number | null;
    positionSize: number | null;
    side: "long" | "short";
    symbol: string;
  } | null>(null);

  const ratesQuery = useArbRates({ refetchInterval: 3_000, staleTime: 0 });
  const botsQuery = useArbBots({ refetchInterval: 5_000, staleTime: 0 });
  const sessionsQuery = useTpslSessions(undefined, {
    refetchInterval: 5_000,
    staleTime: 0,
  });
  const healthQuery = useSystemHealth();
  const workerHealthQuery = useSystemWorkerHealth();
  const orderbookSymbolsQuery = useOrderbookSymbols({
    refetchInterval: 15_000,
    staleTime: 0,
  });

  const symbols = useMemo(
    () => Object.keys(ratesQuery.data?.rates ?? {}).sort(),
    [ratesQuery.data?.rates],
  );

  useEffect(() => {
    if (symbols.length === 0) {
      return;
    }
    if (!selectedSymbol || !symbols.includes(selectedSymbol)) {
      setSelectedSymbol(symbols[0]);
    }
  }, [selectedSymbol, setSelectedSymbol, symbols]);

  useEffect(() => {
    if (isDesktop) {
      setLeftDrawerOpen(false);
      setRightDrawerOpen(false);
    }
  }, [isDesktop]);

  const selectedSnapshot = selectedSymbol
    ? getAggregatedFundingSnapshot(selectedSymbol, ratesQuery.data)
    : { fundingRate: null, nextFundingRate: null, sources: 0, nextSources: 0 };

  const detailsQuery = useArbCoinDetails(
    selectedSymbol,
    Boolean(selectedSymbol),
    {
      refetchInterval: 3_000,
      staleTime: 0,
    },
  );

  const orderbookSymbol = useMemo(
    () =>
      resolveOrderbookSymbol(
        selectedSymbol,
        orderbookSymbolsQuery.data?.symbols ?? [],
      ),
    [orderbookSymbolsQuery.data?.symbols, selectedSymbol],
  );

  const isOrderbookPanelLive = isDesktop
    ? leftRailOpen && leftPanelTab === "orderbook"
    : leftDrawerOpen && leftPanelTab === "orderbook";

  const snapshotQuery = useOrderbookSnapshot(
    orderbookSymbol,
    Boolean(orderbookSymbol) && isOrderbookPanelLive,
    { refetchInterval: 2_000, staleTime: 0 },
  );
  const imbalanceQuery = useOrderbookImbalance(
    orderbookSymbol,
    Boolean(orderbookSymbol) && isOrderbookPanelLive,
    { refetchInterval: 2_000, staleTime: 0 },
  );
  const signalQuery = useOrderbookSignal(
    orderbookSymbol,
    Boolean(orderbookSymbol) && isOrderbookPanelLive,
    { refetchInterval: 2_000, staleTime: 0 },
  );

  const startBot = useStartArbBot();
  const stopBot = useStopArbBot();

  const bots = botsQuery.data?.bots ?? [];
  const sortedBots = useMemo(
    () => sortBots(bots, selectedSymbol),
    [bots, selectedSymbol],
  );
  const sessions = sessionsQuery.data?.sessions ?? [];
  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status === "active"),
    [sessions],
  );
  const armedSessions = useMemo(
    () =>
      activeSessions.filter(
        (session) =>
          session.take_profit_price !== null ||
          session.stop_loss_price !== null,
      ),
    [activeSessions],
  );
  const trailingSessions = useMemo(
    () => activeSessions.filter((session) => session.trailing_stop_activated),
    [activeSessions],
  );
  const runningBots = useMemo(
    () => bots.filter((bot) => bot.status === "running"),
    [bots],
  );

  const currentSpreadBps = useMemo(() => {
    const values = [
      detailsQuery.data?.pacifica,
      detailsQuery.data?.hyperliquid,
      detailsQuery.data?.lighter,
      detailsQuery.data?.binance,
      detailsQuery.data?.bybit,
    ]
      .map((entry) => parseFundingNumber(entry?.funding_rate))
      .filter((value): value is number => value !== null);

    if (values.length < 2) {
      return null;
    }

    return (Math.max(...values) - Math.min(...values)) * 10_000;
  }, [detailsQuery.data]);

  const overviewTiles = [
    {
      label: "Funding",
      value: formatFundingRatePercent(selectedSnapshot.fundingRate),
      tone:
        selectedSnapshot.fundingRate === null
          ? "neutral"
          : selectedSnapshot.fundingRate >= 0
            ? "success"
            : "danger",
    },
    {
      label: "Next",
      value: formatFundingRatePercent(selectedSnapshot.nextFundingRate),
      tone:
        selectedSnapshot.nextFundingRate === null
          ? "neutral"
          : selectedSnapshot.nextFundingRate >= 0
            ? "success"
            : "danger",
    },
    {
      label: "Spread",
      value:
        currentSpreadBps === null ? "-" : `${currentSpreadBps.toFixed(2)} BPS`,
      tone: "accent",
    },
    {
      label: "Coverage",
      value: `${symbols.length} SYMBOLS`,
      tone: "neutral",
    },
  ] as const;

  const openLeftDrawer = () => {
    setLeftDrawerOpen(true);
    if (isCompactMobile) {
      setRightDrawerOpen(false);
    }
  };

  const openRightDrawer = () => {
    setRightDrawerOpen(true);
    if (isCompactMobile) {
      setLeftDrawerOpen(false);
    }
  };

  const toggleExchange = (exchange: ExchangeSeriesKey) => {
    setExchangeVisibility((current) => ({
      ...current,
      [exchange]: !current[exchange],
    }));
  };

  const leftPanelContent =
    leftPanelTab === "orderbook" ? (
      <OrderbookPanelContent
        symbol={orderbookSymbol}
        isSupported={Boolean(orderbookSymbol)}
        snapshot={snapshotQuery.data}
        signal={signalQuery.data}
        imbalanceRatio={imbalanceQuery.data?.ratio ?? null}
        isLoading={
          snapshotQuery.isLoading ||
          imbalanceQuery.isLoading ||
          signalQuery.isLoading
        }
        onSendToTpsl={(side: "long" | "short", positionSize: number | null) => {
          setTpslAutoFill({
            symbol: orderbookSymbol,
            side,
            entryPrice: snapshotQuery.data?.mid_price ?? null,
            positionSize,
          });
          setLeftPanelTab("tpsl");
        }}
      />
    ) : (
      <TpSlPanelContent
        sessions={activeSessions}
        armedSessions={armedSessions}
        trailingSessions={trailingSessions}
        isLoading={sessionsQuery.isLoading}
        onSelectSession={setSelectedTpslSessionId}
        autoFill={tpslAutoFill}
        onClearAutoFill={() => setTpslAutoFill(null)}
      />
    );

  const rightPanelContent =
    rightPanelTab === "trading" ? (
      <TradingCornerPanelContent
        selectedSymbol={selectedSymbol}
        rates={ratesQuery.data}
        details={detailsQuery.data}
      />
    ) : (
      <BotsPanelContent
        bots={sortedBots}
        isBusy={startBot.isPending || stopBot.isPending}
        onToggle={async (bot) => {
          if (bot.status === "running") {
            await stopBot.mutateAsync(bot.id);
            return;
          }
          await startBot.mutateAsync(bot.id);
        }}
      />
    );

  return (
    <div
      data-testid="overview-workspace"
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      {!isTablet ? (
        <div className="border-b border-border bg-warning/10 px-3 py-2">
          <span className="terminal-label text-warning">
            BEST VIEWED ON DESKTOP
          </span>
        </div>
      ) : null}

      <div className="border-b border-border bg-card">
        <div className="grid gap-px bg-border xl:grid-cols-[260px_1fr]">
          <div className="bg-card px-3 py-2">
            <div className="terminal-label">Overview</div>
            <div className="mt-1 flex items-end gap-3">
              <span className="font-display text-[22px] font-light text-foreground">
                {selectedSymbol || "Terminal"}
              </span>
              <span className="terminal-label text-primary">STONE LEDGER</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[30rem] gap-px bg-border sm:grid-cols-2 xl:min-w-0 xl:grid-cols-4">
              {overviewTiles.map((tile) => (
                <HeaderMetricTile
                  key={tile.label}
                  label={tile.label}
                  value={tile.value}
                  tone={tile.tone}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
              <SelectTrigger
                data-testid="overview-symbol-select"
                className="h-9 w-48 border-border bg-surface-2 font-mono text-[12px] text-foreground"
              >
                <SelectValue placeholder="Select symbol" />
              </SelectTrigger>
              <SelectContent className="border-border bg-card">
                {symbols.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    No symbols
                  </SelectItem>
                ) : (
                  symbols.map((symbol) => (
                    <SelectItem key={symbol} value={symbol}>
                      {symbol}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {!isDesktop ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                  onClick={openLeftDrawer}
                >
                  Left Panel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                  onClick={openRightDrawer}
                >
                  Right Panel
                </Button>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[12px]">
            <TerminalInlineMetric
              label="Orderbook"
              value={orderbookSymbol || "-"}
            />
            <TerminalInlineMetric
              label="Bots"
              value={`${runningBots.length}/${bots.length}`}
            />
            <TerminalInlineMetric label="TP/SL" value={activeSessions.length} />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {isDesktop ? (
          <DesktopTerminalRail
            dataTestId="overview-left-rail"
            side="left"
            title="Left Panel"
            collapsedLabel="LEFT PANEL"
            open={leftRailOpen}
            onToggle={() => setLeftRailOpen((current) => !current)}
            activeTab={leftPanelTab}
            onTabChange={(value) => setLeftPanelTab(value as LeftPanelTab)}
            tabs={[
              { value: "orderbook", label: "Orderbook" },
              { value: "tpsl", label: "TP / SL" },
            ]}
            width={LEFT_RAIL_WIDTH}
          >
            {leftPanelContent}
          </DesktopTerminalRail>
        ) : null}

        <div className="min-h-0 min-w-0 flex-1">
          <FundingRateChart
            symbol={selectedSymbol}
            details={detailsQuery.data}
            isLoading={detailsQuery.isLoading}
            visibility={exchangeVisibility}
            onToggleExchange={toggleExchange}
          />
        </div>

        {isDesktop ? (
          <DesktopTerminalRail
            dataTestId="overview-right-rail"
            side="right"
            title="Right Panel"
            collapsedLabel="RIGHT PANEL"
            open={rightRailOpen}
            onToggle={() => setRightRailOpen((current) => !current)}
            activeTab={rightPanelTab}
            onTabChange={(value) => setRightPanelTab(value as RightPanelTab)}
            tabs={[
              { value: "trading", label: "Trading" },
              { value: "bots", label: "Arb Status" },
            ]}
            width={RIGHT_RAIL_WIDTH}
          >
            {rightPanelContent}
          </DesktopTerminalRail>
        ) : null}
      </div>

      {!isDesktop ? (
        <>
          <MobilePanelSheet
            open={leftDrawerOpen}
            onOpenChange={setLeftDrawerOpen}
            side="left"
            title="Left Panel"
            activeTab={leftPanelTab}
            onTabChange={(value) => setLeftPanelTab(value as LeftPanelTab)}
            tabs={[
              { value: "orderbook", label: "Orderbook" },
              { value: "tpsl", label: "TP / SL" },
            ]}
          >
            {leftPanelContent}
          </MobilePanelSheet>

          <MobilePanelSheet
            open={rightDrawerOpen}
            onOpenChange={setRightDrawerOpen}
            side="right"
            title="Right Panel"
            activeTab={rightPanelTab}
            onTabChange={(value) => setRightPanelTab(value as RightPanelTab)}
            tabs={[
              { value: "trading", label: "Trading" },
              { value: "bots", label: "Arb Status" },
            ]}
          >
            {rightPanelContent}
          </MobilePanelSheet>
        </>
      ) : null}

      <TpslSessionModal
        sessionId={selectedTpslSessionId}
        open={selectedTpslSessionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTpslSessionId(null);
          }
        }}
        allSessions={sessions}
      />
    </div>
  );
}

function DesktopTerminalRail({
  dataTestId,
  side,
  title,
  collapsedLabel,
  open,
  onToggle,
  activeTab,
  onTabChange,
  tabs,
  width,
  children,
}: {
  dataTestId: string;
  side: "left" | "right";
  title: string;
  collapsedLabel: string;
  open: boolean;
  onToggle: () => void;
  activeTab: string;
  onTabChange: (value: string) => void;
  tabs: Array<{ value: string; label: string }>;
  width: number;
  children: ReactNode;
}) {
  const ToggleIcon =
    side === "left"
      ? open
        ? ChevronLeft
        : ChevronRight
      : open
        ? ChevronRight
        : ChevronLeft;

  return (
    <aside
      data-testid={dataTestId}
      data-state={open ? "expanded" : "collapsed"}
      className="hidden shrink-0 transition-[width] duration-200 ease-out xl:flex"
      style={{ width: open ? width : COLLAPSED_RAIL_WIDTH }}
    >
      <div
        className={cn(
          "flex h-full w-full flex-col overflow-hidden bg-card",
          side === "left" ? "border-r border-border" : "border-l border-border",
        )}
      >
        {open ? (
          <>
            <button
              type="button"
              data-testid={`${dataTestId}-toggle`}
              className="flex h-11 items-center justify-between border-b border-border bg-surface-2 px-3 text-left hover:bg-muted"
              onClick={onToggle}
              onDoubleClick={onToggle}
            >
              <span className="terminal-label text-foreground">{title}</span>
              <ToggleIcon className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className="grid h-9 grid-cols-2 border-b border-border bg-border">
              {tabs.map((tab) => (
                <RailTabButton
                  key={tab.value}
                  active={tab.value === activeTab}
                  onClick={() => onTabChange(tab.value)}
                  data-testid={`${dataTestId}-tab-${tab.value}`}
                >
                  {tab.label}
                </RailTabButton>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
          </>
        ) : (
          <button
            type="button"
            data-testid={`${dataTestId}-toggle`}
            className="flex h-full w-full items-center justify-center bg-surface-2 hover:bg-muted"
            onClick={onToggle}
            onDoubleClick={onToggle}
          >
            <span
              className="terminal-label rotate-180 text-foreground"
              style={{ writingMode: "vertical-rl" }}
            >
              {collapsedLabel}
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}

function MobilePanelSheet({
  open,
  onOpenChange,
  side,
  title,
  activeTab,
  onTabChange,
  tabs,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: "left" | "right";
  title: string;
  activeTab: string;
  onTabChange: (value: string) => void;
  tabs: Array<{ value: string; label: string }>;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className="flex h-full w-[94vw] flex-col border-border bg-card p-0 sm:max-w-[420px]"
      >
        <SheetHeader className="border-b border-border bg-surface-2 px-4 py-3">
          <SheetTitle className="terminal-label text-foreground">
            {title}
          </SheetTitle>
        </SheetHeader>
        <div className="grid h-9 grid-cols-2 border-b border-border bg-border">
          {tabs.map((tab) => (
            <RailTabButton
              key={tab.value}
              active={tab.value === activeTab}
              onClick={() => onTabChange(tab.value)}
            >
              {tab.label}
            </RailTabButton>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

function RailTabButton({
  active,
  onClick,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center justify-center bg-card px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground",
        active && "bg-surface-2 text-primary",
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}

function HeaderMetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: PanelTone;
}) {
  return (
    <div className="min-w-[7.5rem] bg-card px-3 py-2">
      <div className="terminal-label">{label}</div>
      <div
        className={cn("mt-1 terminal-value text-[13px]", toneTextClass(tone))}
      >
        {value}
      </div>
    </div>
  );
}

function TerminalInlineMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="terminal-label">{label}</span>
      <span className="terminal-value text-[12px]">{value}</span>
    </div>
  );
}

function PanelStatRow({
  items,
  columns,
}: {
  items: Array<{ label: string; value: string | number; tone?: PanelTone }>;
  columns: 2 | 3 | 4;
}) {
  return (
    <div
      className={cn(
        "grid gap-px border-b border-border bg-border",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-3",
        columns === 4 && "grid-cols-4",
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="bg-card px-3 py-2">
          <div className="terminal-label">{item.label}</div>
          <div
            className={cn(
              "mt-1 terminal-value text-[12px]",
              toneTextClass(item.tone ?? "neutral"),
            )}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelLinkRow({
  to,
  icon: Icon,
  children,
}: {
  to: string;
  icon: typeof Target;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-border bg-card p-3">
      <Button asChild variant="outline" size="sm" className="h-8 w-full px-3">
        <Link to={to}>
          <Icon className="h-3.5 w-3.5" />
          {children}
        </Link>
      </Button>
    </div>
  );
}

function StatusFlag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: PanelTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
        toneClasses(tone),
      )}
    >
      {children}
    </span>
  );
}

function EmptyRailState({ label }: { label: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center px-4 py-6 text-center">
      <span className="terminal-value text-[12px] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function TpSlPanelContent({
  sessions,
  armedSessions,
  trailingSessions,
  isLoading,
  onSelectSession,
  autoFill,
  onClearAutoFill,
}: {
  sessions: TpslSession[];
  armedSessions: TpslSession[];
  trailingSessions: TpslSession[];
  isLoading: boolean;
  onSelectSession?: (sessionId: number) => void;
  autoFill: {
    entryPrice: number | null;
    positionSize: number | null;
    side: "long" | "short";
    symbol: string;
  } | null;
  onClearAutoFill: () => void;
  snapshot?: OrderbookSnapshot;
  signal?: OrderbookSignalResult;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [entryPrice, setEntryPrice] = useState("");
  const [positionSize, setPositionSize] = useState("");
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [enableTrailing, setEnableTrailing] = useState(false);
  const [trailingDistance, setTrailingDistance] = useState("");
  const [tpLevels, setTpLevels] = useState<
    Array<{ price: string; size: string }>
  >([{ price: "", size: "25" }]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const symbolsQuery = useOrderbookSymbols();
  const createSession = useCreateTpslSession();

  const availableSymbols = useMemo(() => {
    const source = symbolsQuery.data?.symbols ?? [];
    return [
      ...new Set(
        source.map((value) => value.replace(/[-_].*$/, "")).filter(Boolean),
      ),
    ];
  }, [symbolsQuery.data?.symbols]);

  useEffect(() => {
    if (availableSymbols.length > 0 && !symbol) {
      setSymbol(availableSymbols[0]);
    }
  }, [availableSymbols, symbol]);

  useEffect(() => {
    if (autoFill) {
      setSymbol(autoFill.symbol);
      setSide(autoFill.side);
      if (autoFill.entryPrice !== null) {
        setEntryPrice(autoFill.entryPrice.toString());
      }
      if (autoFill.positionSize !== null) {
        setPositionSize(autoFill.positionSize.toString());
      }
      setFormOpen(true);
      onClearAutoFill();
    }
  }, [autoFill]);

  const handleCreateSession = async () => {
    const parsedEntry = Number(entryPrice);
    const parsedSize = Number(positionSize);
    const parsedTP = takeProfitPrice ? Number(takeProfitPrice) : null;
    const parsedSL = stopLossPrice ? Number(stopLossPrice) : null;
    const parsedTrailing =
      enableTrailing && trailingDistance ? Number(trailingDistance) : undefined;

    if (!Number.isFinite(parsedEntry) || parsedEntry <= 0) {
      toast({
        title: "Invalid entry price",
        description: "Entry price must be positive.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(parsedSize) || parsedSize <= 0) {
      toast({
        title: "Invalid position size",
        description: "Position size must be positive.",
        variant: "destructive",
      });
      return;
    }

    const partialLevels = tpLevels
      .map((level) => ({
        price: Number(level.price),
        close_percent: Number(level.size),
        triggered: false,
      }))
      .filter(
        (level) =>
          Number.isFinite(level.price) &&
          level.price > 0 &&
          Number.isFinite(level.close_percent) &&
          level.close_percent > 0,
      );

    try {
      logger.info("tpsl.session.create.request", { symbol, side });
      await createSession.mutateAsync({
        symbol,
        side,
        entry_price: parsedEntry,
        position_size: parsedSize,
        take_profit_price: parsedTP,
        stop_loss_price: parsedSL,
        trailing_stop_distance: parsedTrailing,
        partial_tp_levels: partialLevels.length > 0 ? partialLevels : undefined,
      });
      toast({
        title: "Session created",
        description: `TP/SL session for ${symbol} created successfully.`,
      });
      logger.info("tpsl.session.create.success", { symbol, side });

      // Reset form
      setEntryPrice("");
      setPositionSize("");
      setTakeProfitPrice("");
      setStopLossPrice("");
      setTpLevels([{ price: "", size: "25" }]);
      setEnableTrailing(false);
      setTrailingDistance("");
      setAdvancedOpen(false);
      setFormOpen(false);
    } catch (error) {
      logger.error("tpsl.session.create.error", {
        symbol,
        side,
        message: error instanceof Error ? error.message : String(error),
      });
      toast({
        title: "Session creation failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-card overflow-hidden">
      <PanelStatRow
        columns={3}
        items={[
          { label: "Active", value: sessions.length },
          { label: "Armed", value: armedSessions.length, tone: "accent" },
          {
            label: "Trailing",
            value: trailingSessions.length,
            tone: "warning",
          },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto flex flex-col">
        <Collapsible
          open={formOpen}
          onOpenChange={setFormOpen}
          className="border-b border-border"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium text-foreground hover:bg-surface-2/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create Session
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${formOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t border-border px-3 py-3 space-y-3 bg-surface-1/50">
            <div className="grid gap-2">
              <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Symbol
              </Label>
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger className="h-8 bg-surface-2 text-xs">
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

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Side
                </Label>
                <Select
                  value={side}
                  onValueChange={(value: "long" | "short") => setSide(value)}
                >
                  <SelectTrigger className="h-8 bg-surface-2 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="long">Long</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Entry price
                </Label>
                <Input
                  type="number"
                  className="h-8 bg-surface-2 text-xs"
                  placeholder="0.00"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Position size
                </Label>
                <Input
                  data-testid="tpsl-position-size-input"
                  type="number"
                  className="h-8 bg-surface-2 text-xs"
                  placeholder="0.00"
                  value={positionSize}
                  onChange={(e) => setPositionSize(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Take profit
                </Label>
                <Input
                  type="number"
                  className="h-8 bg-surface-2 text-xs"
                  placeholder="Optional"
                  value={takeProfitPrice}
                  onChange={(e) => setTakeProfitPrice(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Stop loss
              </Label>
              <Input
                type="number"
                className="h-8 bg-surface-2 text-xs"
                placeholder="Optional"
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(e.target.value)}
              />
            </div>

            <Collapsible
              open={advancedOpen}
              onOpenChange={setAdvancedOpen}
              className="border border-border/50 bg-surface-2/30"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-2 py-2 text-left text-xs font-medium text-muted-foreground"
                >
                  Advanced
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-border/50 px-2 py-2 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-[0.14em]">
                    Trailing stop
                  </Label>
                  <Switch
                    checked={enableTrailing}
                    onCheckedChange={setEnableTrailing}
                  />
                </div>
                {enableTrailing && (
                  <Input
                    type="number"
                    className="h-7 bg-surface-2 text-xs"
                    placeholder="Distance"
                    value={trailingDistance}
                    onChange={(e) => setTrailingDistance(e.target.value)}
                  />
                )}
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-[0.14em]">
                    Partial TP
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] text-primary"
                    onClick={() =>
                      setTpLevels((levels) => [
                        ...levels,
                        { price: "", size: "25" },
                      ])
                    }
                  >
                    <Plus className="h-2.5 w-2.5" />
                  </Button>
                </div>
                {tpLevels.map((level, idx) => (
                  <div key={`${idx}-${level.size}`} className="flex gap-1">
                    <Input
                      placeholder="Price"
                      className="h-7 flex-1 bg-surface-2 text-xs"
                      value={level.price}
                      onChange={(e) => {
                        const next = [...tpLevels];
                        next[idx] = { ...next[idx], price: e.target.value };
                        setTpLevels(next);
                      }}
                    />
                    <Input
                      placeholder="%"
                      className="h-7 w-14 bg-surface-2 text-xs"
                      value={level.size}
                      onChange={(e) => {
                        const next = [...tpLevels];
                        next[idx] = { ...next[idx], size: e.target.value };
                        setTpLevels(next);
                      }}
                    />
                    {tpLevels.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() =>
                          setTpLevels((levels) =>
                            levels.filter((_, i) => i !== idx),
                          )
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>

            <Button
              className="h-7 w-full text-xs"
              disabled={createSession.isPending || !symbol}
              onClick={() => void handleCreateSession()}
            >
              <Target className="mr-1 h-3 w-3" />
              Start Session
            </Button>
          </CollapsibleContent>
        </Collapsible>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <EmptyRailState label="LOADING TP / SL" />
          ) : sessions.length === 0 ? (
            <EmptyRailState label="NO LIVE SESSIONS" />
          ) : (
            sessions.slice(0, 8).map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelectSession?.(session.id)}
                className="w-full border-b border-border px-3 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="terminal-value text-[13px]">
                      {session.symbol}
                    </span>
                    <StatusFlag
                      tone={session.side === "long" ? "success" : "danger"}
                    >
                      {session.side}
                    </StatusFlag>
                  </div>
                  <StatusFlag tone="neutral">{session.status}</StatusFlag>
                </div>
                <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                  <span className="terminal-label">Entry</span>
                  <span className="terminal-value text-[12px] text-right">
                    {formatPrice(session.entry_price)}
                  </span>
                  <span className="terminal-label">Size</span>
                  <span className="terminal-value text-[12px] text-right">
                    {formatAmount(session.current_position_size)}
                  </span>
                  <span className="terminal-label">TP</span>
                  <span className="terminal-value text-[12px] text-right">
                    {formatPrice(session.take_profit_price)}
                  </span>
                  <span className="terminal-label">SL</span>
                  <span className="terminal-value text-[12px] text-right">
                    {formatPrice(session.stop_loss_price)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {session.take_profit_price !== null ? (
                    <StatusFlag tone="accent">TP Armed</StatusFlag>
                  ) : null}
                  {session.stop_loss_price !== null ? (
                    <StatusFlag tone="danger">SL Armed</StatusFlag>
                  ) : null}
                  <StatusFlag
                    tone={
                      session.trailing_stop_activated ? "warning" : "neutral"
                    }
                  >
                    {session.trailing_stop_activated
                      ? "Trailing Active"
                      : "Trailing Idle"}
                  </StatusFlag>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function OrderbookPanelContent({
  symbol,
  isSupported,
  snapshot,
  signal,
  imbalanceRatio,
  isLoading,
  onSendToTpsl,
}: {
  symbol: string;
  isSupported: boolean;
  snapshot: OrderbookSnapshot | undefined;
  signal: OrderbookSignalResult | undefined;
  imbalanceRatio: number | null;
  isLoading: boolean;
  onSendToTpsl?: (side: "long" | "short", positionSize: number | null) => void;
}) {
  const [positionSize, setPositionSize] = useState("");
  const spread = getSpread(snapshot);
  const askRows = useMemo(
    () => buildDepthRows(snapshot?.asks ?? [], true),
    [snapshot?.asks],
  );
  const bidRows = useMemo(
    () => buildDepthRows(snapshot?.bids ?? [], false),
    [snapshot?.bids],
  );
  const parsedPositionSize = positionSize.trim() ? Number(positionSize) : null;
  const canSendToTpsl =
    Boolean(signal && snapshot?.mid_price) &&
    parsedPositionSize !== null &&
    Number.isFinite(parsedPositionSize) &&
    parsedPositionSize > 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <PanelStatRow
        columns={4}
        items={[
          {
            label: "Mid",
            value: snapshot?.mid_price ? formatPrice(snapshot.mid_price) : "-",
          },
          {
            label: "Spread",
            value: spread === null ? "-" : formatPrice(spread),
            tone: "accent",
          },
          {
            label: "Signal",
            value: signal?.execution_signal?.replace(/_/g, " ") ?? "-",
            tone: getSignalTone(signal?.execution_signal),
          },
          {
            label: "Bias",
            value: imbalanceRatio === null ? "-" : imbalanceRatio.toFixed(3),
            tone:
              imbalanceRatio === null
                ? "neutral"
                : imbalanceRatio >= 1
                  ? "success"
                  : "danger",
          },
        ]}
      />

      {!isSupported ? (
        <EmptyRailState label="NO ORDERBOOK SYMBOL" />
      ) : isLoading ? (
        <EmptyRailState label="LOADING ORDERBOOK" />
      ) : (
        <>
          <div className="border-b border-border bg-surface-2 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="terminal-value text-[13px]">{symbol}</span>
              <StatusFlag tone={getSignalTone(signal?.execution_signal)}>
                {signal?.readiness ?? "WAIT"}
              </StatusFlag>
            </div>
            <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
              <span className="terminal-label">Liquidity</span>
              <span className="terminal-value text-[12px] text-right">
                {signal?.liquidity_regime ?? "-"}
              </span>
              <span className="terminal-label">Confidence</span>
              <span className="terminal-value text-[12px] text-right">
                {signal?.confidence ?? 0}%
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <DepthBook
              asks={askRows}
              bids={bidRows}
              midPrice={snapshot?.mid_price ?? null}
            />
          </div>
        </>
      )}

      <div className="border-t border-border bg-card p-3">
        {onSendToTpsl && (
          <div className="space-y-2">
            <div>
              <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Position size
              </Label>
              <Input
                data-testid="orderbook-position-size-input"
                type="number"
                min="0"
                step="any"
                className="mt-1 h-8 bg-surface-2 text-xs"
                placeholder="0.00"
                value={positionSize}
                onChange={(event) => setPositionSize(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                data-testid="orderbook-send-long"
                variant="outline"
                size="sm"
                className="h-8 flex-1"
                onClick={() => onSendToTpsl("long", parsedPositionSize)}
                disabled={!canSendToTpsl}
              >
                <Target className="h-3.5 w-3.5 mr-1.5" />
                Long
              </Button>
              <Button
                data-testid="orderbook-send-short"
                variant="outline"
                size="sm"
                className="h-8 flex-1"
                onClick={() => onSendToTpsl("short", parsedPositionSize)}
                disabled={!canSendToTpsl}
              >
                <Target className="h-3.5 w-3.5 mr-1.5" />
                Short
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DepthBook({
  asks,
  bids,
  midPrice,
}: {
  asks: DepthRowData[];
  bids: DepthRowData[];
  midPrice: number | null;
}) {
  const maxAmount = Math.max(
    1,
    ...asks.map((row) => row.amount),
    ...bids.map((row) => row.amount),
  );

  return (
    <div className="bg-card">
      <div className="grid grid-cols-3 border-b border-border px-3 py-2">
        <span className="terminal-label">Price</span>
        <span className="terminal-label text-right">Size</span>
        <span className="terminal-label text-right">Total</span>
      </div>

      {asks.length === 0 && bids.length === 0 ? (
        <EmptyRailState label="NO DEPTH LEVELS" />
      ) : (
        <>
          {asks.map((row) => (
            <DepthRow
              key={`ask-${row.price}-${row.amount}`}
              row={row}
              maxAmount={maxAmount}
              tone="danger"
            />
          ))}
          <div className="grid grid-cols-3 border-y border-primary bg-primary/8 px-3 py-2">
            <span className="terminal-value text-[12px] text-primary">
              {midPrice === null ? "-" : formatPrice(midPrice)}
            </span>
            <span className="terminal-label text-center text-primary">
              MARK
            </span>
            <span className="terminal-label text-right text-primary">MID</span>
          </div>
          {bids.map((row) => (
            <DepthRow
              key={`bid-${row.price}-${row.amount}`}
              row={row}
              maxAmount={maxAmount}
              tone="success"
            />
          ))}
        </>
      )}
    </div>
  );
}

function DepthRow({
  row,
  maxAmount,
  tone,
}: {
  row: DepthRowData;
  maxAmount: number;
  tone: "success" | "danger";
}) {
  const width = Math.max(6, (row.amount / maxAmount) * 100);
  const fill =
    tone === "success" ? "rgba(74,124,89,0.14)" : "rgba(139,58,58,0.14)";

  return (
    <div className="relative grid grid-cols-3 border-b border-border px-3 py-1.5 text-[12px]">
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: `${width}%`, backgroundColor: fill }}
      />
      <span
        className={cn(
          "relative terminal-value text-[12px]",
          tone === "success" ? "text-success" : "text-destructive-foreground",
        )}
      >
        {formatPrice(row.price)}
      </span>
      <span className="relative terminal-value text-[12px] text-right">
        {formatAmount(row.amount)}
      </span>
      <span className="relative terminal-value text-[12px] text-right">
        {formatAmount(row.total)}
      </span>
    </div>
  );
}

function SystemOverviewPanelContent({
  selectedSymbol,
  symbolsCount,
  sources,
  healthStatus,
  healthUpdatedAt,
  workerStatus,
  workerUpdatedAt,
  ratesUpdatedAt,
  sessionsUpdatedAt,
  tpslActiveCount,
}: {
  selectedSymbol: string;
  symbolsCount: number;
  sources: number;
  healthStatus: string | null;
  healthUpdatedAt: number;
  workerStatus: string | null;
  workerUpdatedAt: number;
  ratesUpdatedAt: number;
  sessionsUpdatedAt: number;
  tpslActiveCount: number;
}) {
  const rows = [
    {
      label: "API",
      status: healthStatus === "ok" ? "OK" : "ISSUE",
      detail: formatAge(healthUpdatedAt),
      icon: healthStatus === "ok" ? CheckCircle2 : XCircle,
      tone: healthStatus === "ok" ? "success" : "danger",
    },
    {
      label: "Workers",
      status: workerStatus === "ok" ? "OK" : "ISSUE",
      detail: formatAge(workerUpdatedAt),
      icon: workerStatus === "ok" ? CheckCircle2 : AlertTriangle,
      tone: workerStatus === "ok" ? "success" : "warning",
    },
    {
      label: "Funding",
      status: "LIVE",
      detail: formatAge(ratesUpdatedAt),
      icon: Activity,
      tone: "accent",
    },
    {
      label: "TP / SL",
      status: `${tpslActiveCount}`,
      detail: formatAge(sessionsUpdatedAt),
      icon: Clock3,
      tone: "warning",
    },
  ] as const;

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <PanelStatRow
        columns={4}
        items={[
          { label: "Symbol", value: selectedSymbol || "-" },
          { label: "Sources", value: sources, tone: "accent" },
          { label: "Universe", value: symbolsCount },
          { label: "Mode", value: "Polling", tone: "warning" },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 border-b border-border px-3 py-3"
          >
            <div className="flex items-center gap-2">
              <row.icon className={cn("h-4 w-4", toneTextClass(row.tone))} />
              <span className="terminal-label text-foreground">
                {row.label}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="terminal-value text-[12px] text-muted-foreground">
                {row.detail}
              </span>
              <StatusFlag tone={row.tone}>{row.status}</StatusFlag>
            </div>
          </div>
        ))}
      </div>

      <PanelLinkRow to="/settings" icon={Info}>
        Open Settings
      </PanelLinkRow>
    </div>
  );
}

function BotsPanelContent({
  bots,
  isBusy,
  onToggle,
}: {
  bots: ArbBot[];
  isBusy: boolean;
  onToggle: (bot: ArbBot) => Promise<void>;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <PanelStatRow
        columns={3}
        items={[
          { label: "Total", value: bots.length },
          {
            label: "Running",
            value: bots.filter((bot) => bot.status === "running").length,
            tone: "success",
          },
          {
            label: "Errors",
            value: bots.filter((bot) => bot.status === "error").length,
            tone: "danger",
          },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {bots.length === 0 ? (
          <EmptyRailState label="NO ACTIVE BOTS" />
        ) : (
          bots.slice(0, 10).map((bot) => (
            <div key={bot.id} className="border-b border-border px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="truncate terminal-value text-[13px]">
                      {bot.name}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                    <span className="terminal-label">Symbol</span>
                    <span className="terminal-value text-[12px] text-right">
                      {bot.symbol}
                    </span>
                    <span className="terminal-label">Threshold</span>
                    <span className="terminal-value text-[12px] text-right">
                      {(bot.threshold * 10_000).toFixed(2)} BPS
                    </span>
                    <span className="terminal-label">Route</span>
                    <span className="terminal-value text-[12px] text-right">
                      {bot.reference_exchange} / {bot.hedge_exchange}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusFlag tone={botStatusTone(bot.status)}>
                    {bot.status}
                  </StatusFlag>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-3"
                    disabled={isBusy}
                    onClick={() => void onToggle(bot)}
                  >
                    {bot.status === "running" ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {bot.status === "running" ? "Stop" : "Start"}
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <PanelLinkRow to="/funding-arb" icon={Bot}>
        Open Arb Bots
      </PanelLinkRow>
    </div>
  );
}

function TpslSessionModal({
  sessionId,
  open,
  onOpenChange,
  allSessions,
}: {
  sessionId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allSessions: TpslSession[];
}) {
  const selectedSession =
    allSessions.find((session) => session.id === sessionId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border bg-card p-0 shadow-none">
        <DialogHeader className="border-b border-border bg-surface-2 px-6 py-4">
          <div className="flex items-center justify-between gap-4 pr-8">
            <DialogTitle className="terminal-label text-foreground">
              TP / SL Session {selectedSession?.id ?? "-"}
            </DialogTitle>
            <span className="terminal-value text-[13px]">
              {selectedSession?.symbol ?? "-"}
            </span>
          </div>
        </DialogHeader>

        {selectedSession ? (
          <div className="space-y-4 px-6 py-5">
            <div className="grid gap-px bg-border md:grid-cols-2">
              <ModalMetric
                label="Side"
                value={selectedSession.side}
                tone={selectedSession.side === "long" ? "success" : "danger"}
              />
              <ModalMetric label="Status" value={selectedSession.status} />
              <ModalMetric
                label="Entry"
                value={formatPrice(selectedSession.entry_price)}
              />
              <ModalMetric
                label="Size"
                value={formatAmount(selectedSession.current_position_size)}
              />
              <ModalMetric
                label="Take Profit"
                value={formatPrice(selectedSession.take_profit_price)}
                tone={selectedSession.take_profit_price ? "accent" : "neutral"}
              />
              <ModalMetric
                label="Stop Loss"
                value={formatPrice(selectedSession.stop_loss_price)}
                tone={selectedSession.stop_loss_price ? "danger" : "neutral"}
              />
            </div>

            <div className="border-t border-border pt-4">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 w-full"
              >
                <Link
                  to={`/tp-sl?symbol=${encodeURIComponent(selectedSession.symbol)}`}
                >
                  <Target className="h-3.5 w-3.5" />
                  Open Full TP / SL Dashboard
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-8 text-center">
            <span className="terminal-value text-[12px] text-muted-foreground">
              SESSION NOT FOUND
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModalMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: PanelTone;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="terminal-label">{label}</div>
      <div
        className={cn("mt-1 terminal-value text-[13px]", toneTextClass(tone))}
      >
        {value}
      </div>
    </div>
  );
}

type ElfaChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function TradingCornerPanelContent({
  selectedSymbol,
  rates,
  details,
}: {
  selectedSymbol: string;
  rates?: {
    timestamp?: number;
    rates?: Record<
      string,
      {
        symbol: string;
        funding_rate: string;
        next_funding_rate: string;
        mark_price: string;
        index_price: string;
      }
    >;
    venues?: Record<
      string,
      Record<
        string,
        {
          symbol: string;
          funding_rate: string;
          next_funding_rate: string;
          mark_price: string;
          index_price: string;
        }
      >
    >;
  };
  details?: {
    symbol: string;
    pacifica?: { funding_rate?: string; mark_price?: string; status?: string };
    hyperliquid?: {
      funding_rate?: string;
      mark_price?: string;
      status?: string;
    };
    lighter?: { funding_rate?: string; mark_price?: string; status?: string };
    binance?: { funding_rate?: string; mark_price?: string; status?: string };
    bybit?: { funding_rate?: string; mark_price?: string; status?: string };
  };
}) {
  const { ready, user, login } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [chatMessages, setChatMessages] = useState<ElfaChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Ask ELFA AI about funding pressure, venue divergence, or the current symbol.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const isLoggedIn = Boolean(user);
  const exchanges = [
    { key: "pacifica", label: "Pacifica", data: details?.pacifica },
    { key: "hyperliquid", label: "Hyperliquid", data: details?.hyperliquid },
    { key: "lighter", label: "Lighter", data: details?.lighter },
    { key: "binance", label: "Binance", data: details?.binance },
    { key: "bybit", label: "Bybit", data: details?.bybit },
  ];

  const formatRate = (value?: string) => {
    if (!value) return "-";
    const num = parseFloat(value);
    return num === 0 ? "0%" : `${(num * 100).toFixed(4)}%`;
  };

  const formatPrice = (value?: string) => {
    if (!value) return "-";
    return parseFloat(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const getStatusTone = (status?: string): PanelTone => {
    if (status === "ok") return "success";
    if (status === "partial") return "warning";
    if (status === "unavailable") return "neutral";
    return "neutral";
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ block: "end" });
  }, [chatMessages, isChatLoading]);

  const appendAssistantMessage = (content: string) => {
    setChatMessages((prev) => [
      ...prev,
      {
        id: `assistant-${Date.now()}-${prev.length}`,
        role: "assistant",
        content,
      },
    ]);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput("");

    if (!ready || !isLoggedIn) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-login-${Date.now()}-${prev.length}`,
          role: "assistant",
          content: "Please log in first to use ELFA AI chat.",
        },
      ]);
      return;
    }

    setChatMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}-${prev.length}`,
        role: "user",
        content: userMessage,
      },
    ]);
    setIsChatLoading(true);

    try {
      const data = await api.arb.sendElfaChat({
        message: userMessage,
        symbol: selectedSymbol || undefined,
      });
      appendAssistantMessage(
        data.response || data.error || "ELFA AI did not return a response.",
      );
    } catch (error) {
      logger.error("overview.elfa_chat.failed", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      appendAssistantMessage("Failed to connect to ELFA AI.");
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="border-b border-border bg-surface-2 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="terminal-label">ELFA AI Trading</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedSymbol
                ? `Chat context: ${selectedSymbol}`
                : "Select a symbol for market context"}
            </div>
          </div>
          <StatusFlag tone={isLoggedIn ? "success" : "warning"}>
            {isLoggedIn ? "Ready" : "Login"}
          </StatusFlag>
        </div>
      </div>

      <div className="min-h-0 shrink-0 border-b border-border bg-card">
        <div className="grid grid-cols-4 border-b border-border bg-surface-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Exchange</span>
          <span className="text-right">Funding</span>
          <span className="text-right">Mark Price</span>
          <span className="text-right">Status</span>
        </div>

        {exchanges.map((exchange) => (
          <div
            key={exchange.key}
            className="grid grid-cols-4 items-center border-b border-border px-3 py-3"
          >
            <span className="terminal-value text-[13px]">
              {exchange.label}
            </span>
            <span className="terminal-value text-right text-[12px]">
              {formatRate(exchange.data?.funding_rate)}
            </span>
            <span className="terminal-value text-right text-[12px]">
              {formatPrice(exchange.data?.mark_price)}
            </span>
            <span className="text-right">
              <StatusFlag tone={getStatusTone(exchange.data?.status)}>
                {exchange.data?.status ?? "N/A"}
              </StatusFlag>
            </span>
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border bg-surface-2 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="terminal-label text-xs">Chat Messages</div>
            <span className="terminal-value text-[11px] text-muted-foreground">
              {chatMessages.length}
            </span>
          </div>
        </div>

        <div
          data-testid="elfa-chat-messages"
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
        >
          {chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "max-w-[88%] border px-3 py-2 text-xs leading-5",
                msg.role === "user"
                  ? "ml-auto border-primary/40 bg-primary/12 text-foreground"
                  : "mr-auto border-border bg-surface-2 text-muted-foreground",
              )}
            >
              <div className="mb-1 terminal-label text-[10px]">
                {msg.role === "user" ? "You" : "ELFA AI"}
              </div>
              <div className="whitespace-pre-wrap break-words">
                {msg.content}
              </div>
            </div>
          ))}
          {isChatLoading && (
            <div className="mr-auto flex max-w-[88%] items-center gap-2 border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ELFA AI is thinking
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border bg-card p-2">
          {!isLoggedIn ? (
            <button
              type="button"
              onClick={login}
              className="mb-2 flex w-full items-center justify-center gap-2 border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-warning transition-colors hover:border-warning"
            >
              <LogIn className="h-3.5 w-3.5" />
              Login to chat
            </button>
          ) : null}
          <div className="flex items-end gap-2">
            <Textarea
              data-testid="elfa-chat-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask ELFA AI..."
              className="min-h-[64px] flex-1 resize-none rounded-none border-border bg-background text-xs"
            />
            <Button
              type="button"
              size="sm"
              className="h-10 px-3"
              onClick={() => void sendChatMessage()}
              disabled={isChatLoading || !chatInput.trim()}
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </Button>
          </div>
        </div>
      </div>

      <PanelLinkRow to="/funding-arb" icon={Bot}>
        Create Arb Bot
      </PanelLinkRow>
    </div>
  );
}
