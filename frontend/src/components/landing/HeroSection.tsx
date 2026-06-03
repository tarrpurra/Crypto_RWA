"use client";

import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const portfolioSleeves = [
  { label: "Stable Reserve", allocation: "20-30%", color: "bg-lp-fg" },
  { label: "Ondo USDY", allocation: "35-50%", color: "bg-lp-fg/70" },
  { label: "mETH Growth", allocation: "20-35%", color: "bg-lp-fg/40" },
];

const allocationProfiles = [
  { label: "Defensive", stable: "40-50%", usdy: "35-45%", meth: "10-20%" },
  { label: "Balanced", stable: "20-30%", usdy: "35-50%", meth: "20-35%" },
  { label: "Yield-Seeking", stable: "10-20%", usdy: "40-55%", meth: "25-40%" },
];

export function HeroSection() {
  const reduce = useReducedMotion();

  return (
    <section className="relative min-h-[100dvh] overflow-hidden pt-20">
      <div className="mx-auto max-w-screen-2xl px-6 pb-20 pt-16 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          <div className="max-w-2xl lg:col-span-7">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mb-8 inline-flex items-center gap-2 border border-lp-border-muted bg-lp-surface px-4 py-1.5">
                <span className="text-sm font-medium text-lp-fg-secondary">
                  Built on Mantle Network
                </span>
              </div>
            </motion.div>

            <motion.h1
              initial={reduce ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-4xl font-semibold leading-none tracking-tighter text-lp-fg md:text-5xl lg:text-6xl"
            >
              Risk-gated yield
              <br />
              for real-world assets.
            </motion.h1>

            <motion.p
              initial={reduce ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 max-w-md text-lg leading-relaxed text-lp-fg-secondary md:text-xl"
            >
              A transparent portfolio operations terminal for Mantle Network. Deterministic allocation profiles, real-time risk scoring with hard veto thresholds, and multi-sig on-chain governance via Ondo USDY, mETH, and stable reserve sleeves.
            </motion.p>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center"
            >
              <Link
                to="/dashboard"
                className="group flex w-full items-center justify-center gap-3 border-2 border-lp-gold bg-lp-gold px-9 py-4 font-semibold text-lp-bg transition-all duration-300 hover:opacity-90 active:scale-[0.98] sm:w-auto"
              >
                <span>Launch dashboard</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          </div>

          <motion.div
            initial={reduce ? false : { opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative lg:col-span-5"
          >
            <div className="mx-auto max-w-[420px] space-y-4">
              <div className="border border-lp-border-muted bg-lp-surface p-6 border-l-4 border-lp-gold">
                <p className="text-[10px] font-medium uppercase tracking-[1.5px] text-lp-gold mb-4">
                  3-Sleeve Portfolio Model
                </p>
                <div className="space-y-3">
                  {portfolioSleeves.map((sleeve) => (
                    <div key={sleeve.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`h-2.5 w-2.5 ${sleeve.color}`} />
                        <span className="text-sm text-lp-fg-secondary">{sleeve.label}</span>
                      </div>
                      <span className="font-mono text-sm text-lp-fg">{sleeve.allocation}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-lp-border-muted bg-lp-surface p-6 border-l-4 border-lp-gold">
                <p className="text-[10px] font-medium uppercase tracking-[1.5px] text-lp-gold mb-4">
                  Allocation Profiles
                </p>
                <div className="space-y-3">
                  {allocationProfiles.map((profile) => (
                    <div key={profile.label} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-lp-fg">{profile.label}</span>
                      <span className="text-xs text-lp-fg-muted">
                        S: {profile.stable} / U: {profile.usdy} / M: {profile.meth}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
