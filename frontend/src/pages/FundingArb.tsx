import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Rocket, BrainCircuit, KeyRound, Wifi, WifiOff } from "lucide-react";

import {
  EmptyPanelState,
  PanelCard,
  PanelSplit,
} from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  useArbBots,
  useArbCoinDetails,
  useArbRates,
  useArbSpreads,
  useCreateArbBot,
  useElfaStatus,
  useStartArbBot,
  useStopArbBot,
} from "@/hooks/useArb";
import { useExchangeStatus } from "@/hooks/useExchange";
import { toast } from "@/hooks/use-toast";
import {
  formatFundingRatePercent,
  getAggregatedFundingSnapshot,
  parseFundingNumber,
} from "@/lib/arbFunding";
import type { ArbBot, ExchangeCoinDetails } from "@/lib/api";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

type RateRow = {
  symbol: string;
  aggregateFundingRate: number | null;
  aggregateNextFundingRate: number | null;
  pacificaFundingRate: number;
  pacificaNextFundingRate: number;
  hyperliquidFundingRate: number | null;
  lighterFundingRate: number | null;
  bestSpreadBps: number;
};

type BotRateSnapshot = {
  fundingRate: number | null;
  nextFundingRate: number | null;
};

type TradingVenue = "pacifica" | "hyperliquid" | "lighter";

const VENUE_LABELS: Record<TradingVenue, string> = {
  pacifica: "Pacifica",
  hyperliquid: "Hyperliquid",
  lighter: "Lighter",
};

function getRequiredVenues(
  referenceExchange: string,
  hedgeExchange: string,
): TradingVenue[] {
  const venues = new Set<TradingVenue>(["pacifica"]);
  if (referenceExchange === "hyperliquid" || referenceExchange === "lighter") {
    venues.add(referenceExchange);
  }
  if (hedgeExchange === "hyperliquid" || hedgeExchange === "lighter") {
    venues.add(hedgeExchange);
  }
  return Array.from(venues);
}

function toBps(rate: number): number {
  return rate * 10_000;
}

function formatApiError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function findSymbolBot(
  bots: ArbBot[] | undefined,
  symbol: string,
): ArbBot | undefined {
  if (!bots) {
    return undefined;
  }
  return bots.find((bot) => bot.symbol === symbol);
}

function formatFundingPct(value: string | null | undefined): string {
  const parsed = parseFundingNumber(value);
  if (parsed === null) {
    return "-";
  }
  return `${(parsed * 100).toFixed(4)}%`;
}

function formatPrice(value: string | null | undefined): string {
  const parsed = parseFundingNumber(value);
  if (parsed === null) {
    return "-";
  }
  return `$${parsed.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}

export default function FundingArb() {
  const [selected, setSelected] = useState<string | null>(null);
  const [thresholdBps, setThresholdBps] = useState([5]);
  const [maxPositionSize, setMaxPositionSize] = useState("1000");
  const [referenceExchange, setReferenceExchange] = useState("hyperliquid");
  const [hedgeExchange, setHedgeExchange] = useState("auto");

  const ratesQuery = useArbRates();
  const spreadsQuery = useArbSpreads();
  const botsQuery = useArbBots();
  const createBot = useCreateArbBot();
  const startBot = useStartArbBot();
  const stopBot = useStopArbBot();
  const exchangeStatusQuery = useExchangeStatus();
  const coinDetailsQuery = useArbCoinDetails(selected ?? "", Boolean(selected));
  const elfaStatusQuery = useElfaStatus();

  const rows = useMemo<RateRow[]>(() => {
    const rates = ratesQuery.data?.rates ?? {};
    const hyperliquidRates = ratesQuery.data?.venues?.hyperliquid ?? {};
    const lighterRates = ratesQuery.data?.venues?.lighter ?? {};

    return Object.values(rates)
      .map((item) => {
        const aggregateSnapshot = getAggregatedFundingSnapshot(item.symbol, ratesQuery.data);
        const pacificaFundingRate = Number(item.funding_rate || 0);
        const hyperliquidFundingRate = parseFundingNumber(
          hyperliquidRates[item.symbol]?.funding_rate,
        );
        const lighterFundingRate = parseFundingNumber(
          lighterRates[item.symbol]?.funding_rate,
        );
        const spreadCandidates = [
          hyperliquidFundingRate,
          lighterFundingRate,
        ]
          .filter((value): value is number => value !== null)
          .map((value) => Math.abs((pacificaFundingRate - value) * 10_000));

        return {
          symbol: item.symbol,
          aggregateFundingRate: aggregateSnapshot.fundingRate,
          aggregateNextFundingRate: aggregateSnapshot.nextFundingRate,
          pacificaFundingRate,
          pacificaNextFundingRate: Number(item.next_funding_rate || 0),
          hyperliquidFundingRate,
          lighterFundingRate,
          bestSpreadBps:
            spreadCandidates.length > 0 ? Math.max(...spreadCandidates) : 0,
        };
      })
      .sort(
        (left, right) =>
          Math.abs(right.bestSpreadBps) - Math.abs(left.bestSpreadBps),
      );
  }, [ratesQuery.data]);

  const botRateBySymbol = useMemo<Record<string, BotRateSnapshot>>(() => {
    const rates = ratesQuery.data?.rates ?? {};

    return Object.values(rates).reduce<Record<string, BotRateSnapshot>>((acc, item) => {
      const aggregateSnapshot = getAggregatedFundingSnapshot(item.symbol, ratesQuery.data);
      acc[item.symbol] = {
        fundingRate: aggregateSnapshot.fundingRate,
        nextFundingRate: aggregateSnapshot.nextFundingRate,
      };
      return acc;
    }, {});
  }, [ratesQuery.data]);

  useEffect(() => {
    if (!selected && rows.length > 0) {
      setSelected(rows[0].symbol);
    }
  }, [rows, selected]);

  const selectedData = rows.find((row) => row.symbol === selected);
  const selectedBot = findSymbolBot(botsQuery.data?.bots, selected ?? "");
  const coinDetails = coinDetailsQuery.data;
  const requiredVenues = useMemo(
    () => getRequiredVenues(referenceExchange, hedgeExchange),
    [hedgeExchange, referenceExchange],
  );
  const missingVenues = requiredVenues.filter(
    (venue) => !exchangeStatusQuery.data?.[venue]?.connected,
  );
  const createdBots = botsQuery.data?.bots ?? [];
  const runningBots = createdBots.filter(
    (bot) => bot.status === "running",
  ).length;
  const isBusy = createBot.isPending || startBot.isPending || stopBot.isPending;

  const handleDeployBot = async () => {
    if (!selectedData) {
      return;
    }

    const parsedMaxSize = Number(maxPositionSize);
    if (!Number.isFinite(parsedMaxSize) || parsedMaxSize <= 0) {
      toast({
        title: "Invalid size",
        description: "Max position size must be a positive number.",
        variant: "destructive",
      });
      return;
    }

    try {
      logger.info("arb.bot.create.request", {
        symbol: selectedData.symbol,
        thresholdBps: thresholdBps[0],
        maxPositionSize: parsedMaxSize,
        referenceExchange,
        hedgeExchange,
      });
      await createBot.mutateAsync({
        name: `${selectedData.symbol}-${referenceExchange}-bot`,
        symbol: selectedData.symbol,
        threshold: thresholdBps[0] / 10_000,
        max_position_size: parsedMaxSize,
        reference_exchange: referenceExchange,
        hedge_exchange: hedgeExchange,
      });
      toast({
        title: "Bot created",
        description: `${selectedData.symbol} standby bot saved`,
      });
      logger.info("arb.bot.create.success", { symbol: selectedData.symbol });
    } catch (error) {
      logger.error("arb.bot.create.error", {
        symbol: selectedData.symbol,
        message: formatApiError(error),
      });
      toast({
        title: "Create failed",
        description: formatApiError(error),
        variant: "destructive",
      });
    }
  };

  const handleToggleBot = async (bot: ArbBot) => {
    try {
      logger.info("arb.bot.toggle.request", {
        botId: bot.id,
        name: bot.name,
        currentStatus: bot.status,
      });
      if (bot.status === "running") {
        await stopBot.mutateAsync(bot.id);
        toast({ title: "Bot disabled", description: `${bot.name} in standby` });
        logger.info("arb.bot.stop.success", { botId: bot.id, name: bot.name });
      } else {
        await startBot.mutateAsync(bot.id);
        toast({ title: "Bot enabled", description: `${bot.name} active` });
        logger.info("arb.bot.start.success", { botId: bot.id, name: bot.name });
      }
    } catch (error) {
      logger.error("arb.bot.toggle.error", {
        botId: bot.id,
        name: bot.name,
        message: formatApiError(error),
      });
      toast({
        title: "Bot action failed",
        description: formatApiError(error),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {elfaStatusQuery.data && (
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-surface-2/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <BrainCircuit className={cn("h-4 w-4", elfaStatusQuery.data.reachable ? "text-primary" : "text-muted-foreground")} />
            <span className="text-xs font-medium text-foreground">ELFA AI</span>
            <Badge
              variant="outline"
              className={cn(
                "text-2xs h-5 px-1",
                elfaStatusQuery.data.reachable
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-warning/30 bg-warning/10 text-warning"
              )}
            >
              {elfaStatusQuery.data.reachable ? (
                <Wifi className="mr-1 h-2.5 w-2.5" />
              ) : (
                <WifiOff className="mr-1 h-2.5 w-2.5" />
              )}
              {elfaStatusQuery.data.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>Confidence Weight: 25%</span>
            <span>Fallback: {elfaStatusQuery.data.fallback_mode}</span>
          </div>
        </div>
      )}
      <PanelSplit
        left={
          <PanelCard
            title="Funding rates"
            description="Select symbol to build bot"
            action={
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Threshold</span>
                <Slider
                  value={thresholdBps}
                  onValueChange={setThresholdBps}
                  min={0}
                  max={30}
                  step={0.5}
                  className="w-16 sm:w-24"
                />
                <span className="font-mono text-foreground">
                  {thresholdBps[0].toFixed(1)} bps
                </span>
              </div>
            }
            bodyClassName="p-0"
          >
            {ratesQuery.isLoading ? (
              <div className="p-3 sm:p-4 text-xs text-muted-foreground">
                Loading...
              </div>
            ) : ratesQuery.isError ? (
              <div className="p-3 sm:p-4 text-xs text-danger">
                Error: {formatApiError(ratesQuery.error)}
              </div>
            ) : rows.length === 0 ? (
              <EmptyPanelState
                title="No symbols"
                description="Waiting for rates..."
                className="m-4 min-h-40"
              />
            ) : (
              <div className="max-h-[28rem] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-b border-border text-muted-foreground bg-surface-1">
                      <th className="px-3 py-2 text-left font-medium">
                        Symbol
                      </th>
                      <th className="px-2 py-2 text-right font-medium">Rate</th>
                      <th className="px-2 py-2 text-right font-medium hidden sm:table-cell">
                        HL
                      </th>
                      <th className="px-2 py-2 text-right font-medium hidden sm:table-cell">
                        L
                      </th>
                      <th className="px-2 py-2 text-right font-medium hidden md:table-cell">
                        Next
                      </th>
                      <th className="px-2 py-2 text-right font-medium">
                        Spread
                      </th>
                      <th className="px-2 py-2 text-center font-medium text-[10px]">
                        Status
                      </th>
                      <th className="px-2 py-2 text-center font-medium">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const absBps = row.bestSpreadBps;
                      const isAbove = absBps >= thresholdBps[0];
                      const bot = findSymbolBot(createdBots, row.symbol);
                      const aggregateRatePositive =
                        row.aggregateFundingRate === null ? true : row.aggregateFundingRate >= 0;
                      return (
                        <tr
                          key={row.symbol}
                          onClick={() => setSelected(row.symbol)}
                          className={`cursor-pointer border-b border-border/50 transition-colors ${
                            selected === row.symbol
                              ? "bg-primary/8 shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
                              : `${index % 2 === 0 ? "bg-surface-0/40" : "bg-surface-1/20"} hover:bg-surface-2/70`
                          }`}
                        >
                          <td className="px-3 py-2 font-mono font-medium text-foreground text-xs">
                            {row.symbol}
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-mono text-xs ${aggregateRatePositive ? "text-up" : "text-down"}`}
                          >
                            {formatFundingRatePercent(row.aggregateFundingRate)}
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-mono text-xs hidden sm:table-cell ${row.hyperliquidFundingRate !== null && row.hyperliquidFundingRate >= 0 ? "text-up" : "text-down"}`}
                          >
                            {row.hyperliquidFundingRate === null
                              ? "-"
                              : `${(row.hyperliquidFundingRate * 100).toFixed(3)}%`}
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-mono text-xs hidden sm:table-cell ${row.lighterFundingRate !== null && row.lighterFundingRate >= 0 ? "text-up" : "text-down"}`}
                          >
                            {row.lighterFundingRate === null
                              ? "-"
                              : `${(row.lighterFundingRate * 100).toFixed(3)}%`}
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-mono text-xs hidden md:table-cell ${
                              row.aggregateNextFundingRate === null || row.aggregateNextFundingRate >= 0
                                ? "text-up"
                                : "text-down"
                            }`}
                          >
                            {formatFundingRatePercent(row.aggregateNextFundingRate)}
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-mono text-xs ${isAbove ? "font-semibold text-up" : ""}`}
                          >
                            {absBps.toFixed(1)} bps
                          </td>
                          <td className="px-2 py-2 text-center">
                            <Badge
                              variant="outline"
                              className="text-2xs h-5 px-1"
                            >
                              {bot?.status ?? "-"}
                            </Badge>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {bot && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1 text-[10px]"
                                disabled={isBusy}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleToggleBot(bot);
                                }}
                              >
                                {bot.status === "running" ? "Stop" : "Go"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </PanelCard>
        }
        right={
          <PanelCard
            title="Bot builder"
            description="Configure selected symbol"
            className="xl:sticky xl:top-24"
          >
            {selectedData ? (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">
                      Symbol
                    </Label>
                    <Input
                      value={selectedData.symbol}
                      readOnly
                      className="mt-1 h-8 text-xs bg-surface-2"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">
                      Filter threshold
                    </Label>
                    <Input
                      type="number"
                      value={thresholdBps[0]}
                      onChange={(e) =>
                        setThresholdBps([Number(e.target.value) || 0])
                      }
                      className="mt-1 h-8 text-xs bg-surface-2"
                    />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">
                      Signal source
                    </Label>
                    <Select
                      value={referenceExchange}
                      onValueChange={setReferenceExchange}
                    >
                      <SelectTrigger className="mt-1 h-8 text-xs bg-surface-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hyperliquid">Hyperliquid</SelectItem>
                        <SelectItem value="lighter">Lighter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">
                      Hedge venue
                    </Label>
                    <Select
                      value={hedgeExchange}
                      onValueChange={setHedgeExchange}
                    >
                      <SelectTrigger className="mt-1 h-8 text-xs bg-surface-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto best</SelectItem>
                        <SelectItem value="lighter">Lighter</SelectItem>
                        <SelectItem value="hyperliquid">Hyperliquid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">
                    Max size USD
                  </Label>
                  <Input
                    type="number"
                    value={maxPositionSize}
                    onChange={(e) => setMaxPositionSize(e.target.value)}
                    className="mt-1 h-8 text-xs bg-surface-2"
                  />
                </div>

                <div
                  className={cn(
                    "rounded-lg border p-2 text-xs",
                    missingVenues.length > 0
                      ? "border-warning/30 bg-warning/10"
                      : "border-success/25 bg-success/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-3.5 w-3.5 text-primary" />
                        <p className="font-medium text-foreground">
                          Execution credentials
                        </p>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {exchangeStatusQuery.isLoading
                          ? "Checking connected venues..."
                          : missingVenues.length > 0
                            ? `Connect ${missingVenues.map((venue) => VENUE_LABELS[venue]).join(", ")} before live arb execution.`
                            : "Required venues are connected for this bot path."}
                      </p>
                    </div>
                    {missingVenues.length > 0 && (
                      <Button asChild size="sm" variant="outline" className="h-7 shrink-0 text-[10px]">
                        <Link to="/settings">Connect keys</Link>
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {requiredVenues.map((venue) => {
                      const connected = Boolean(exchangeStatusQuery.data?.[venue]?.connected);
                      return (
                        <Badge
                          key={venue}
                          variant="outline"
                          className={cn(
                            "h-5 text-2xs",
                            connected
                              ? "border-success/30 text-success"
                              : "border-warning/30 text-warning",
                          )}
                        >
                          {VENUE_LABELS[venue]} {connected ? "connected" : "needed"}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2 pt-2">
                  <div className="rounded-lg border border-border/50 bg-surface-2/40 p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Spread
                    </p>
                    <p className="mt-1 font-mono text-sm">
                      {selectedData.bestSpreadBps.toFixed(2)} bps
                    </p>
                  </div>
                  <div className="rounded-lg border border-success/20 bg-success/5 p-2">
                    <p className="text-[10px] uppercase text-success">Status</p>
                    <p className="mt-1 text-xs">Pacifica + hedge</p>
                  </div>
                </div>

                <Button
                  className="h-8 w-full text-xs mt-2"
                  disabled={isBusy}
                  onClick={() => void handleDeployBot()}
                >
                  <Rocket className="mr-1 h-3 w-3" />
                  Create standby bot
                </Button>

                {selectedBot && (
                  <div className="rounded-lg border border-border/50 bg-surface-2/40 p-2 text-xs">
                    <p className="font-medium">{selectedBot.name}</p>
                    <p className="text-muted-foreground">
                      Status: {selectedBot.status}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <EmptyPanelState
                title="No symbol selected"
                description="Choose from the rates table above"
              />
            )}
          </PanelCard>
        }
      />

      {coinDetails ? (
        <PanelCard
          title="Exchange details"
          description="Live venue snapshots for the selected symbol."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <ExchangeDetailsCard title="Pacifica" details={coinDetails.pacifica} />
            <ExchangeDetailsCard
              title="Hyperliquid"
              details={coinDetails.hyperliquid}
            />
            <ExchangeDetailsCard title="Lighter" details={coinDetails.lighter} />
            <ExchangeDetailsCard title="Binance" details={coinDetails.binance} />
            <ExchangeDetailsCard title="Bybit" details={coinDetails.bybit} />
          </div>
        </PanelCard>
      ) : null}

      {createdBots.length > 0 && (
        <PanelCard title="Bots" description="Active inventory">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground bg-surface-1">
                  <th className="px-3 py-2 text-left font-medium">Bot</th>
                  <th className="px-2 py-2 text-left font-medium">Symbol</th>
                  <th className="px-2 py-2 text-right font-medium">Rate</th>
                  <th className="px-2 py-2 text-right font-medium">Next</th>
                  <th className="px-2 py-2 text-right font-medium">
                    Threshold
                  </th>
                  <th className="px-2 py-2 text-center font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium hidden md:table-cell">
                    Venue
                  </th>
                  <th className="px-2 py-2 text-center font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {createdBots.map((bot, index) => {
                  const rateSnapshot = botRateBySymbol[bot.symbol] ?? {
                    fundingRate: null,
                    nextFundingRate: null,
                  };
                  const fundingRateClass =
                    rateSnapshot.fundingRate === null
                      ? "text-muted-foreground"
                      : rateSnapshot.fundingRate >= 0
                        ? "text-up"
                        : "text-down";
                  const nextFundingRateClass =
                    rateSnapshot.nextFundingRate === null
                      ? "text-muted-foreground"
                      : rateSnapshot.nextFundingRate >= 0
                        ? "text-up"
                        : "text-down";

                  return (
                    <tr
                      key={bot.id}
                      className={`border-b border-border/50 transition-colors ${
                        index % 2 === 0 ? "bg-surface-0/40" : "bg-surface-1/20"
                      } hover:bg-surface-2`}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{bot.name}</td>
                      <td className="px-2 py-2 font-mono text-xs">
                        {bot.symbol}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono text-xs ${fundingRateClass}`}>
                        {formatFundingRatePercent(rateSnapshot.fundingRate)}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono text-xs ${nextFundingRateClass}`}>
                        {formatFundingRatePercent(rateSnapshot.nextFundingRate)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs">
                        {toBps(bot.threshold).toFixed(1)}bps
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Badge variant="outline" className="text-2xs h-5 px-1">
                          {bot.status}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-right hidden md:table-cell text-muted-foreground text-xs">
                        {bot.hedge_exchange}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1 text-[10px]"
                          disabled={isBusy}
                          onClick={() => void handleToggleBot(bot)}
                        >
                          {bot.status === "running" ? "Stop" : "Go"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PanelCard>
      )}
    </div>
  );
}

function ExchangeDetailsCard({
  title,
  details,
}: {
  title: string;
  details: ExchangeCoinDetails;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-border/50 bg-surface-2/40 p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{title}</span>
        <Badge variant="outline" className="text-2xs h-5 px-1">
          {details.status}
        </Badge>
      </div>
      <div className="text-[10px] space-y-0.5 text-muted-foreground">
        <div>Funding: {formatFundingPct(details.funding_rate)}</div>
        <div>Mark: {formatPrice(details.mark_price)}</div>
        <div>Index: {formatPrice(details.index_price)}</div>
      </div>
    </div>
  );
}
