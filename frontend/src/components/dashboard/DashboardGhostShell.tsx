import { Skeleton } from "@/components/ui/skeleton";

function GhostStat({ label, width }: { label: string; width: string }) {
  return (
    <div className="rounded-none border border-border bg-background/35 p-3">
      <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <Skeleton className={`mt-2 h-5 rounded-none ${width}`} />
    </div>
  );
}

export function DashboardGhostShell() {
  return (
    <section
      aria-label="Dashboard loading state"
      className="terminal-panel col-span-full overflow-hidden p-5"
    >
      <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="terminal-label text-primary">Wallet connected</p>
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-8 w-56 rounded-none bg-primary/10" />
            <p className="max-w-[52ch] text-sm text-muted-foreground">
              Syncing wallet balances, vault state, and market inputs. The page will fill in as the backend finishes warming up.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary motion-safe:animate-pulse-gold motion-reduce:animate-none" />
          <span className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
            Backend warming up
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.95fr)]">
        <div className="rounded-none border border-border bg-background/35 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <p className="terminal-label text-primary">Capital</p>
              <Skeleton className="h-7 w-48 rounded-none" />
            </div>
            <Skeleton className="h-8 w-24 rounded-none" />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <div className="relative overflow-hidden border border-border bg-card/70 p-4">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent motion-safe:animate-pulse" />
              <div className="flex h-[230px] items-end gap-3">
                <div className="flex h-full w-full flex-col justify-end gap-3">
                  <Skeleton className="h-2 w-[72%] rounded-none" />
                  <Skeleton className="h-2 w-[54%] rounded-none" />
                  <Skeleton className="h-2 w-[81%] rounded-none" />
                  <Skeleton className="h-2 w-[63%] rounded-none" />
                  <Skeleton className="h-2 w-[90%] rounded-none" />
                  <Skeleton className="h-2 w-[78%] rounded-none" />
                </div>
                <div className="flex h-full w-10 flex-col justify-between py-2">
                  <Skeleton className="h-3 w-full rounded-none" />
                  <Skeleton className="h-3 w-8 rounded-none" />
                  <Skeleton className="h-3 w-6 rounded-none" />
                  <Skeleton className="h-3 w-8 rounded-none" />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <GhostStat label="Latest value" width="w-28" />
              <GhostStat label="Range" width="w-20" />
              <GhostStat label="Bucket" width="w-16" />
              <GhostStat label="Current token" width="w-24" />
            </div>
          </div>
        </div>

        <div className="rounded-none border border-border bg-background/35 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <p className="terminal-label text-primary">Target weights</p>
              <Skeleton className="h-5 w-40 rounded-none" />
            </div>
            <Skeleton className="h-5 w-24 rounded-none" />
          </div>

          <div className="mt-4 space-y-3">
            {["USDY", "mETH", "WMNT"].map((asset) => (
              <div key={asset} className="flex items-center justify-between border border-border bg-surface-2 px-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary/50" />
                  <span className="font-medium text-foreground">{asset}</span>
                </div>
                <Skeleton className="h-5 w-16 rounded-none" />
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-none border border-border bg-card/70 p-3">
            <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">Profile target</p>
            <div className="mt-3 grid gap-2">
              <Skeleton className="h-4 w-5/6 rounded-none" />
              <Skeleton className="h-4 w-2/3 rounded-none" />
              <Skeleton className="h-4 w-1/2 rounded-none" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-none border border-border bg-background/35 p-4">
          <p className="terminal-label text-primary">Portfolio sync</p>
          <div className="mt-3 space-y-3">
            <Skeleton className="h-6 w-40 rounded-none" />
            <Skeleton className="h-4 w-5/6 rounded-none" />
            <Skeleton className="h-4 w-2/3 rounded-none" />
          </div>
        </div>
        <div className="rounded-none border border-border bg-background/35 p-4">
          <p className="terminal-label text-primary">AI command center</p>
          <div className="mt-3 space-y-3">
            <Skeleton className="h-6 w-48 rounded-none" />
            <Skeleton className="h-4 w-full rounded-none" />
            <Skeleton className="h-4 w-4/5 rounded-none" />
          </div>
        </div>
        <div className="rounded-none border border-border bg-background/35 p-4">
          <p className="terminal-label text-primary">Routes and risk</p>
          <div className="mt-3 space-y-3">
            <Skeleton className="h-6 w-36 rounded-none" />
            <Skeleton className="h-4 w-5/6 rounded-none" />
            <Skeleton className="h-4 w-3/4 rounded-none" />
          </div>
        </div>
      </div>
    </section>
  );
}
