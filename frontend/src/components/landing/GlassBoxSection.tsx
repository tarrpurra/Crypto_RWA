const PIPELINE = [
  { s: "Oracle", r: "USDY $1.0523 ✓  ·  mETH $2,204 ✓", ok: true },
  { s: "LLM Reason", r: "Utilisation trending up — hold optimal", ok: true },
  { s: "Kelly", r: "f* = 0.0  — no edge detected for swap", ok: true },
  { s: "Risk Gate", r: "Score 22/100 — GREEN — pass", ok: true },
  { s: "Execution", r: "No swap required — HOLD confirmed", ok: true },
];

export function GlassBoxSection() {
  return (
    <section id="glass-box" className="border-b border-lp-border px-6 py-24 lg:px-8">
      <div className="mx-auto grid max-w-screen-2xl items-center gap-16 lg:grid-cols-2">
        <div>
          <div className="mb-4 font-sans text-[11px] font-medium uppercase tracking-widest text-lp-fg-muted">
            The glass box
          </div>
          <h2 className="font-display text-[clamp(22px,2.8vw,40px)] font-bold leading-tight tracking-tight text-lp-fg">
            Every decision
            <br />
            <span className="text-lp-gold">on-chain. Forever.</span>
          </h2>
          <p className="mt-5 font-sans text-[15px] leading-relaxed text-lp-fg-secondary">
            Every decision the AI makes is permanently written to Mantle via ERC-8004.
          </p>
          <p className="mt-3 font-sans text-[15px] leading-relaxed text-lp-fg-secondary">
            You do not have to trust us. You can verify it. The agent cannot edit history.
            Neither can we.
          </p>
          <a
            href="https://explorer.sepolia.mantle.xyz"
            target="_blank"
            rel="noreferrer"
            className="mt-7 inline-flex items-center gap-1.5 border-b border-lp-gold/30 pb-0.5 font-sans text-[13px] font-medium text-lp-gold transition-opacity hover:opacity-80"
          >
            View full log on Mantlescan &rarr;
          </a>
        </div>
        {/* Decision log card */}
        <div className="overflow-hidden rounded-xl border border-lp-border bg-lp-bg shadow-[0_0_48px_hsl(var(--lp-gold)/0.06)]">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-lp-border bg-lp-surface px-4 py-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lp-gold opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-lp-gold" />
            </span>
            <span className="font-mono text-[11px] text-lp-fg-secondary">
              ERC-8004 · DECISION LOG
            </span>
            <span className="ml-auto rounded-full border border-lp-gold/20 bg-lp-gold/10 px-2 py-0.5 font-sans text-[10px] text-lp-gold">
              TESTNET
            </span>
          </div>
          <div className="p-[18px]">
            <div className="mb-1 font-mono text-[10px] text-lp-fg-muted">2026-06-05T14:32:07Z</div>
            <div className="mb-4 flex items-center gap-2.5">
              <span className="font-mono text-[16px] font-medium text-lp-fg">DECISION #001</span>
              <span className="rounded-full border border-success bg-success/10 px-2.5 py-0.5 font-sans text-[11px] font-semibold text-success">
                HOLD
              </span>
              <span className="ml-auto font-mono text-[11px] text-lp-fg-secondary">
                conf <span className="text-lp-gold">0.87</span>
              </span>
            </div>
            <div className="mb-3.5 border-t border-lp-border pt-3.5">
              {PIPELINE.map((p) => (
                <div key={p.s} className="mb-2 flex items-start gap-2.5">
                  <div
                    className={`mt-0.5 h-[7px] w-[7px] flex-shrink-0 rounded-full ${
                      p.ok
                        ?                         "bg-success shadow-[0_0_6px_hsl(var(--success)/0.5)]"
                        : "bg-danger"
                    }`}
                  />
                  <div>
                    <span className="mr-2 font-mono text-[11px] text-lp-gold">{p.s}</span>
                    <span className="font-mono text-[11px] text-lp-fg-secondary">{p.r}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-lp-border pt-3">
              <span className="font-mono text-[10px] text-lp-fg-muted">tx</span>
              <span className="font-mono text-[11px] italic text-lp-fg-muted">
                0x &mdash; deploy agent to populate
              </span>
              <span className="ml-auto rounded-full border border-lp-border bg-lp-surface-2 px-2 py-0.5 font-sans text-[10px] text-lp-fg-muted">
                Simulation mode
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
