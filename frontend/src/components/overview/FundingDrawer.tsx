import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type FundingDrawerProps = {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

const DRAWER_HEIGHT_CLASS = "h-[16.25rem]";

export function FundingDrawer({
  open,
  onToggle,
  children,
}: FundingDrawerProps) {
  return (
    <div className="shrink-0 border-t border-border bg-card">
      <button
        type="button"
        data-testid="overview-funding-drawer-toggle"
        className="flex h-7 w-full items-center justify-center border-b border-border bg-surface-2 px-3 text-center transition-colors hover:bg-muted"
        onClick={onToggle}
      >
        <span className="terminal-label text-primary">
          {open ? "Close funding details" : "Funding details"}
        </span>
      </button>

      <div
        data-testid="overview-funding-drawer"
        data-state={open ? "open" : "closed"}
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={cn(DRAWER_HEIGHT_CLASS, "overflow-auto")}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
