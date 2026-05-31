import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useArbRates } from "@/hooks/useArb";
import { api } from "@/lib/api";
import { Maximize2 } from "lucide-react";

type HeatmapRow = {
  symbol: string;
  pacificaFundingBps: number | null;
  spreadHyperliquidBps: number | null;
  spreadLighterBps: number | null;
  hyperliquidStatus: string;
  lighterStatus: string;
  hyperliquidError: string | null;
  lighterError: string | null;
};

const columns = [
  { key: "pacifica", label: "Pacifica FR" },
  { key: "hyperliquid", label: "Spread vs Hyperliquid" },
  { key: "lighter", label: "Spread vs Lighter Perp" },
] as const;

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBps(value: string | null | undefined): number | null {
  const decimal = toNumber(value);
  if (decimal === null) return null;
  return decimal * 10_000;
}

function magnitude(value: number | null): number {
  return value === null ? 0 : Math.abs(value);
}

function getColor(value: number | null): string {
  if (value === null) return "bg-surface-2";

  const abs = Math.abs(value);
  if (value > 0) {
    if (abs > 10) return "bg-success/70";
    if (abs > 5) return "bg-success/45";
    return "bg-success/20";
  }
  if (abs > 10) return "bg-danger/70";
  if (abs > 5) return "bg-danger/45";
  return "bg-danger/20";
}

export function HeatmapGrid({ embedded = false }: { embedded?: boolean }) {
  const ratesQuery = useArbRates();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const symbolCandidates = useMemo(() => {
    const rates = Object.values(ratesQuery.data?.rates ?? {});
    return rates
      .map((item) => ({
        symbol: item.symbol,
        absFunding: Math.abs(Number(item.funding_rate || 0)),
      }))
      .sort((a, b) => b.absFunding - a.absFunding)
      .slice(0, 16)
      .map((item) => item.symbol);
  }, [ratesQuery.data?.rates]);

  const detailsQueries = useQueries({
    queries: symbolCandidates.map((symbol) => ({
      queryKey: ["arb", "details", symbol],
      queryFn: () => api.arb.getCoinDetails(symbol),
      refetchInterval: 10_000,
      staleTime: 8_000,
    })),
  });

  const rows: HeatmapRow[] = useMemo(() => {
    return detailsQueries
      .map((query) => query.data)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((detail) => ({
        symbol: detail.symbol,
        pacificaFundingBps: toBps(detail.pacifica.funding_rate),
        spreadHyperliquidBps: detail.spread_bps_vs_hyperliquid ?? null,
        spreadLighterBps: detail.spread_bps_vs_lighter ?? null,
        hyperliquidStatus: detail.hyperliquid?.status ?? "unavailable",
        lighterStatus: detail.lighter?.status ?? "unavailable",
        hyperliquidError: detail.hyperliquid?.error ?? null,
        lighterError: detail.lighter?.error ?? null,
      }))
      .sort((a, b) => {
        const aBest = Math.max(
          magnitude(a.spreadHyperliquidBps),
          magnitude(a.spreadLighterBps),
        );
        const bBest = Math.max(
          magnitude(b.spreadHyperliquidBps),
          magnitude(b.spreadLighterBps),
        );
        return bBest - aBest;
      })
      .slice(0, 8);
  }, [detailsQueries]);

  const loadingDetails = detailsQueries.some((query) => query.isLoading);

  return (
    <>
      {embedded ? (
        <HeatmapContent rows={rows} ratesQuery={ratesQuery} loadingDetails={loadingDetails} symbolCandidates={symbolCandidates} />
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
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
              <h3 className="text-sm font-semibold text-foreground">Opportunity Heatmap</h3>
            </div>
            <span className="text-2xs text-muted-foreground">Live spread/funding (bps)</span>
          </div>
          <HeatmapContent rows={rows} ratesQuery={ratesQuery} loadingDetails={loadingDetails} symbolCandidates={symbolCandidates} />
        </div>
      )}

      <Dialog open={isFullscreen} onOpenChange={() => setIsFullscreen(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Maximize2 className="h-4 w-4" />
              Opportunity Heatmap
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh] p-4">
            {rows.length === 0 ? (
              <div className="text-xs text-muted-foreground">No opportunity details available.</div>
            ) : (
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `100px repeat(${columns.length}, 1fr)`,
                }}
              >
                <div />
                {columns.map((column) => (
                  <div
                    key={column.key}
                    className="text-center text-xs text-muted-foreground font-medium py-2"
                  >
                    {column.label}
                  </div>
                ))}
                {rows.map((row) => (
                  <div key={row.symbol} className="contents">
                    <div className="text-xs font-mono text-foreground flex items-center">
                      {row.symbol}
                    </div>
                    <HeatCell
                      value={row.pacificaFundingBps}
                      tooltip={`${row.symbol} Pacifica funding`}
                    />
                    <HeatCell
                      value={row.spreadHyperliquidBps}
                      tooltip={`${row.symbol} spread vs Hyperliquid`}
                      detail={
                        row.hyperliquidStatus === "ok"
                          ? "Hyperliquid: ok"
                          : `Hyperliquid: ${row.hyperliquidError ?? "unavailable"}`
                      }
                    />
                    <HeatCell
                      value={row.spreadLighterBps}
                      tooltip={`${row.symbol} spread vs Lighter perp`}
                      detail={
                        row.lighterStatus === "ok"
                          ? "Lighter: ok"
                          : `Lighter: ${row.lighterError ?? "unavailable"}`
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HeatmapContent({
  rows,
  ratesQuery,
  loadingDetails,
  symbolCandidates,
}: {
  rows: HeatmapRow[];
  ratesQuery: any;
  loadingDetails: boolean;
  symbolCandidates: string[];
}) {
  return (
    <div className="p-4">
      {ratesQuery.isLoading ? (
        <div className="text-xs text-muted-foreground">Loading rates...</div>
      ) : symbolCandidates.length === 0 ? (
        <div className="text-xs text-muted-foreground">No symbols available.</div>
      ) : rows.length === 0 && loadingDetails ? (
        <div className="text-xs text-muted-foreground">Loading exchange details...</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">No opportunity details available.</div>
      ) : (
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `80px repeat(${columns.length}, 1fr)`,
          }}
        >
          <div />
          {columns.map((column) => (
            <div
              key={column.key}
              className="text-center text-2xs text-muted-foreground font-medium py-1"
            >
              {column.label}
            </div>
          ))}
          {rows.map((row) => (
            <div key={row.symbol} className="contents">
              <div className="text-xs font-mono text-foreground flex items-center">
                {row.symbol}
              </div>
              <HeatCell
                value={row.pacificaFundingBps}
                tooltip={`${row.symbol} Pacifica funding`}
              />
              <HeatCell
                value={row.spreadHyperliquidBps}
                tooltip={`${row.symbol} spread vs Hyperliquid`}
                detail={
                  row.hyperliquidStatus === "ok"
                    ? "Hyperliquid: ok"
                    : `Hyperliquid: ${row.hyperliquidError ?? "unavailable"}`
                }
              />
              <HeatCell
                value={row.spreadLighterBps}
                tooltip={`${row.symbol} spread vs Lighter perp`}
                detail={
                  row.lighterStatus === "ok"
                    ? "Lighter: ok"
                    : `Lighter: ${row.lighterError ?? "unavailable"}`
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HeatCell({
  value,
  tooltip,
  detail,
}: {
  value: number | null;
  tooltip: string;
  detail?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`${getColor(value)} rounded flex items-center justify-center py-2 text-2xs font-mono text-foreground/85`}
        >
          {value === null ? "-" : value.toFixed(2)}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p>{tooltip}</p>
        <p className="font-mono">{value === null ? "-" : `${value.toFixed(2)} bps`}</p>
        {detail ? <p className="text-muted-foreground">{detail}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}
