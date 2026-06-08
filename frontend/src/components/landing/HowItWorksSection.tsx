import { useState } from "react";

const steps = [
  {
    n: "01",
    tag: "Oracle Layer",
    title: "The agent reads the market",
    body: "Every 2 hours, live USDY and mETH data is pulled from Pyth Network and the Ondo oracle directly on Mantle. No estimates. No stale prices. On-chain feeds only.",
  },
  {
    n: "02",
    tag: "Decision Engine",
    title: "Five layers decide every move",
    body: "A pipeline evaluates the yield spread, sizes the position using Kelly Criterion, and runs four independent risk checks — credit, liquidity, concentration, oracle health — before any swap is approved.",
  },
  {
    n: "03",
    tag: "Glass Box",
    title: "Every call is permanent",
    body: "Every decision — including ones the risk gate blocks — is written to Mantle via ERC-8004. The agent cannot delete a bad call. You can read the entire history on-chain right now.",
  },
];

function StepCard({ s }: { s: (typeof steps)[number] }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`rounded-xl border bg-lp-surface p-6 border-t-2 border-t-lp-gold transition-all duration-200 ${
        hov
          ? "border-lp-gold/30 shadow-[0_0_28px_hsl(var(--lp-gold)/0.07)]"
          : "border-lp-border"
      }`}
    >
      <div className="mb-3.5 font-mono text-[10px] tracking-wider text-lp-gold">
        STEP {s.n} · <span className="text-lp-fg-muted">{s.tag}</span>
      </div>
      <div className="mb-3 font-display text-[17px] font-semibold leading-tight tracking-tight text-lp-fg">
        {s.title}
      </div>
      <div className="font-sans text-[13px] leading-relaxed text-lp-fg-secondary">{s.body}</div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center justify-center pt-12">
      <span className="text-[18px] text-lp-gold opacity-35">&rarr;</span>
    </div>
  );
}

export function HowItWorksSection() {
  return (
    <section className="border-b border-lp-border px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-screen-2xl">
        <div className="mb-14 text-center">
          <div className="mb-4 font-sans text-[11px] font-medium uppercase tracking-widest text-lp-fg-muted">
            How it works
          </div>
          <h2 className="font-display text-[clamp(24px,3vw,42px)] font-bold tracking-tight text-lp-fg">
            Three steps. Zero ambiguity.
          </h2>
        </div>
        <div className="grid items-start gap-0 md:grid-cols-[1fr_36px_1fr_36px_1fr]">
          <StepCard s={steps[0]} />
          <Arrow />
          <StepCard s={steps[1]} />
          <Arrow />
          <StepCard s={steps[2]} />
        </div>
      </div>
    </section>
  );
}
