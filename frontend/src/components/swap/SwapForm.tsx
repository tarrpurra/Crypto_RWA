import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSwapQuote } from "@/hooks/useSwap"
import { cn } from "@/lib/utils"
import { ArrowDownUp, Settings2 } from "lucide-react"

import { TokenSelectDialog } from "./TokenSelectDialog"

export function SwapForm() {
  const [tokenIn, setTokenIn] = useState("MockTokenA")
  const [tokenOut, setTokenOut] = useState("MockTokenB")
  const [amountIn, setAmountIn] = useState("")
  const [slippage, setSlippage] = useState("0.5")
  const [deadline, setDeadline] = useState("20")
  const [dialogTarget, setDialogTarget] = useState<"in" | "out" | null>(null)

  const quoteQuery = useSwapQuote(tokenIn, tokenOut)

  const handleReverse = () => {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
  }

  const quote = quoteQuery.data
  const estimatedOut = amountIn && quote?.quoted_price
    ? (parseFloat(amountIn) * parseFloat(quote.quoted_price)).toFixed(6)
    : null

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

          {/* From */}
          <div className="mt-3 rounded-md border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">From</p>
              <button
                type="button"
                onClick={() => { setAmountIn("") }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Max
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="number"
                placeholder="0.0"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                className="h-10 flex-1 border-0 bg-transparent px-0 text-lg font-mono focus-visible:ring-0"
              />
              <button
                type="button"
                onClick={() => setDialogTarget("in")}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary"
              >
                {tokenIn}
              </button>
            </div>
          </div>

          {/* Reverse */}
          <div className="flex justify-center py-1">
            <button
              type="button"
              onClick={handleReverse}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <ArrowDownUp className="h-4 w-4" />
            </button>
          </div>

          {/* To */}
          <div className="rounded-md border border-border bg-surface-2 p-3">
            <p className="text-xs text-muted-foreground">To</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 px-0 text-lg font-mono text-foreground">
                {estimatedOut ?? "0.0"}
              </div>
              <button
                type="button"
                onClick={() => setDialogTarget("out")}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary"
              >
                {tokenOut}
              </button>
            </div>
          </div>

          {/* Quote details */}
          {quote && (
            <div className="mt-3 space-y-1.5 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Rate</span>
                <span className="font-mono text-foreground">
                  1 {tokenIn} = {quote.quoted_price ?? "-"} {tokenOut}
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
                <span>Route</span>
                <span className="font-mono text-foreground">{quote.protocol ?? "-"}</span>
              </div>
              {quote.route_depth_usd && (
                <div className="flex justify-between">
                  <span>Liquidity</span>
                  <span className="font-mono text-foreground">${parseFloat(quote.route_depth_usd).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" disabled>
              Approve
            </Button>
            <Button className="flex-1" disabled={!amountIn || parseFloat(amountIn) <= 0}>
              Swap
            </Button>
          </div>
        </CardContent>
      </Card>

      <TokenSelectDialog
        open={dialogTarget !== null}
        onOpenChange={(open) => { if (!open) setDialogTarget(null) }}
        onSelect={(symbol) => {
          if (dialogTarget === "in") {
            setTokenIn(symbol)
          } else if (dialogTarget === "out") {
            setTokenOut(symbol)
          }
          setDialogTarget(null)
        }}
      />
    </>
  )
}
