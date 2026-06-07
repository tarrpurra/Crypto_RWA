import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface TokenInfo {
  symbol: string
  name: string
  balance?: string
}

const AVAILABLE_TOKENS: TokenInfo[] = [
  { symbol: "USDY", name: "Ondo US Dollar Yield" },
  { symbol: "mETH", name: "Mantle Staked Ether (Sepolia demo asset)" },
  { symbol: "WMNT", name: "Wrapped Mantle" },

]

export function TokenSelectDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (tokenSymbol: string) => void
}) {
  const [search, setSearch] = useState("")

  const filtered = search.trim()
    ? AVAILABLE_TOKENS.filter(
        (t) =>
          t.symbol.toLowerCase().includes(search.toLowerCase()) ||
          t.name.toLowerCase().includes(search.toLowerCase()),
      )
    : AVAILABLE_TOKENS

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Select Token</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search by name or symbol..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {filtered.map((token) => (
            <button
              key={token.symbol}
              type="button"
              onClick={() => {
                onSelect(token.symbol)
                onOpenChange(false)
                setSearch("")
              }}
              className={cn(
                "flex items-center justify-between px-3 py-2.5 text-left transition-colors",
                "hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <div>
                <p className="text-sm font-medium text-foreground">{token.symbol}</p>
                <p className="text-xs text-muted-foreground">{token.name}</p>
              </div>
              {token.balance && (
                <span className="text-xs font-mono text-muted-foreground">{token.balance}</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No tokens found.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
