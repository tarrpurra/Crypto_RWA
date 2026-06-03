"use client";

import { Sparkline } from "@/components/landing/charts/Sparkline";

const metrics = [
  {
    label: "ALLOCATION PROFILES",
    value: "3",
    detail: "Defensive / Balanced / Yield-Seeking",
    sparklineData: [1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  },
  {
    label: "RISK BUCKETS",
    value: "5",
    detail: "Valuation / Quotes / Drift / Ops / Data",
    sparklineData: [1, 2, 3, 4, 5, 5, 5, 5, 5, 5, 5, 5],
  },
  {
    label: "INTEGRATED DEXs",
    value: "2",
    detail: "AGNI Finance / Merchant Moe",
    sparklineData: [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  },
  {
    label: "ORACLE LAYERS",
    value: "2",
    detail: "Pyth Network / Ondo USDY",
    sparklineData: [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  },
];

export function MetricsBar() {
  return (
    <section className="mx-auto max-w-screen-2xl px-6 pb-8 lg:px-8">
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-lp-border-muted bg-lp-border md:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col justify-between bg-lp-surface px-6 py-7">
            <div>
              <p className="font-display text-3xl font-semibold tracking-tighter text-lp-fg md:text-4xl">
                {m.value}
              </p>
              <p className="mt-1 text-[10px] font-medium tracking-[1.5px] text-lp-fg-muted">
                {m.label}
              </p>
              <p className="mt-0.5 text-xs text-lp-fg-muted/60">
                {m.detail}
              </p>
            </div>
            <div className="mt-4 flex justify-end">
              <Sparkline data={m.sparklineData as number[]} height={32} width={100} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
