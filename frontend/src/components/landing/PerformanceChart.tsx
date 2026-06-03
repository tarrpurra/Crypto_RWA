"use client";

import { motion, useReducedMotion } from "framer-motion";

const riskBuckets = [
  { label: "Portfolio Valuation", weight: "30%", desc: "USD value of all positions relative to expected range" },
  { label: "Quote Availability", weight: "20%", desc: "Freshness and depth of DEX swap quotes from AGNI and Merchant Moe" },
  { label: "Concentration Drift", weight: "20%", desc: "Deviation of current weights from profile targets" },
  { label: "Ops Readiness", weight: "10%", desc: "Backend health, runtime mode, and contract connectivity" },
  { label: "Data Quality", weight: "20%", desc: "Staleness detection across oracle feeds and on-chain data" },
];

const actionBands = [
  { range: "0-25", label: "Normal", color: "bg-emerald-500" },
  { range: "25-45", label: "Clipped", color: "bg-yellow-500" },
  { range: "45-65", label: "Rebalance only", color: "bg-orange-500" },
  { range: "65-80", label: "Human approval", color: "bg-red-500" },
  { range: ">80", label: "Pause / Emergency", color: "bg-red-800" },
];

export function PerformanceChart() {
  const reduce = useReducedMotion();

  return (
    <section id="performance" className="mx-auto max-w-screen-2xl px-6 pt-24 lg:px-8">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="border border-lp-border-muted bg-lp-surface p-1 shadow-hard"
      >
        <div className="bg-lp-bg p-8 lg:p-12">
          <div className="grid gap-10 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <p className="font-display text-3xl font-semibold tracking-tight text-lp-fg lg:text-4xl">
                Risk scoring engine
              </p>
              <p className="mt-3 text-sm leading-relaxed text-lp-fg-secondary">
                A weighted five-bucket model computes a composite risk score every cycle. Each bucket is independently scored and normalized before being aggregated into the final action band.
              </p>

              <div className="mt-8 space-y-3">
                {riskBuckets.map((bucket) => (
                  <div key={bucket.label} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center border border-lp-border-muted bg-lp-surface-2">
                      <span className="font-mono text-[10px] font-medium text-lp-fg-muted">{bucket.weight}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-lp-fg">{bucket.label}</p>
                      <p className="text-xs text-lp-fg-muted">{bucket.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className="border border-lp-border-muted bg-lp-surface p-6 border-l-4 border-lp-gold">
                <p className="text-[10px] font-medium uppercase tracking-[1.5px] text-lp-gold mb-4">
                  Action Bands
                </p>
                <div className="space-y-3">
                  {actionBands.map((band) => (
                    <div key={band.range} className="flex items-center gap-4">
                      <div className="flex h-8 w-16 items-center justify-center border border-lp-border-muted bg-lp-surface-2">
                        <span className="font-mono text-xs text-lp-fg-muted">{band.range}</span>
                      </div>
                      <div className={`h-3 w-3 ${band.color}`} />
                      <span className="text-sm text-lp-fg">{band.label}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-6 text-xs text-lp-fg-muted border-t border-lp-border-muted pt-4">
                  Scores above 65 require human multi-sig approval. Above 80 triggers an automatic pause with emergency unwind preparation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
