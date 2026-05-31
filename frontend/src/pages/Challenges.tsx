import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";

import {
  EmptyPanelState,
  PageHeader,
  PageTabs,
  PanelCard,
  PanelSplit,
  StatusPillRow,
} from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  useChallengeLeaderboard,
  useChallengeSessions,
  useChallengeTiers,
  useCreateChallengeSession,
} from "@/hooks/useChallenges";
import { toast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";

type ChallengeTab = "challenge" | "leaderboard";

function formatApiError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function daysLeft(startedAt: string | null, durationDays: number): string {
  if (!startedAt) {
    return "-";
  }
  const start = new Date(startedAt).getTime();
  const end = start + durationDays * 24 * 60 * 60 * 1000;
  const diff = Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
  return diff > 0 ? `${diff}d` : "0d";
}

export default function Challenges() {
  const [tab, setTab] = useState<ChallengeTab>("challenge");
  const tiersQuery = useChallengeTiers();
  const sessionsQuery = useChallengeSessions();
  const leaderboardQuery = useChallengeLeaderboard(20);
  const createSession = useCreateChallengeSession();

  const sessions = sessionsQuery.data?.sessions ?? [];
  const activeSession = useMemo(
    () => sessions.find((session) => session.status === "active") ?? null,
    [sessions],
  );

  const handlePurchase = async (tierName: string) => {
    try {
      logger.info("challenge.session.create.request", { tier: tierName });
      await createSession.mutateAsync(tierName);
      toast({
        title: "Challenge created",
        description: `${tierName} session started.`,
      });
      logger.info("challenge.session.create.success", { tier: tierName });
    } catch (error) {
      logger.error("challenge.session.create.error", {
        tier: tierName,
        message: formatApiError(error),
      });
      toast({
        title: "Purchase failed",
        description: formatApiError(error),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <PanelSplit
        left={
          <PanelCard
            title="Current progress"
            description="If there is no active challenge session, this panel stays honest about that state."
          >
            {sessionsQuery.isLoading ? (
              <div className="text-xs text-muted-foreground">
                Loading sessions...
              </div>
            ) : activeSession ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <ChallengeStat label="Tier" value={activeSession.tier} />
                  <ChallengeStat
                    label="PnL"
                    value={`${activeSession.current_pnl_pct >= 0 ? "+" : ""}${activeSession.current_pnl_pct.toFixed(2)}%`}
                    tone={activeSession.current_pnl_pct >= 0 ? "up" : "down"}
                  />
                  <ChallengeStat
                    label="Drawdown"
                    value={`${activeSession.max_drawdown_pct.toFixed(2)}%`}
                  />
                  <ChallengeStat
                    label="Days left"
                    value={daysLeft(
                      activeSession.started_at,
                      activeSession.duration_days,
                    )}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-surface-2/60 p-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      Equity path
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Current equity
                        </span>
                        <span className="font-mono text-foreground">
                          ${activeSession.current_equity.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Peak equity
                        </span>
                        <span className="font-mono text-foreground">
                          ${activeSession.peak_equity.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-surface-2/60 p-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      Risk budget
                    </p>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Profit target
                        </span>
                        <span className="font-mono text-up">
                          {activeSession.profit_target_pct.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Max total DD
                        </span>
                        <span className="font-mono text-foreground">
                          {activeSession.max_total_drawdown_pct.toFixed(2)}%
                        </span>
                      </div>
                      <Progress
                        value={Math.min(
                          (activeSession.max_drawdown_pct /
                            activeSession.max_total_drawdown_pct) *
                            100,
                          100,
                        )}
                        className="h-2"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyPanelState
                title="No active challenge session"
                description="Purchase a tier to start a challenge. Until then this panel remains empty."
                className="min-h-60"
              />
            )}
          </PanelCard>
        }
        right={
          <PanelCard
            title="Available tiers"
            description="Tier cards stay tied to the live tiers endpoint and only expose the existing purchase mutation."
          >
            {tiersQuery.isLoading ? (
              <div className="text-xs text-muted-foreground">
                Loading tiers...
              </div>
            ) : tiersQuery.isError ? (
              <div className="text-xs text-danger">
                Failed to load tiers: {formatApiError(tiersQuery.error)}
              </div>
            ) : (
              <div className="grid gap-3">
                {tiersQuery.data?.tiers.map((tier) => (
                  <div
                    key={tier.name}
                    className="rounded-2xl border border-border/70 bg-surface-2/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xl font-semibold text-foreground">
                          ${tier.simulated_capital.toLocaleString()}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {tier.display_name}
                        </p>
                      </div>
                      <Badge variant="outline">${tier.price_usd}</Badge>
                    </div>
                    <div className="mt-4 grid gap-2 text-xs">
                      <TierRow
                        label="Profit target"
                        value={`${tier.profit_target_pct}%`}
                        valueClassName="text-up"
                      />
                      <TierRow
                        label="Max daily DD"
                        value={`${tier.max_daily_drawdown_pct}%`}
                      />
                      <TierRow
                        label="Max total DD"
                        value={`${tier.max_total_drawdown_pct}%`}
                      />
                      <TierRow
                        label="Min trading days"
                        value={tier.min_trading_days}
                      />
                    </div>
                    <Button
                      variant="outline"
                      className="mt-4 h-8 w-full text-xs"
                      disabled={createSession.isPending}
                      onClick={() => void handlePurchase(tier.name)}
                    >
                      Purchase
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>
        }
      />

      {tab === "challenge" ? (
        <PanelCard
          title="Session history"
          description="Completed or inactive sessions remain visible below the main progress panel."
        >
          {sessionsQuery.isLoading ? (
            <div className="text-xs text-muted-foreground">
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <EmptyPanelState
              title="No challenge sessions yet"
              description="Your purchased challenge sessions will appear here."
              className="min-h-44"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Tier</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">PnL</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Drawdown
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Days left
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id} className="border-b border-border/50">
                      <td className="px-3 py-3 font-mono text-foreground">
                        {session.tier}
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant="outline"
                          className={
                            session.status === "passed"
                              ? "border-success/30 text-success"
                              : session.status === "failed"
                                ? "border-danger/30 text-danger"
                                : "border-primary/30 text-primary"
                          }
                        >
                          {session.status}
                        </Badge>
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono ${
                          session.current_pnl_pct >= 0 ? "text-up" : "text-down"
                        }`}
                      >
                        {session.current_pnl_pct >= 0 ? "+" : ""}
                        {session.current_pnl_pct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-foreground">
                        {session.max_drawdown_pct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-foreground">
                        {daysLeft(session.started_at, session.duration_days)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelCard>
      ) : (
        <PanelCard
          title="Leaderboard"
          description="Secondary emphasis only: the leaderboard stays available without crowding the current challenge workflow."
          action={
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Trophy className="h-4 w-4 text-warning" />
              <span>{leaderboardQuery.data?.entries.length ?? 0} entries</span>
            </div>
          }
        >
          {leaderboardQuery.isLoading ? (
            <div className="text-xs text-muted-foreground">
              Loading leaderboard...
            </div>
          ) : leaderboardQuery.isError ? (
            <div className="text-xs text-danger">
              Failed to load leaderboard:{" "}
              {formatApiError(leaderboardQuery.error)}
            </div>
          ) : (leaderboardQuery.data?.entries.length ?? 0) === 0 ? (
            <EmptyPanelState
              title="No leaderboard entries yet"
              description="Leaderboard entries will appear here once challenge sessions have been created and ranked."
              className="min-h-44"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Rank</th>
                    <th className="px-3 py-2 text-left font-medium">Account</th>
                    <th className="px-3 py-2 text-left font-medium">Tier</th>
                    <th className="px-3 py-2 text-right font-medium">PnL %</th>
                    <th className="px-3 py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardQuery.data?.entries.map((entry) => (
                    <tr
                      key={`${entry.rank}-${entry.account}`}
                      className="border-b border-border/50"
                    >
                      <td className="px-3 py-3 font-medium text-foreground">
                        #{entry.rank}
                      </td>
                      <td className="px-3 py-3 font-mono text-foreground">
                        {entry.account}
                      </td>
                      <td className="px-3 py-3 font-mono text-muted-foreground">
                        {entry.tier}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono ${
                          entry.pnl_pct >= 0 ? "text-up" : "text-down"
                        }`}
                      >
                        {entry.pnl_pct >= 0 ? "+" : ""}
                        {entry.pnl_pct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-foreground">
                        {entry.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelCard>
      )}
    </div>
  );
}

function ChallengeStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-surface-2/60 p-3">
      <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <p
        className={`mt-2 font-mono text-sm font-semibold ${
          tone === "up"
            ? "text-up"
            : tone === "down"
              ? "text-down"
              : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TierRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono text-foreground ${valueClassName ?? ""}`}>
        {value}
      </span>
    </div>
  );
}
