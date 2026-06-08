"use client";

import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function FinalCta() {
  const reduce = useReducedMotion();

  return (
    <section className="mx-auto max-w-screen-2xl px-6 pb-8 pt-16 lg:px-8">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="border border-lp-border bg-lp-surface px-8 py-14 text-center shadow-hard lg:px-16"
      >
        <div className="mx-auto max-w-lg">
          <h2 className="font-display text-4xl font-semibold tracking-tighter text-lp-fg lg:text-5xl">
            Ready to redefine
            <br />
            what yield means?
          </h2>
          <p className="mt-4 text-lp-fg-secondary">
            The AI is live on Mantle Sepolia. Every decision verifiable on-chain.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/dashboard"
              className="group inline-flex items-center gap-3 border-2 border-lp-gold bg-lp-gold px-10 py-4 text-lg font-semibold text-lp-bg transition-all duration-300 hover:opacity-90 active:scale-[0.98]"
            >
              <span>Launch App &rarr;</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="https://explorer.sepolia.mantle.xyz"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 border border-lp-border bg-transparent px-8 py-4 font-sans text-sm font-medium text-lp-fg-secondary transition-all duration-200 hover:border-lp-gold/40 hover:text-lp-fg"
            >
              View on Mantlescan &uarr;
            </a>
          </div>

          <p className="mt-4 text-xs text-lp-fg-muted">
            Built for the Mantle Turing Test Hackathon 2026 · AI × RWA Track · Phase II: AI Awakening
          </p>
        </div>
      </motion.div>
    </section>
  );
}
