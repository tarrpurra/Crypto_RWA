import { ArrowLeftRight, X } from "lucide-react";

import { useSwapPanel } from "@/hooks/useSwapPanel";
import { cn } from "@/lib/utils";
import { SwapForm } from "./SwapForm";

const PANEL_WIDTH = 380;

export function SwapPanel() {
  const { open, setOpen } = useSwapPanel();

  return (
    <>
      {/* Trigger tab — always visible on the left edge */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={open ? "Close swap panel" : "Open swap panel"}
        className={cn(
          "fixed left-0 top-1/2 z-40 flex h-24 w-6 -translate-y-1/2 items-center justify-center border-2 border-l-0 border-border bg-card text-muted-foreground transition-all hover:border-primary hover:text-primary",
          open && "opacity-0 pointer-events-none",
        )}
      >
        <ArrowLeftRight className="h-3.5 w-3.5 rotate-90" />
        <span className="sr-only">Toggle swap panel</span>
      </button>

      {/* Panel backdrop — click to close */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-lp-bg/40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full flex-col border-r border-border bg-background shadow-lg transition-all duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ width: PANEL_WIDTH }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Swap</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <SwapForm />
        </div>
      </div>
    </>
  );
}
