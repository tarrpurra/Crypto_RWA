import ElectricBorder from "@/components/ui/ElectricBorder";

const steps = [
  {
    n: "01",
    tag: "Live Data",
    title: "Multi-source market feeds",
    body: "Real-time USDY, mETH, ETH, and MNT prices streamed from Pyth Network Hermes and the Ondo on-chain oracle. Aave APY tracking and swap quotes from AGNI Finance V3 and Merchant Moe pools — all in one live dashboard.",
    chips: ["Pyth", "Ondo", "Aave"],
  },
  {
    n: "02",
    tag: "AI Pipeline",
    title: "Five-stage risk-gated engine",
    body: "A deterministic pipeline runs every cycle: Oracle reads the market, LLM reasons on utilisation trends, Kelly Criterion sizes the position, Risk Gate scores five buckets, and Execution broadcasts the decision. Hard vetoes prevent bad swaps.",
    chips: ["LLM", "Kelly", "Risk gate"],
  },
  {
    n: "03",
    tag: "Simulation",
    title: "Transparent decision preview",
    body: "The Glass Box shows every stage of the AI pipeline — Oracle, LLM Reason, Kelly, Risk Gate, Execution — as a live simulation. A Human vs AI slider lets you compare your own allocation against the agent's recommendation side by side.",
    chips: ["Pipeline", "Simulation", "Side-by-side"],
  },
];

function StepCard({ s }: { s: (typeof steps)[number] }) {
  return (
    <ElectricBorder
      color="#d4962a"
      speed={0.7}
      chaos={0.09}
      borderRadius={16}
      style={{ borderRadius: 16 }}
      className="h-full w-full max-w-[26rem] justify-self-center"
    >
      <div className="relative flex h-full min-h-[36rem] flex-col overflow-hidden rounded-[16px] border border-[#d4962a]/16 bg-[radial-gradient(circle_at_top_left,rgba(212,150,42,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(212,150,42,0.08),transparent_36%),linear-gradient(180deg,rgba(18,12,7,0.99),rgba(9,7,5,0.96))] p-7 sm:p-8">
        <div className="pointer-events-none absolute inset-0 rounded-[16px] ring-1 ring-inset ring-[#d4962a]/10" />
        <div className="relative flex h-full flex-col">
          <div className="flex items-start justify-between gap-4">
            <span className="inline-flex items-center rounded-full border border-[#d4962a]/18 bg-[#24180f]/90 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.28em] text-[#f3b24a]">
              Step {s.n}
            </span>
            <span className="pt-1 font-mono text-[10px] uppercase tracking-[0.32em] text-[#b78947]/70">
              {s.tag}
            </span>
          </div>

          <div className="mt-7 max-w-[12ch] text-[30px] font-semibold leading-[1.03] tracking-[-0.03em] text-[#f6efe3] text-balance">
            {s.title}
          </div>

          <div className="mt-5 max-w-[28ch] text-justify text-[16px] leading-7 hyphens-auto text-[#c9b696]">
            {s.body}
          </div>

          <div className="mt-auto pt-10">
            <div className="mb-4 flex flex-wrap gap-2">
              {s.chips.map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center rounded-full border border-[#d4962a]/12 bg-[#1f1710]/90 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#e5d2ae]"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ElectricBorder>
  );
}

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-b border-lp-border px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-screen-2xl">
        <div className="mb-14 text-center">
          <div className="mb-4 font-sans text-[11px] font-medium uppercase tracking-widest text-lp-fg-muted">
            How it works
          </div>
          <h2 className="font-display text-[clamp(24px,3vw,42px)] font-bold tracking-tight text-lp-fg">
            Three steps. Zero ambiguity.
          </h2>
        </div>
        <div className="grid items-stretch gap-8 lg:grid-cols-3 lg:justify-items-center">
          <StepCard s={steps[0]} />
          <StepCard s={steps[1]} />
          <StepCard s={steps[2]} />
        </div>
      </div>
    </section>
  );
}
