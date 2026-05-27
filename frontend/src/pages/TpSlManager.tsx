import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Clock3,
  Plus,
  SquareSlash,
  Target,
  Trash2,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";

import {
  EmptyPanelState,
  PageTabs,
  PanelCard,
} from "@/components/layout/PageShell";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { useOrderbookSymbols } from "@/hooks/useOrderbook";
import {
  useCancelTpslSession,
  useCloseTpslSession,
  useCreateTpslSession,
  useTpslSessionEvents,
  useTpslSessions,
} from "@/hooks/useTpsl";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import type { TpslEvent, TpslSession } from "@/lib/api";
import { logger } from "@/lib/logger";

type TpLevelForm = {
  price: string;
  size: string;
};

type SessionWorkspaceTab = "live" | "history" | "activity";

function formatApiError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function eventTone(
  eventType: string,
): "primary" | "success" | "warning" | "danger" | "neutral" {
  if (eventType.includes("failed") || eventType.includes("error")) {
    return "danger";
  }
  if (
    eventType.includes("filled") ||
    eventType.includes("closed") ||
    eventType.includes("triggered")
  ) {
    return "success";
  }
  if (eventType.includes("cancelled")) {
    return "warning";
  }
  if (eventType.includes("trailing") || eventType.includes("protection")) {
    return "primary";
  }
  return "neutral";
}

export default function TpSlManager() {
  const [searchParams] = useSearchParams();
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [entryPrice, setEntryPrice] = useState("");
  const [positionSize, setPositionSize] = useState("");
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [enableTrailing, setEnableTrailing] = useState(false);
  const [trailingDistance, setTrailingDistance] = useState("");
  const [tpLevels, setTpLevels] = useState<TpLevelForm[]>([
    { price: "", size: "25" },
  ]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    null,
  );
  const [sessionWorkspaceTab, setSessionWorkspaceTab] =
    useState<SessionWorkspaceTab>("live");
  const consumedSearchSymbol = useRef(false);
  const isMobile = useIsMobile();

  const requestedSymbol = (searchParams.get("symbol") ?? "").replace(
    /[-_].*$/,
    "",
  );
  const symbolsQuery = useOrderbookSymbols();
  const sessionsQuery = useTpslSessions();
  const createSession = useCreateTpslSession();
  const cancelSession = useCancelTpslSession();
  const closeSession = useCloseTpslSession();

  const availableSymbols = useMemo(() => {
    const source = symbolsQuery.data?.symbols ?? [];
    return [
      ...new Set(
        source.map((value) => value.replace(/[-_].*$/, "")).filter(Boolean),
      ),
    ];
  }, [symbolsQuery.data?.symbols]);

  useEffect(() => {
    consumedSearchSymbol.current = false;
  }, [requestedSymbol]);

  useEffect(() => {
    if (availableSymbols.length === 0) {
      if (symbol) {
        setSymbol("");
      }
      return;
    }

    if (
      requestedSymbol &&
      !consumedSearchSymbol.current &&
      availableSymbols.includes(requestedSymbol)
    ) {
      setSymbol(requestedSymbol);
      consumedSearchSymbol.current = true;
      return;
    }

    if (!symbol || !availableSymbols.includes(symbol)) {
      setSymbol(availableSymbols[0]);
    }
  }, [availableSymbols, requestedSymbol, symbol]);

  const allSessions = sessionsQuery.data?.sessions ?? [];
  const activeSessions = useMemo(
    () => allSessions.filter((session) => session.status === "active"),
    [allSessions],
  );
  const inactiveSessions = useMemo(
    () => allSessions.filter((session) => session.status !== "active"),
    [allSessions],
  );

  useEffect(() => {
    if (allSessions.length === 0) {
      if (selectedSessionId !== null) {
        setSelectedSessionId(null);
      }
      return;
    }

    const hasSelected =
      selectedSessionId !== null &&
      allSessions.some((session) => session.id === selectedSessionId);
    if (!hasSelected) {
      setSelectedSessionId(activeSessions[0]?.id ?? allSessions[0]?.id ?? null);
    }
  }, [activeSessions, allSessions, selectedSessionId]);

  const selectedSession =
    allSessions.find((session) => session.id === selectedSessionId) ?? null;
  const eventsQuery = useTpslSessionEvents(
    selectedSession?.id ?? null,
    Boolean(selectedSession),
  );

  const isBusy =
    createSession.isPending ||
    cancelSession.isPending ||
    closeSession.isPending;
  const sessionWorkspaceItems = [
    {
      value: "live",
      label: "Live sessions",
      badge: activeSessions.length,
    },
    {
      value: "history",
      label: "Session history",
      badge: inactiveSessions.length,
    },
    {
      value: "activity",
      label: "Session activity",
      badge: selectedSession ? `#${selectedSession.id}` : 0,
    },
  ] as const;

  const sessionWorkspaceDescription =
    sessionWorkspaceTab === "live"
      ? "Active TP/SL sessions stay here. Select one to keep it pinned for the activity view."
      : sessionWorkspaceTab === "history"
        ? "Closed and cancelled sessions remain available here so you can keep reviewing them after they leave the live set."
        : "The activity view reads from the existing event endpoint for the currently selected session.";

  const handleCreateSession = async () => {
    if (!symbol) {
      toast({
        title: "Symbol required",
        description: "No symbols are available yet.",
        variant: "destructive",
      });
      return;
    }
    const parsedEntry = Number(entryPrice);
    const parsedSize = Number(positionSize);
    const parsedTp = takeProfitPrice ? Number(takeProfitPrice) : undefined;
    const parsedSl = stopLossPrice ? Number(stopLossPrice) : undefined;
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
      logger.info("tpsl.session.create.request", {
        symbol,
        side,
        hasTakeProfit: Boolean(parsedTp),
        hasStopLoss: Boolean(parsedSl),
        hasTrailing: Boolean(parsedTrailing),
        partialLevels: partialLevels.length,
      });
      const created = await createSession.mutateAsync({
        symbol,
        side,
        entry_price: parsedEntry,
        position_size: parsedSize,
        take_profit_price: parsedTp,
        stop_loss_price: parsedSl,
        trailing_stop_distance: parsedTrailing,
        partial_tp_levels: partialLevels.length > 0 ? partialLevels : undefined,
      });
      toast({
        title: "Session started",
        description: `${symbol} ${side.toUpperCase()} TP/SL session created.`,
      });
      logger.info("tpsl.session.create.success", {
        symbol,
        side,
        sessionId: created.id,
      });
      setSelectedSessionId(created.id);
      setEntryPrice("");
      setPositionSize("");
      setTakeProfitPrice("");
      setStopLossPrice("");
      setTrailingDistance("");
      setEnableTrailing(false);
      setTpLevels([{ price: "", size: "25" }]);
      setAdvancedOpen(false);
    } catch (error) {
      logger.error("tpsl.session.create.error", {
        symbol,
        side,
        message: formatApiError(error),
      });
      toast({
        title: "Create failed",
        description: formatApiError(error),
        variant: "destructive",
      });
    }
  };

  const handleCancelSession = async (sessionId: number) => {
    try {
      logger.info("tpsl.session.cancel.request", { sessionId });
      await cancelSession.mutateAsync(sessionId);
      toast({
        title: "Session canceled",
        description: `Session #${sessionId} canceled.`,
      });
      logger.info("tpsl.session.cancel.success", { sessionId });
    } catch (error) {
      logger.error("tpsl.session.cancel.error", {
        sessionId,
        message: formatApiError(error),
      });
      toast({
        title: "Cancel failed",
        description: formatApiError(error),
        variant: "destructive",
      });
    }
  };

  const handleCloseSession = async (sessionId: number) => {
    try {
      logger.info("tpsl.session.close.request", { sessionId });
      await closeSession.mutateAsync(sessionId);
      toast({
        title: "Session closed",
        description: `Session #${sessionId} was closed.`,
      });
      logger.info("tpsl.session.close.success", { sessionId });
    } catch (error) {
      logger.error("tpsl.session.close.error", {
        sessionId,
        message: formatApiError(error),
      });
      toast({
        title: "Manual close failed",
        description: formatApiError(error),
        variant: "destructive",
      });
    }
  };

  return (
    <div
      data-testid="tpsl-page"
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <ResizablePanelGroup
        data-testid="tpsl-resizable-group"
        direction={isMobile ? "vertical" : "horizontal"}
        className="h-[calc(100dvh-6rem)] min-h-[36rem] flex-1 overflow-hidden"
      >
        <ResizablePanel
          defaultSize={isMobile ? 48 : 42}
          minSize={isMobile ? 32 : 28}
          className="min-h-0"
        >
          <PanelCard
            title="Create TP/SL session"
            description="The primary controls stay visible. Trailing and partial-take-profit controls stay under a compact disclosure block."
            className="flex h-full min-h-0 flex-col"
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-5"
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Symbol
                  </Label>
                  <Select value={symbol} onValueChange={setSymbol}>
                    <SelectTrigger className="mt-1 h-9 bg-surface-2 text-xs">
                      <SelectValue placeholder="Select symbol" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSymbols.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          No symbols available
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
                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Side
                  </Label>
                  <Select
                    value={side}
                    onValueChange={(value: "long" | "short") => setSide(value)}
                  >
                    <SelectTrigger className="mt-1 h-9 bg-surface-2 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="long">Long</SelectItem>
                      <SelectItem value="short">Short</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Entry price
                  </Label>
                  <Input
                    type="number"
                    className="mt-1 h-9 bg-surface-2 text-xs"
                    placeholder="0.00"
                    value={entryPrice}
                    onChange={(event) => setEntryPrice(event.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Position size
                  </Label>
                  <Input
                    type="number"
                    className="mt-1 h-9 bg-surface-2 text-xs"
                    placeholder="0.00"
                    value={positionSize}
                    onChange={(event) => setPositionSize(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Take profit
                  </Label>
                  <Input
                    type="number"
                    className="mt-1 h-9 bg-surface-2 text-xs"
                    placeholder="Optional"
                    value={takeProfitPrice}
                    onChange={(event) => setTakeProfitPrice(event.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Stop loss
                  </Label>
                  <Input
                    type="number"
                    className="mt-1 h-9 bg-surface-2 text-xs"
                    placeholder="Optional"
                    value={stopLossPrice}
                    onChange={(event) => setStopLossPrice(event.target.value)}
                  />
                </div>
              </div>

              <Collapsible
                open={advancedOpen}
                onOpenChange={setAdvancedOpen}
                className="border border-border/70 bg-surface-2/50"
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground"
                  >
                    <span>Advanced controls</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-border/70 px-4 py-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                          Trailing stop
                        </Label>
                        <Switch
                          checked={enableTrailing}
                          onCheckedChange={setEnableTrailing}
                        />
                      </div>
                      {enableTrailing ? (
                        <Input
                          type="number"
                          className="h-9 bg-surface-2 text-xs"
                          placeholder="Trailing distance"
                          value={trailingDistance}
                          onChange={(event) =>
                            setTrailingDistance(event.target.value)
                          }
                        />
                      ) : null}
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <Label className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                          Partial take profit
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] text-primary"
                          onClick={() =>
                            setTpLevels((levels) => [
                              ...levels,
                              { price: "", size: "25" },
                            ])
                          }
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Add level
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {tpLevels.map((level, index) => (
                          <div
                            key={`${index}-${level.size}`}
                            className="flex items-center gap-2"
                          >
                            <Input
                              placeholder="TP price"
                              className="h-8 flex-1 bg-surface-2 text-xs"
                              value={level.price}
                              onChange={(event) => {
                                const next = [...tpLevels];
                                next[index] = {
                                  ...next[index],
                                  price: event.target.value,
                                };
                                setTpLevels(next);
                              }}
                            />
                            <Input
                              placeholder="Size %"
                              className="h-8 w-20 bg-surface-2 text-xs"
                              value={level.size}
                              onChange={(event) => {
                                const next = [...tpLevels];
                                next[index] = {
                                  ...next[index],
                                  size: event.target.value,
                                };
                                setTpLevels(next);
                              }}
                            />
                            {tpLevels.length > 1 ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  setTpLevels((levels) =>
                                    levels.filter((_, idx) => idx !== index),
                                  )
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Button
                className="h-9 w-full text-xs"
                disabled={isBusy || !symbol}
                onClick={() => void handleCreateSession()}
              >
                <Target className="mr-1.5 h-3.5 w-3.5" />
                Start TP/SL session
              </Button>
            </div>
          </PanelCard>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          data-testid="tpsl-resize-handle"
          className="bg-border/80"
        />
        <ResizablePanel
          defaultSize={isMobile ? 52 : 58}
          minSize={isMobile ? 32 : 34}
          className="min-h-0"
        >
          <PanelCard
            title="Session workspace"
            description={sessionWorkspaceDescription}
            className="flex h-full min-h-0 flex-col"
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5"
          >
            <div
              className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto pr-1"
              data-testid={`tpsl-session-view-${sessionWorkspaceTab}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <PageTabs
                  value={sessionWorkspaceTab}
                  onValueChange={(value) =>
                    setSessionWorkspaceTab(value as SessionWorkspaceTab)
                  }
                  items={sessionWorkspaceItems}
                />
              </div>
              {selectedSession ? (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-surface-2/40 px-3 py-2 text-xs text-muted-foreground">
                  <span className="uppercase tracking-[0.14em]">
                    Selected session
                  </span>
                  <span className="font-mono text-foreground">
                    {selectedSession.symbol}
                  </span>
                  <Badge variant="outline">#{selectedSession.id}</Badge>
                  <Badge
                    variant="outline"
                    className={
                      selectedSession.status === "active"
                        ? "border-primary/30 text-primary"
                        : selectedSession.status === "closed"
                          ? "border-success/30 text-success"
                          : "border-warning/30 text-warning"
                    }
                  >
                    {selectedSession.status}
                  </Badge>
                </div>
              ) : null}

              {sessionWorkspaceTab === "live" ? (
                sessionsQuery.isLoading ? (
                  <div className="text-xs text-muted-foreground">
                    Loading sessions...
                  </div>
                ) : sessionsQuery.isError ? (
                  <div className="text-xs text-danger">
                    Failed to load sessions:{" "}
                    {formatApiError(sessionsQuery.error)}
                  </div>
                ) : activeSessions.length === 0 ? (
                  <EmptyPanelState
                    title="No active sessions"
                    description="Create a TP/SL session to populate this panel."
                    className="min-h-64"
                  />
                ) : (
                  <div className="space-y-3">
                    {activeSessions.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        selected={session.id === selectedSessionId}
                        busy={isBusy}
                        onSelect={() => setSelectedSessionId(session.id)}
                        onCancel={() => void handleCancelSession(session.id)}
                        onClose={() => void handleCloseSession(session.id)}
                      />
                    ))}
                  </div>
                )
              ) : null}

              {sessionWorkspaceTab === "history" ? (
                sessionsQuery.isLoading ? (
                  <div className="text-xs text-muted-foreground">
                    Loading session history...
                  </div>
                ) : inactiveSessions.length === 0 ? (
                  <EmptyPanelState
                    title="No archived sessions"
                    description="Closed and cancelled TP/SL sessions will appear here."
                    className="min-h-56"
                  />
                ) : (
                  <div className="space-y-3">
                    {inactiveSessions.map((session) => (
                      <ArchivedSessionCard
                        key={session.id}
                        session={session}
                        selected={session.id === selectedSessionId}
                        onSelect={() => setSelectedSessionId(session.id)}
                      />
                    ))}
                  </div>
                )
              ) : null}

              {sessionWorkspaceTab === "activity" ? (
                !selectedSession ? (
                  <EmptyPanelState
                    title="No session selected"
                    description="Select an active or historical TP/SL session to inspect its event history."
                    className="min-h-56"
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      <span>Session #{selectedSession.id}</span>
                    </div>
                    {eventsQuery.isLoading ? (
                      <div className="text-xs text-muted-foreground">
                        Loading events...
                      </div>
                    ) : eventsQuery.isError ? (
                      <div className="text-xs text-danger">
                        Failed to load session events:{" "}
                        {formatApiError(eventsQuery.error)}
                      </div>
                    ) : (eventsQuery.data?.events.length ?? 0) === 0 ? (
                      <EmptyPanelState
                        title="No events recorded yet"
                        description="Session lifecycle and execution events will appear here as the monitor and execution service update the session."
                        className="min-h-56"
                      />
                    ) : (
                      <div className="space-y-3">
                        {eventsQuery.data?.events.map((event) => (
                          <EventRow key={event.id} event={event} />
                        ))}
                      </div>
                    )}
                  </>
                )
              ) : null}
            </div>
          </PanelCard>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function SessionCard({
  session,
  selected,
  busy,
  onSelect,
  onCancel,
  onClose,
}: {
  session: TpslSession;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const triggeredCount = (session.partial_tp_levels ?? []).filter(
    (level) => level.triggered,
  ).length;
  const totalLevels = session.partial_tp_levels?.length ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`w-full border p-4 text-left transition-colors ${
        selected
          ? "border-primary/30 bg-primary/8"
          : "border-border/70 bg-surface-2/60 hover:bg-surface-2/80"
      }`}
    >
      <div className="flex flex-col gap-3 border-b border-border/60 pb-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium text-foreground">
            {session.symbol}
          </span>
          <Badge
            variant="outline"
            className={
              session.side === "long"
                ? "border-success/30 text-success"
                : "border-danger/30 text-danger"
            }
          >
            {session.side.toUpperCase()}
          </Badge>
          <Badge variant="outline" className="border-primary/30 text-primary">
            {session.status}
          </Badge>
          {session.trailing_stop_activated ? (
            <Badge variant="outline" className="border-primary/30 text-primary">
              Trailing on
            </Badge>
          ) : null}
          <Badge
            variant="outline"
            className="border-border text-muted-foreground"
          >
            {session.exchange}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            <SquareSlash className="mr-1.5 h-3.5 w-3.5" />
            Close
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onCancel();
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SessionStat label="Entry" value={formatNumber(session.entry_price)} />
        <SessionStat
          label="Initial size"
          value={formatNumber(session.position_size)}
        />
        <SessionStat
          label="Tracked size"
          value={formatNumber(
            session.current_position_size ?? session.position_size,
          )}
        />
        <SessionStat
          label="Take profit"
          value={formatNumber(session.take_profit_price)}
          tone="up"
        />
        <SessionStat
          label="Stop loss"
          value={formatNumber(session.stop_loss_price)}
          tone="down"
        />
        <SessionStat
          label="Trailing distance"
          value={formatNumber(session.trailing_stop_distance)}
        />
        <SessionStat
          label="Partial TP"
          value={`${triggeredCount}/${totalLevels} triggered`}
        />
        <SessionStat label="Account" value={session.account} />
      </div>
    </div>
  );
}

function ArchivedSessionCard({
  session,
  selected,
  onSelect,
}: {
  session: TpslSession;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
        selected
          ? "border-primary/30 bg-primary/8"
          : "border-border/70 bg-surface-2/50 hover:bg-surface-2/80"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium text-foreground">
            {session.symbol}
          </span>
          <Badge
            variant="outline"
            className={
              session.status === "closed"
                ? "border-success/30 text-success"
                : "border-warning/30 text-warning"
            }
          >
            {session.status}
          </Badge>
          {session.close_reason ? (
            <Badge
              variant="outline"
              className="border-border text-muted-foreground"
            >
              {session.close_reason}
            </Badge>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(session.updated_at).toLocaleString()}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SessionStat label="Exchange" value={session.exchange} />
        <SessionStat
          label="Tracked size"
          value={formatNumber(
            session.current_position_size ?? session.position_size,
          )}
        />
        <SessionStat label="Account" value={session.account} />
      </div>
    </button>
  );
}

function EventRow({ event }: { event: TpslEvent }) {
  const tone = eventTone(event.event_type);
  return (
    <div className="border border-border/70 bg-surface-2/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={
              tone === "success"
                ? "border-success/30 text-success"
                : tone === "danger"
                  ? "border-danger/30 text-danger"
                  : tone === "warning"
                    ? "border-warning/30 text-warning"
                    : tone === "primary"
                      ? "border-primary/30 text-primary"
                      : "border-border text-muted-foreground"
            }
          >
            {event.event_type}
          </Badge>
          {event.price !== null ? (
            <span className="font-mono text-xs text-foreground">
              {formatNumber(event.price)}
            </span>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(event.created_at).toLocaleString()}
        </span>
      </div>
      {event.details ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {event.details}
        </p>
      ) : null}
    </div>
  );
}

function SessionStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "up" | "down";
}) {
  return (
    <div className="border border-border/60 bg-background/30 p-3">
      <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <p
        className={`mt-2 break-all font-mono text-sm ${
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
