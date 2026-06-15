import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import { marketApi } from "@/lib/api/market";
import type { NormalizedPriceSnapshot } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function useLivePrice(symbol: string | undefined) {
  return useQuery({
    queryKey: ["market", "prices", "latest"],
    queryFn: marketApi.latestPrices,
    refetchInterval: 5_000,
    enabled: Boolean(symbol),
  });
}

function priceForSymbol(
  prices: NormalizedPriceSnapshot[] | undefined,
  symbol: string | undefined,
): NormalizedPriceSnapshot | undefined {
  if (!prices || !symbol) return undefined;
  return prices.find(
    (p) => p.asset_symbol.toUpperCase() === symbol.toUpperCase(),
  );
}

export function SwapDetailCard({
  tokenInSymbol,
  tokenOutSymbol,
  amount,
}: {
  tokenInSymbol: string | undefined;
  tokenOutSymbol: string | undefined;
  amount: number | undefined;
}) {
  const { data: pricesResponse } = useLivePrice(tokenOutSymbol);
  const livePrice = priceForSymbol(
    pricesResponse?.prices,
    tokenOutSymbol,
  );
  const livePriceUsd = livePrice?.price_usd
    ? Number.parseFloat(livePrice.price_usd)
    : null;
  const estimatedOutput =
    livePriceUsd && amount ? (amount * livePriceUsd).toFixed(6) : null;

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Proposed Swap</h3>
        {livePrice && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            LIVE
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded border border-border bg-background px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {tokenInSymbol ?? "?"}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground">
              {tokenOutSymbol ?? "?"}
            </span>
          </div>
          {amount !== undefined && (
            <span className="font-mono text-sm text-muted-foreground">
              {amount.toFixed(4)} {tokenInSymbol}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded border border-border bg-background px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">Filled Price</p>
            <p
              className={cn(
                "mt-0.5 font-mono text-sm",
                livePriceUsd ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {livePriceUsd !== null
                ? `$${livePriceUsd.toFixed(4)}`
                : "Loading..."}
            </p>
          </div>

          <div className="rounded border border-border bg-background px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">
              Estimated Output
            </p>
            <p className="mt-0.5 font-mono text-sm text-foreground">
              {estimatedOutput ? `~${estimatedOutput}` : "—"}{" "}
              {estimatedOutput && (
                <span className="text-xs text-muted-foreground">
                  {tokenOutSymbol}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Max slippage</span>
          <span className="font-mono text-foreground">0.5%</span>
        </div>
      </div>
    </div>
  );
}
