"use client";

import { motion, useReducedMotion } from "framer-motion";

const features = [
  {
    title: "Risk-gated allocation engine",
    body: "Deterministic profile-driven target weights with five action bands (normal, clipped, rebalance-only, human approval, pause). Hard veto thresholds prevent execution when data is stale or risk limits breached.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 6a6 6 0 1 0 6 6" /><circle cx="12" cy="12" r="2" />
      </svg>
    ),
  },
  {
    title: "Multi-sourced market data",
    body: "Real-time price feeds from Pyth Network Hermes client and Ondo USDY on-chain oracle. Swap quotes sampled from AGNI Finance V3 and Merchant Moe pools for accurate routing.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="8" height="8" /><rect x="14" y="2" width="8" height="8" /><rect x="2" y="14" width="8" height="8" /><rect x="14" y="14" width="8" height="8" />
      </svg>
    ),
  },
  {
    title: "Automated risk management",
    body: "Five-bucket weighted scoring engine covers portfolio valuation, quote availability, concentration drift, ops readiness, and data quality. Multi-sig governance with time-locked execution via Solidity contracts.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

const profiles = [
  { name: "Defensive", stable: "40-50%", usdy: "35-45%", meth: "10-20%" },
  { name: "Balanced", stable: "20-30%", usdy: "35-50%", meth: "20-35%" },
  { name: "Yield-Seeking", stable: "10-20%", usdy: "40-55%", meth: "25-40%" },
];

export function FeatureGrid() {
  const reduce = useReducedMotion();

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
  };

  const itemAnim = {
    hidden: reduce ? {} : { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
  };

  return (
    <section id="features" className="mx-auto max-w-screen-2xl px-6 pt-20 lg:px-8">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.1 }}
        className="grid grid-cols-1 gap-6 md:grid-cols-3"
      >
        {features.map((f) => (
          <motion.div
            key={f.title}
            variants={itemAnim}
            className="group border border-lp-border-muted bg-lp-surface p-8 border-l-4 border-lp-gold shadow-hard transition-all duration-300 hover:-translate-y-1 hover:border-l-[#ffdca0] hover:shadow-[0_22px_48px_-28px_hsl(var(--lp-gold)/0.72)]"
          >
            <div className="mb-8 flex h-12 w-12 items-center justify-center border border-lp-border-muted bg-lp-surface-2 text-lp-gold">
              {f.icon}
            </div>
            <h3 className="font-display text-2xl font-semibold tracking-tight text-lp-fg">
              {f.title}
            </h3>
            <p className="mt-3 leading-relaxed text-lp-fg-secondary">
              {f.body}
            </p>
          </motion.div>
        ))}

        <motion.div
          variants={itemAnim}
          className="col-span-1 row-start-2 border border-lp-border-muted bg-lp-surface p-8 shadow-hard md:col-span-2"
        >
          <div className="flex h-full flex-col justify-between">
            <div>
              <p className="font-display text-2xl font-semibold tracking-tight text-lp-fg">
                Allocation profiles
              </p>
              <p className="mt-1 text-sm text-lp-fg-muted">
                Three deterministic profiles with predefined sleeve targets.
              </p>
            </div>
            <div className="mt-6 space-y-3">
              {profiles.map((p) => (
                  <div key={p.name} className="flex items-center justify-between border border-lp-border-muted bg-lp-surface-2 px-4 py-3">
                  <span className="font-medium text-lp-fg">{p.name}</span>
                  <span className="font-mono text-xs text-lp-fg-muted">
                    Stable {p.stable} / USDY {p.usdy} / mETH {p.meth}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          variants={itemAnim}
          className="col-span-1 row-start-3 border border-lp-border-muted bg-gradient-to-br from-lp-surface to-lp-bg p-8 shadow-hard border-l-4 border-lp-gold md:col-span-1 md:row-start-2"
        >
          <div className="flex h-full flex-col justify-between">
            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center border border-lp-border-muted bg-lp-surface-2 text-lp-gold">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h3 className="font-display text-2xl font-semibold tracking-tight text-lp-fg">
                On-chain governance
              </h3>
              <p className="mt-3 leading-relaxed text-lp-fg-secondary">
                Every strategy change goes through multi-sig approval with time-locked execution via ExecutorVault and TradeApprovalManager contracts.
              </p>
            </div>
            <div className="mt-8 flex items-center gap-4 text-sm">
              <div className="flex -space-x-2">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-7 w-7 border border-lp-border-muted bg-lp-surface-2"
                  />
                ))}
              </div>
              <span className="text-lp-fg-muted">3 of 5 signers required</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
