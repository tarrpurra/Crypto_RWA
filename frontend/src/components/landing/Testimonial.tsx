"use client";

import { motion, useReducedMotion } from "framer-motion";

export function Testimonial() {
  const reduce = useReducedMotion();

  return (
    <section className="mx-auto max-w-screen-2xl px-6 pt-16 pb-8 lg:px-8">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-[3.5rem] border border-lp-border bg-lp-glass p-1 backdrop-blur-xl"
      >
        <div className="rounded-[3rem] bg-lp-surface px-8 py-12 lg:px-16">
          <div className="mx-auto max-w-2xl">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[0.75rem] border border-lp-border bg-lp-surface-2">
                <span className="font-display text-lg font-semibold text-lp-fg">MC</span>
              </div>
              <div>
                <p className="font-semibold text-lp-fg">Maya Chen</p>
                <p className="text-sm text-lp-fg-secondary">
                  CIO, <span className="text-lp-fg">Aether Capital</span>
                </p>
              </div>
            </div>

            <blockquote className="text-xl leading-tight tracking-tight text-lp-fg lg:text-2xl">
              &ldquo;AIYield is the first protocol that bridges institutional-grade risk management with DeFi-native yields. The on-chain transparency combined with automated rebalancing is exactly what the RWA market needed.&rdquo;
            </blockquote>

            <p className="mt-6 text-sm text-lp-fg-muted">
              - Quoted in <span className="text-lp-fg">The Block</span>, Research Issue 2025
            </p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
