import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCreateProposal, useRebalancePlan, useSwapQuote } from "@/hooks/useSwap";
import { cn } from "@/lib/utils";
import { ApiClientError } from "@/lib/api/client";
import { ArrowDownUp, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { TokenSelectDialog } from "./TokenSelectDialog";

export function SwapForm() {
  const [tokenIn, setTokenIn] = useState("mETH");
  const [tokenOut, setTokenOut] = useState("USDY");
  const [slippage, setSlippage] = useState("0.5");
  const [deadline, setDeadline] = useState("20");
  const [dialogTarget, setDialogTarget] = useState<"in" | "out" | null>(null);

  const quoteQuery = useSwapQuote(tokenIn, tokenOut);
  const planQuery = useRebalancePlan();
  const createProposal = useCreateProposal();

  const plannedAction = useMemo(() => {
    if (!planQuery.data?.rebalance_actions) return null;
    const sell = planQuery.data.rebalance_actions.find(
      (a) => a.asset_symbol === tokenIn && a.action === "SELL",
    );
    const buy = planQuery.data.rebalance_actions.find(
      (a) => a.asset_symbol === tokenOut && a.action === "BUY",
    );
    return { sell, buy };
  }, [planQuery.data, tokenIn, tokenOut]);

  const planAmount = plannedAction?.sell?.amount ?? plannedAction?.buy?.amount ?? 0;

  const handleReverse = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
  };

  const handleSwap = () => {
    if (!plannedAction?.sell) return;
    createProposal.mutate(
      {
        asset_symbol: plannedAction.sell.asset_symbol,
        action: "SELL",
        amount: plannedAction.sell.amount,
      },
      {
        onSuccess: () => {
          toast.success("Proposal created. Approve and execute it from the queue.");
        },
        onError: (err) => {
          const detail = err instanceof ApiClientError ? (err.details as { detail?: string })?.detail : null;
          toast.error(detail ?? (err instanceof Error ? err.message : "Failed to create proposal"));
        },
      },
    );
  };

  const quote = quoteQuery.data;
  const quoteRatio = useMemo(() => {
    if (!quote?.amount_in || !quote.amount_out) return null;
    const sampledIn = parseFloat(quote.amount_in);
    const sampledOut = parseFloat(quote.amount_out);
    if (!Number.isFinite(sampledIn) || !Number.isFinite(sampledOut) || sampledIn <= 0 || sampledOut <= 0) return null;
    return sampledOut / sampledIn;
  }, [quote?.amount_in, quote?.amount_out]);

  const estimatedOut = planAmount && quoteRatio
    ? (planAmount * quoteRatio).toFixed(6)
    : null;

  const isReady = plannedAction?.sell !== undefined && !createProposal.isPending;

  return (
    <>
      <Card className="w-full max-w-md border-border bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <p className="terminal-label text-xs text-muted-foreground">Swap</p>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="sr-only">Settings</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 border-border bg-card p-3">
                <p className="terminal-label mb-2 text-xs text-muted-foreground">Slippage Tolerance</p>
                <div className="flex gap-2">
                  {["0.1", "0.5", "1.0"].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSlippage(val)}
                      className={cn(
                        "flex-1 rounded border px-2 py-1 text-xs transition-colors",
                        slippage === val
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
                      )}
                    >
                      {val}%
                    </button>
                  ))}
                </div>
                <p className="terminal-label mb-1 mt-3 text-xs text-muted-foreground">Deadline (min)</p>
                <Input
                  type="number"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="h-8 text-xs"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="mt-3 border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">From</p>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Max
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-10 flex-1 px-0 text-lg font-mono text-foreground">
                {planAmount > 0 ? planAmount.toFixed(4) : "0.0"}
              </div>
              <button
                type="button"
                onClick={() => setDialogTarget("in")}
                className="flex shrink-0 items-center gap-1.5 border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary"
              >
                {tokenIn}
              </button>
            </div>
            {plannedAction?.sell && (
              <p className="mt-1 text-xs text-muted-foreground">
                Planned: Sell {plannedAction.sell.amount.toFixed(4)} {tokenIn}
              </p>
            )}
          </div>

          <div className="flex justify-center py-1">
            <button
              type="button"
              onClick={handleReverse}
              className="flex h-8 w-8 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <ArrowDownUp className="h-4 w-4" />
            </button>
          </div>

          <div className="border border-border bg-surface-2 p-3">
            <p className="text-xs text-muted-foreground">To</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 px-0 text-lg font-mono text-foreground">
                {estimatedOut ?? "0.0"}
              </div>
              <button
                type="button"
                onClick={() => setDialogTarget("out")}
                className="flex shrink-0 items-center gap-1.5 border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary"
              >
                {tokenOut}
              </button>
            </div>
            {plannedAction?.buy && (
              <p className="mt-1 text-xs text-muted-foreground">
                Planned: Buy {plannedAction.buy.amount.toFixed(4)} {tokenOut}
              </p>
            )}
          </div>

          {quote && (
            <div className="mt-3 space-y-1.5 border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Rate</span>
                <span className="font-mono text-foreground">
                  {quoteRatio ? `1 ${tokenIn} ~= ${quoteRatio.toFixed(6)} ${tokenOut}` : "-"}
                </span>
              </div>
              {quote.estimated_slippage_bps && (
                <div className="flex justify-between">
                  <span>Slippage</span>
                  <span className="font-mono text-foreground">
                    {(parseFloat(quote.estimated_slippage_bps) / 100).toFixed(2)}%
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Sampled Route</span>
                <span className="font-mono text-foreground">{quote.protocol ?? "-"}</span>
              </div>
              {quote.route_depth_usd && (
                <div className="flex justify-between">
                  <span>Liquidity</span>
                  <span className="font-mono text-foreground">
                    ${parseFloat(quote.route_depth_usd).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}

          {planQuery.isLoading && (
            <p className="mt-2 text-xs text-muted-foreground">Loading rebalance plan...</p>
          )}
          {planQuery.isError && (
            <p className="mt-2 text-xs text-destructive">Failed to load rebalance plan</p>
          )}
          {planQuery.data && !plannedAction?.sell && (
            <p className="mt-2 text-xs text-muted-foreground">
              No rebalance plan available for {tokenIn} → {tokenOut}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" disabled>
              Approve
            </Button>
            <Button
              className="flex-1"
              disabled={!isReady}
              onClick={handleSwap}
            >
              {planQuery.isLoading ? "Loading..." : createProposal.isPending ? "Creating..." : "Swap"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <TokenSelectDialog
        open={dialogTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDialogTarget(null);
        }}
        onSelect={(symbol) => {
          if (dialogTarget === "in") {
            setTokenIn(symbol);
          } else if (dialogTarget === "out") {
            setTokenOut(symbol);
          }
          setDialogTarget(null);
        }}
      />
    </>
  );
}