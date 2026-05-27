import { useState } from "react";
import { Bot, Pause, Play, Maximize2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useArbBots, useArbRates, useStartArbBot, useStopArbBot } from "@/hooks/useArb";
import { formatFundingRatePercent, getAggregatedFundingSnapshot } from "@/lib/arbFunding";

function formatBps(decimalRate: number): string {
  return (decimalRate * 10_000).toFixed(2);
}

export function ActiveBots() {
  const botsQuery = useArbBots();
  const ratesQuery = useArbRates();
  const startBot = useStartArbBot();
  const stopBot = useStopArbBot();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const bots = botsQuery.data?.bots ?? [];
  return (
    <>
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setIsFullscreen(true)}
            title="Expand"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
          <Bot className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">Active Bots</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{bots.length} bots</span>
      </div>
      <div className="px-3 py-2">
        {botsQuery.isLoading ? (
          <div className="text-[10px] text-muted-foreground">Loading...</div>
        ) : bots.length === 0 ? (
          <div className="text-[10px] text-muted-foreground">No bots configured</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {bots.map((bot) => (
              <div
                key={bot.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-2/80 border border-border/50 text-[10px]"
              >
                <span className="font-mono text-foreground">{bot.name}</span>
                <span className="text-muted-foreground">
                  Rate {formatFundingRatePercent(getAggregatedFundingSnapshot(bot.symbol, ratesQuery.data).fundingRate)}
                </span>
                <span className="text-muted-foreground">
                  Next {formatFundingRatePercent(getAggregatedFundingSnapshot(bot.symbol, ratesQuery.data).nextFundingRate)}
                </span>
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1 py-0 h-4 ${
                    bot.status === "running"
                      ? "border-success/30 text-success"
                      : bot.status === "error"
                        ? "border-danger/30 text-danger"
                        : "border-muted-foreground/30 text-muted-foreground"
                  }`}
                >
                  {bot.status === "running" ? "ON" : bot.status === "error" ? "ERR" : "OFF"}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                  disabled={startBot.isPending || stopBot.isPending}
                  onClick={() => {
                    if (bot.status === "running") {
                      void stopBot.mutateAsync(bot.id);
                    } else {
                      void startBot.mutateAsync(bot.id);
                    }
                  }}
                >
                  {bot.status === "running" ? (
                    <Pause className="w-2.5 h-2.5" />
                  ) : (
                    <Play className="w-2.5 h-2.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    <Dialog open={isFullscreen} onOpenChange={() => setIsFullscreen(false)}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Maximize2 className="h-4 w-4" />
            Active Bots ({bots.length})
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-auto max-h-[70vh] p-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {bots.map((bot) => (
              <div
                key={bot.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-2/50 border border-border/50"
              >
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" />
                  <div>
                    <span className="font-mono text-xs">{bot.name}</span>
                    <div className="text-[10px] text-muted-foreground">
                      Rate {formatFundingRatePercent(getAggregatedFundingSnapshot(bot.symbol, ratesQuery.data).fundingRate)} | Next{" "}
                      {formatFundingRatePercent(getAggregatedFundingSnapshot(bot.symbol, ratesQuery.data).nextFundingRate)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{formatBps(bot.threshold)} bps</span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 h-5 ${
                      bot.status === "running"
                        ? "border-success/30 text-success"
                        : bot.status === "error"
                          ? "border-danger/30 text-danger"
                          : "border-muted-foreground/30"
                    }`}
                  >
                    {bot.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    disabled={startBot.isPending || stopBot.isPending}
                    onClick={() => {
                      if (bot.status === "running") {
                        void stopBot.mutateAsync(bot.id);
                      } else {
                        void startBot.mutateAsync(bot.id);
                      }
                    }}
                  >
                    {bot.status === "running" ? (
                      <Pause className="w-3 h-3" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
