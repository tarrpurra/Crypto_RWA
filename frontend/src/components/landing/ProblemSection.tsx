export function ProblemSection() {
  return (
    <section className="border-b border-lp-border px-6 py-24 lg:px-8">
      <div className="mx-auto grid max-w-screen-2xl items-center gap-16 lg:grid-cols-2">
        <div>
          <div className="mb-4 font-sans text-[11px] font-medium uppercase tracking-widest text-lp-fg-muted">
            The problem
          </div>
          <h2 className="font-display text-[clamp(24px,3vw,42px)] font-bold leading-tight tracking-tight text-lp-fg">
            One billion dollars on Mantle
            <br />
            earns the same yield today
            <br />
            <span className="text-lp-gold">as it did yesterday.</span>
          </h2>
          <p className="mt-5 font-sans text-[15px] leading-relaxed text-lp-fg-secondary">
            USDY and mETH offer different yields every hour. The spread between them changes continuously.
          </p>
          <p className="mt-3 font-sans text-[15px] leading-relaxed text-lp-fg-secondary">
            No one is routing capital automatically based on that spread.
          </p>
          <p className="mt-3 font-sans text-[15px] leading-relaxed text-lp-fg-secondary">
            Every cycle it sits static is yield left uncaptured. YieldMind closes that gap.
          </p>
        </div>
        {/* Yield spread visual */}
        <div className="rounded-xl border border-lp-border bg-lp-surface p-8">
          <div className="mb-6 font-sans text-[11px] font-medium uppercase tracking-wider text-lp-fg-muted">
            Yield spread &mdash; illustrative (not live data)
          </div>
          {/* USDY bar */}
          <div className="mb-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-sans text-[14px] font-semibold text-lp-fg">USDY Supply APY</span>
              <span className="font-mono text-[13px] text-lp-gold">5.8% &ndash; 7.2%</span>
            </div>
            <div className="h-3.5 overflow-hidden rounded-full bg-lp-surface-2">
              <div
                className="h-full rounded-full"
                style={{
                  background: "linear-gradient(90deg, hsl(var(--lp-fg-muted)), hsl(var(--lp-gold)))",
                  animation: "oscUsdy 7s ease-in-out infinite",
                }}
              />
            </div>
          </div>
          {/* mETH bar */}
          <div className="mb-6">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-sans text-[14px] font-semibold text-lp-fg">mETH Staking APY</span>
              <span className="font-mono text-[13px] text-lp-fg-secondary">3.8% &ndash; 5.6%</span>
            </div>
            <div className="h-3.5 overflow-hidden rounded-full bg-lp-surface-2">
              <div
                className="h-full rounded-full"
                style={{
                  background: "linear-gradient(90deg, hsl(var(--lp-surface-2)), hsl(var(--lp-fg-muted)))",
                  animation: "oscMeth 7s ease-in-out 1.2s infinite",
                }}
              />
            </div>
          </div>
          <div className="rounded-lg border border-lp-gold/15 bg-lp-surface-2 p-4">
            <p className="font-sans text-[12px] leading-relaxed text-lp-fg-secondary">
              The spread oscillates constantly. Without an agent reading these signals and acting,
              the optimal allocation is always one step behind reality.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
