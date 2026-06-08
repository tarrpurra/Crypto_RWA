import { useState } from "react";

const protocols = [
  "Mantle L2",
  "Ondo Finance (USDY)",
  "mETH Protocol",
  "Pyth Network",
  "Agni Finance",
  "Merchant Moe",
];

function ProtocolBadge({ name }: { name: string }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`cursor-default rounded-lg border px-5 py-2.5 font-sans text-[13px] font-medium transition-all duration-200 ${
        hov
          ? "border-lp-gold/30 bg-lp-gold/10 text-lp-fg"
          : "border-lp-border bg-lp-surface text-lp-fg-secondary"
      }`}
    >
      {name}
    </div>
  );
}

export function BuiltOnSection() {
  return (
    <section className="border-b border-lp-border bg-lp-surface px-6 py-14 lg:px-8">
      <div className="mx-auto max-w-screen-2xl text-center">
        <div className="mb-7 font-sans text-[11px] font-medium uppercase tracking-widest text-lp-fg-muted">
          Integrated with Mantle&apos;s live RWA infrastructure
        </div>
        <div className="flex flex-wrap justify-center gap-2.5">
          {protocols.map((p) => (
            <ProtocolBadge key={p} name={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
