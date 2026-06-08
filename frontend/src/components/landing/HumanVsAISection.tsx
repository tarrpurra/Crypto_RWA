import { useState } from "react";

export function HumanVsAISection() {
  const [human, setHuman] = useState(50);
  const aiUsdy = 70;

  return (
    <section id="human-vs-ai" className="border-b border-lp-border bg-lp-surface px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-screen-2xl text-center">
        <div className="mb-4 font-sans text-[11px] font-medium uppercase tracking-widest text-lp-fg-muted">
          Human vs AI
        </div>
        <h2 className="font-display text-[clamp(28px,3.5vw,50px)] font-bold tracking-tight text-lp-fg">
          Think you can beat it?
        </h2>
        <p className="mx-auto mt-3.5 max-w-[560px] font-sans text-[15px] leading-relaxed text-lp-fg-secondary">
          Set your allocation. The AI runs alongside you &mdash; every decision logged on-chain,
          same starting conditions, permanent result.
        </p>
        <div className="mx-auto mt-12 grid max-w-[680px] gap-4 md:grid-cols-2">
          {/* Human */}
          <div className="rounded-xl border border-lp-border bg-lp-surface p-6 text-left">
            <div className="mb-3.5 font-sans text-[11px] font-medium uppercase tracking-wider text-lp-fg-secondary">
              Your allocation
            </div>
            <div className="mb-1.5 flex justify-between">
              <span className="font-sans text-[13px] text-lp-fg">USDY</span>
              <span className="font-mono text-[13px] font-medium text-lp-gold">{human}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={human}
              onChange={(e) => setHuman(+e.target.value)}
              className="mb-3 w-full"
            />
            <div className="flex justify-between">
              <span className="font-sans text-[13px] text-lp-fg">mETH</span>
              <span className="font-mono text-[13px] font-medium text-lp-fg-secondary">
                {100 - human}%
              </span>
            </div>
          </div>
          {/* AI */}
          <div className="rounded-xl border border-lp-gold/30 bg-lp-surface p-6 text-left shadow-[0_0_28px_hsl(var(--lp-gold)/0.07)]">
            <div className="mb-3.5 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lp-gold opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-lp-gold" />
              </span>
              <div className="font-sans text-[11px] font-medium uppercase tracking-wider text-lp-gold">
                AI allocation
              </div>
            </div>
            <div className="mb-1.5 flex justify-between">
              <span className="font-sans text-[13px] text-lp-fg">USDY</span>
              <span className="font-mono text-[13px] font-medium text-lp-gold">{aiUsdy}%</span>
            </div>
            <div className="mb-3 h-1 overflow-hidden rounded-full bg-lp-border">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${aiUsdy}%`,
                  background: "linear-gradient(90deg, hsl(var(--lp-fg-muted)), hsl(var(--lp-gold)))",
                }}
              />
            </div>
            <div className="mb-2.5 flex justify-between">
              <span className="font-sans text-[13px] text-lp-fg">mETH</span>
              <span className="font-mono text-[13px] font-medium text-lp-fg-secondary">
                {100 - aiUsdy}%
              </span>
            </div>
            <div className="font-sans text-[11px] text-lp-fg-secondary">
              Last update: 12m ago · Confidence 0.87
            </div>
          </div>
        </div>
        <button
          className="mx-auto mt-8 inline-flex h-[52px] items-center gap-2 rounded-lg bg-lp-gold px-[38px] font-display text-[15px] font-semibold text-lp-bg shadow-[0_0_28px_hsl(var(--lp-gold)/0.22)] transition-all duration-200 hover:scale-[1.02] hover:bg-[#E0A83C] active:scale-[0.98]"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#E0A83C";
            e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "";
            e.currentTarget.style.transform = "none";
          }}
        >
          Launch the Arena &rarr;
        </button>
      </div>
    </section>
  );
}
