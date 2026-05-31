import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  ArrowRight,
  Maximize2,
  Table2,
  Bot,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useArbRates } from "@/hooks/useArb";
import { api } from "@/lib/api";
import { HeatmapGrid } from "./HeatmapGrid";
import { ActiveBots } from "./ActiveBots";

type OpportunityRow = {
  symbol: string;
  pacificaRate: number | null;
  primaryReferenceRate: number | null;
  secondaryReferenceRate: number | null;
  spreadBps: number | null;
  refExchange: "Hyperliquid" | "Lighter" | "-";
  markPrice: number | null;
  primaryReferenceStatus: string;
  secondaryReferenceStatus: string;
};

type ViewMode = "opportunities" | "bots";

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPct(value: number | null): string {
  if (value === null) return "-";
  return `${(value * 100).toFixed(4)}%`;
}

export function OpportunitiesTable() {
  const navigate = useNavigate();
  const ratesQuery = useArbRates();
  const [selectedOpportunity, setSelectedOpportunity] =
    useState<OpportunityRow | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("opportunities");

  const symbols = useMemo(() => {
    const rates = Object.values(ratesQuery.data?.rates ?? {});
    return rates
      .map((item) => ({
        symbol: item.symbol,
        absFunding: Math.abs(Number(item.funding_rate || 0)),
      }))
      .sort((a, b) => b.absFunding - a.absFunding)
      .slice(0, 20)
      .map((item) => item.symbol);
  }, [ratesQuery.data?.rates]);

  const trackedCount = symbols.length;

  const detailsQueries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["arb", "details", symbol],
      queryFn: () => api.arb.getCoinDetails(symbol),
      refetchInterval: 10_000,
      staleTime: 8_000,
    })),
  });

  const rows: OpportunityRow[] = useMemo(() => {
    return detailsQueries
      .map((query) => query.data)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((detail) => {
        const pacificaRate = toNumber(detail.pacifica.funding_rate);
        const hyperliquidRate = toNumber(detail.hyperliquid?.funding_rate);
        const lighterRate = toNumber(detail.lighter?.funding_rate);
        const spreadVsHyperliquid = detail.spread_bps_vs_hyperliquid ?? null;
        const spreadVsLighter = detail.spread_bps_vs_lighter ?? null;

        let spreadBps: number | null = null;
        let refExchange: OpportunityRow["refExchange"] = "-";

        if (
          spreadVsHyperliquid !== null &&
          (spreadVsLighter === null ||
            Math.abs(spreadVsHyperliquid) >= Math.abs(spreadVsLighter))
        ) {
          spreadBps = spreadVsHyperliquid;
          refExchange = "Hyperliquid";
        } else if (spreadVsLighter !== null) {
          spreadBps = spreadVsLighter;
          refExchange = "Lighter";
        }

        return {
          symbol: detail.symbol,
          pacificaRate,
          primaryReferenceRate: hyperliquidRate,
          secondaryReferenceRate: lighterRate,
          spreadBps,
          refExchange,
          markPrice: toNumber(detail.pacifica.mark_price),
          primaryReferenceStatus: detail.hyperliquid?.status ?? "unavailable",
          secondaryReferenceStatus: detail.lighter?.status ?? "unavailable",
        };
      })
      .sort((a, b) => Math.abs(b.spreadBps ?? 0) - Math.abs(a.spreadBps ?? 0))
      .slice(0, 6);
  }, [detailsQueries]);

  const loadingDetails = detailsQueries.some((query) => query.isLoading);

  const handleAddBot = (symbol: string) => {
    navigate(`/funding-arb?symbol=${encodeURIComponent(symbol)}`);
  };

  return (
    <>
      <div
        data-testid="overview-opportunities"
        className="bg-card flex min-h-[42rem] flex-col overflow-visible border border-border"
      >
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setIsFullscreen(true)}
              title="Expand"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <h3 className="text-xs sm:text-sm font-semibold text-foreground">
              {viewMode === "opportunities"
                ? "Top Opportunities"
                : "Active Bots"}
            </h3>
            {viewMode === "opportunities" && trackedCount > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {trackedCount} tracked
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <div className="flex items-center bg-surface-2 rounded-lg p-0.5 gap-0.5 flex-nowrap shrink-0">
              <Button
                variant={viewMode === "opportunities" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setViewMode("opportunities")}
                title="Top Opportunities"
              >
                <Table2 className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Opportunities</span>
              </Button>
              <Button
                variant={viewMode === "bots" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setViewMode("bots")}
                title="Active Bots"
              >
                <Bot className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Bots</span>
              </Button>
            </div>
          </div>
        </div>

        {viewMode === "opportunities" ? (
          <div className="flex flex-col gap-3 p-3 sm:p-4">
            <div className="rounded-lg border border-border/70 bg-surface-0/20">
              {ratesQuery.isLoading ? (
                <div className="flex min-h-36 items-center p-3 sm:p-4 text-xs text-muted-foreground">
                  Loading...
                </div>
              ) : rows.length === 0 && loadingDetails ? (
                <div className="flex min-h-36 items-center p-3 sm:p-4 text-xs text-muted-foreground">
                  Loading details...
                </div>
              ) : rows.length === 0 ? (
                <div className="flex min-h-36 items-center p-3 sm:p-4 text-xs text-muted-foreground">
                  No data
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground bg-surface-1">
                        <th className="text-left px-3 sm:px-4 py-1.5 sm:py-2 font-medium text-[10px] sm:text-xs whitespace-nowrap">
                          Symbol
                        </th>
                        <th className="text-right px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-[9px] sm:text-xs whitespace-nowrap">
                          P FR
                        </th>
                        <th className="text-right px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-[9px] sm:text-xs whitespace-nowrap">
                          HL FR
                        </th>
                        <th className="text-right px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-[9px] sm:text-xs whitespace-nowrap">
                          L FR
                        </th>
                        <th className="text-right px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-[9px] sm:text-xs whitespace-nowrap">
                          Spread
                        </th>
                        <th className="text-center px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-[9px] sm:text-xs whitespace-nowrap">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr
                          key={row.symbol}
                          className={`border-b border-border/50 transition-colors ${index % 2 === 0 ? "bg-surface-0/40" : "bg-surface-1/20"} hover:bg-surface-2`}
                        >
                          <td className="px-3 sm:px-4 py-1.5 sm:py-2 font-mono font-medium text-foreground text-xs sm:text-sm">
                            {row.symbol}
                          </td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right font-mono text-xs">
                            {formatPct(row.pacificaRate)}
                          </td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right font-mono text-xs">
                            {formatPct(row.primaryReferenceRate)}
                          </td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right font-mono text-xs">
                            {formatPct(row.secondaryReferenceRate)}
                          </td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right font-mono text-xs">
                            {row.spreadBps === null ? (
                              "-"
                            ) : (
                              <span
                                className={`inline-flex items-center gap-0.5 whitespace-nowrap ${row.spreadBps > 0 ? "text-up" : "text-down"}`}
                              >
                                {row.spreadBps > 0 ? (
                                  <ArrowUpRight className="w-2.5 h-2.5" />
                                ) : (
                                  <ArrowDownRight className="w-2.5 h-2.5" />
                                )}
                                <span className="text-[9px] sm:text-xs">
                                  {Math.abs(row.spreadBps).toFixed(1)}bps
                                </span>
                              </span>
                            )}
                          </td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                                onClick={() => handleAddBot(row.symbol)}
                                title="Add bot"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => setSelectedOpportunity(row)}
                                title="View details"
                              >
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div
              data-testid="overview-opportunities-heatmap"
              className="rounded-lg border border-border/70 bg-surface-0/20"
            >
              <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-border/60">
                <h4 className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Spread Heatmap
                </h4>
                <span className="text-[10px] text-muted-foreground">
                  Pacifica vs hedge venues
                </span>
              </div>
              <HeatmapGrid embedded />
            </div>
          </div>
        ) : (
          <div className="min-h-[36rem] overflow-visible p-3 sm:p-4">
            <ActiveBots />
          </div>
        )}
      </div>

      <Dialog
        open={!!selectedOpportunity}
        onOpenChange={() => setSelectedOpportunity(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono">{selectedOpportunity?.symbol}</span>
              <Badge variant="outline" className="text-xs">
                {selectedOpportunity?.spreadBps !== null &&
                selectedOpportunity?.spreadBps !== undefined
                  ? `${Math.abs(selectedOpportunity.spreadBps).toFixed(1)} bps`
                  : "N/A"}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          {selectedOpportunity && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-2 rounded-lg p-3">
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">
                    Pacifica FR
                  </p>
                  <p className="font-mono text-lg">
                    {formatPct(selectedOpportunity.pacificaRate)}
                  </p>
                </div>
                <div className="bg-surface-2 rounded-lg p-3">
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">
                    Reference
                  </p>
                  <p className="font-mono text-lg">
                    {selectedOpportunity.refExchange}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (selectedOpportunity) {
                      handleAddBot(selectedOpportunity.symbol);
                      setSelectedOpportunity(null);
                    }
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Bot
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/orderbook")}
                >
                  View Orderbook
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isFullscreen} onOpenChange={() => setIsFullscreen(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Maximize2 className="h-4 w-4" />
              {viewMode === "opportunities"
                ? "Top Opportunities"
                : "Active Bots"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-center mb-4 overflow-x-auto">
            <div className="flex items-center bg-surface-2 rounded-lg p-0.5 gap-0.5 flex-nowrap shrink-0">
              <Button
                variant={viewMode === "opportunities" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-3"
                onClick={() => setViewMode("opportunities")}
              >
                <Table2 className="h-3.5 w-3.5 mr-1.5" />
                Opportunities
              </Button>
              <Button
                variant={viewMode === "bots" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-3"
                onClick={() => setViewMode("bots")}
              >
                <Bot className="h-3.5 w-3.5 mr-1.5" />
                Bots
              </Button>
            </div>
          </div>
          <div className="overflow-auto max-h-[60vh]">
            {viewMode === "opportunities" ? (
              <div className="space-y-4 p-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground bg-surface-1 sticky top-0">
                      <th className="text-left px-4 py-2 font-medium text-[10px]">
                        Symbol
                      </th>
                      <th className="text-right px-3 py-2 font-medium text-[10px]">
                        P FR
                      </th>
                      <th className="text-right px-3 py-2 font-medium text-[10px]">
                        HL FR
                      </th>
                      <th className="text-right px-3 py-2 font-medium text-[10px]">
                        L FR
                      </th>
                      <th className="text-right px-3 py-2 font-medium text-[10px]">
                        Spread
                      </th>
                      <th className="text-center px-3 py-2 font-medium text-[10px]">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr
                        key={row.symbol}
                        className={`border-b border-border/50 ${index % 2 === 0 ? "bg-surface-0/40" : "bg-surface-1/20"}`}
                      >
                        <td className="px-4 py-2.5 font-mono font-medium text-foreground">
                          {row.symbol}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {formatPct(row.pacificaRate)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {formatPct(row.primaryReferenceRate)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {formatPct(row.secondaryReferenceRate)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {row.spreadBps === null ? (
                            "-"
                          ) : (
                            <span
                              className={
                                row.spreadBps > 0 ? "text-up" : "text-down"
                              }
                            >
                              {row.spreadBps > 0 ? (
                                <ArrowUpRight className="w-3 h-3 inline" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3 inline" />
                              )}
                              {Math.abs(row.spreadBps).toFixed(1)}bps
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleAddBot(row.symbol)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="rounded-lg border border-border/70 bg-surface-0/20">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border/60">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Spread Heatmap
                    </h4>
                    <span className="text-[10px] text-muted-foreground">
                      Pacifica vs hedge venues
                    </span>
                  </div>
                  <HeatmapGrid embedded />
                </div>
              </div>
            ) : (
              <div className="p-4">
                <ActiveBots />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
