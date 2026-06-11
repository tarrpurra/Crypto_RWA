"use client";

import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { DashboardMockup } from "./DashboardMockup";
import DecryptedText from "@/components/ui/DecryptedText";
import { HeroLightBendingBackground } from "./HeroLightBendingBackground";


export function HeroSection() {
  const reduce = useReducedMotion();

  return (
    <section className="relative min-h-[100dvh] overflow-hidden pt-20">
      <HeroLightBendingBackground reduce={reduce} />
      <div className="relative z-10 mx-auto max-w-screen-2xl px-6 pb-20 pt-16 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          {/* Left */}
          <div>
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-lp-gold/20 bg-lp-gold/10 px-3.5 py-1">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lp-gold opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-lp-gold" />
                </span>
                <span className="font-sans text-[12px] font-medium text-lp-gold">
                  Mantle Turing Test 2026 · AI × RWA Track · Live on Sepolia
                </span>
              </div>
            </motion.div>

            <motion.h1
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-4xl font-bold leading-none tracking-tighter text-lp-fg md:text-5xl lg:text-[clamp(34px,4.2vw,58px)]"
            >
              The AI That Never
              <br />
              <DecryptedText
                text="Sleeps on Your Yield"
                animateOn="view"
                revealDirection="center"
                sequential
                speed={160}
                useOriginalCharsOnly
                className="text-lp-gold"
                parentClassName="text-lp-gold"
                encryptedClassName="text-lp-gold/30"
              />
            </motion.h1>

            <motion.p
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="mt-5 max-w-[480px] text-[16px] leading-relaxed text-lp-fg-secondary md:text-[16px]"
            >
              Autonomous USDY + mETH optimisation on Mantle L2.
              Every decision logged on-chain via ERC-8004.
              Human vs AI benchmarked. Permanently verifiable.
            </motion.p>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 flex flex-wrap gap-2.5"
            >
              <Link
                to="/dashboard"
                className="group flex h-[50px] items-center gap-2 rounded-lg bg-lp-gold px-[30px] font-display text-[14px] font-semibold text-lp-bg shadow-[0_0_28px_hsl(var(--lp-gold)/0.22)] transition-all duration-200 hover:bg-[#E0A83C] hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <span>Start Trading &rarr;</span>
              </Link>
              <a
                href="https://explorer.sepolia.mantle.xyz"
                target="_blank"
                rel="noreferrer"
                className="flex h-[50px] items-center gap-1.5 rounded-lg border border-lp-border bg-transparent px-[22px] font-sans text-[14px] font-medium text-lp-fg-secondary transition-all duration-200 hover:border-lp-gold/40 hover:text-lp-fg"
              >
                View on Mantlescan &uarr;
              </a>
            </motion.div>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 flex gap-6 border-t border-lp-border pt-5"
            >
              {[
                ["ERC-8004", "On-chain identity"],
                ["Pyth + Ondo", "Live oracles"],
                ["~$0.01", "Per rebalance"],
              ].map(([v, l]) => (
                <div key={v}>
                  <div className="font-display text-[15px] font-bold text-lp-gold">{v}</div>
                  <div className="mt-0.5 font-sans text-[11px] text-lp-fg-secondary">{l}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — dashboard mockup */}
          <motion.div
            initial={reduce ? false : { opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex justify-center"
          >
            <DashboardMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
