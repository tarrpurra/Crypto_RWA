import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTpslSessions } from "@/hooks/useTpsl";
import { Maximize2 } from "lucide-react";

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PositionsPanel() {
  const sessionsQuery = useTpslSessions();
  const activeSessions = (sessionsQuery.data?.sessions ?? []).filter(
    (session) => session.status === "active",
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
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
          <h3 className="text-sm font-semibold text-foreground">Open Positions</h3>
        </div>
        <Badge variant="outline" className="text-2xs">
          {activeSessions.length} protected
        </Badge>
      </div>
      {sessionsQuery.isLoading ? (
        <div className="p-4 text-xs text-muted-foreground">Loading positions...</div>
      ) : activeSessions.length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground">
          No active positions.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Symbol</th>
                <th className="text-center px-4 py-2 font-medium">Side</th>
                <th className="text-right px-4 py-2 font-medium">Entry</th>
                <th className="text-right px-4 py-2 font-medium">Size</th>
                <th className="text-right px-4 py-2 font-medium">TP</th>
                <th className="text-right px-4 py-2 font-medium">SL</th>
                <th className="text-center px-4 py-2 font-medium">Trailing</th>
              </tr>
            </thead>
            <tbody>
              {activeSessions.map((session) => (
                <tr
                  key={session.id}
                  className="border-b border-border/50 hover:bg-surface-2 transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono font-medium text-foreground">
                    {session.symbol}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge
                      variant="outline"
                      className={`text-2xs ${
                        session.side === "long"
                          ? "border-success/30 text-success"
                          : "border-danger/30 text-danger"
                      }`}
                    >
                      {session.side.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {formatNumber(session.entry_price)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {formatNumber(session.position_size)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-up">
                    {formatNumber(session.take_profit_price)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-down">
                    {formatNumber(session.stop_loss_price)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge
                      variant="outline"
                      className={`text-2xs ${
                        session.trailing_stop_activated
                          ? "border-primary/30 text-primary"
                          : "border-muted-foreground/30 text-muted-foreground"
                      }`}
                    >
                      {session.trailing_stop_activated ? "On" : "Off"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    <Dialog open={isFullscreen} onOpenChange={() => setIsFullscreen(false)}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Maximize2 className="h-4 w-4" />
            Protected Positions
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground bg-surface-1 sticky top-0">
                <th className="text-left px-4 py-2 font-medium">Symbol</th>
                <th className="text-center px-4 py-2 font-medium">Side</th>
                <th className="text-right px-4 py-2 font-medium">Entry</th>
                <th className="text-right px-4 py-2 font-medium">Size</th>
                <th className="text-right px-4 py-2 font-medium">TP</th>
                <th className="text-right px-4 py-2 font-medium">SL</th>
                <th className="text-center px-4 py-2 font-medium">Trailing</th>
              </tr>
            </thead>
            <tbody>
              {activeSessions.map((session) => (
                <tr key={session.id} className="border-b border-border/50">
                  <td className="px-4 py-2.5 font-mono font-medium">{session.symbol}</td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge variant="outline" className={session.side === "long" ? "border-success/30 text-success" : "border-danger/30 text-danger"}>
                      {session.side.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatNumber(session.entry_price)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatNumber(session.position_size)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-up">{formatNumber(session.take_profit_price)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-down">{formatNumber(session.stop_loss_price)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge variant="outline" className={session.trailing_stop_activated ? "border-primary/30 text-primary" : "border-muted-foreground/30"}>
                      {session.trailing_stop_activated ? "On" : "Off"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
