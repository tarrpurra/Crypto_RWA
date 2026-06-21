"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

const navLinks = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Glass Box", href: "#glass-box" },
];

const easeOut = [0.23, 1, 0.32, 1] as const;

type LandingNavProps = {
  isVisible: boolean;
  isSettled: boolean;
  isLaunching: boolean;
};

export function LandingNav({ isVisible, isSettled, isLaunching }: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const brandReady = isLaunching || isSettled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!isVisible) {
      setMobileOpen(false);
    }
  }, [isVisible]);

  return (
    <motion.nav
      initial={false}
      animate={{
        opacity: isVisible ? 1 : 0,
        y: isVisible || reduceMotion ? 0 : -16,
      }}
      transition={{ duration: 0.42, ease: easeOut }}
      className={cn(
        "fixed left-0 right-0 top-0 z-50",
        !isVisible && "pointer-events-none",
      )}
    >
        <div
          className={cn(
            "border-b transition-colors duration-200",
            scrolled || isVisible
              ? "border-lp-border-muted bg-lp-bg/84 backdrop-blur-xl"
              : "border-transparent bg-transparent",
          )}
        >
        <div className="mx-auto max-w-screen-2xl px-6 lg:px-8">
          <div className="flex h-[72px] items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                initial={false}
                animate={{
                  opacity: brandReady ? 1 : 0,
                  scale: brandReady ? 1 : 0.9,
                }}
                transition={{ duration: isLaunching ? 0.9 : 0.42, delay: isLaunching ? 0.64 : 0, ease: easeOut }}
                className="h-10 w-10 overflow-hidden rounded-full"
              >
                {brandReady ? (
                  <img src="/master_logo.png" alt="" aria-hidden="true" draggable={false} className="h-full w-full object-contain" />
                ) : null}
              </motion.div>
              <div className="overflow-hidden">
                <motion.span
                  initial={false}
                  animate={{
                    opacity: brandReady ? 1 : 0,
                    x: brandReady && !reduceMotion ? 0 : -18,
                    clipPath: brandReady ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
                  }}
                  transition={{
                    duration: isLaunching ? 1.18 : 0.52,
                    delay: isLaunching ? 0.92 : 0.16,
                    ease: easeOut,
                  }}
                  className="block font-brand text-xl tracking-tight text-lp-fg"
                >
                  YieldMind
                </motion.span>
              </div>
            </div>

            <motion.div
              initial={false}
              animate={{
                opacity: isSettled ? 1 : 0,
                y: isSettled || reduceMotion ? 0 : -8,
              }}
              transition={{
                duration: 0.44,
                delay: isSettled ? 0.9 : 0,
                ease: easeOut,
              }}
              className="hidden items-center gap-10 md:flex"
            >
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm text-lp-fg-secondary transition-colors hover:text-lp-fg"
                >
                  {link.label}
                </a>
              ))}
            </motion.div>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="flex items-center justify-center text-lp-fg-secondary hover:text-lp-fg md:hidden"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>

            <motion.div
              initial={false}
              animate={{
                opacity: isSettled ? 1 : 0,
                y: isSettled || reduceMotion ? 0 : -8,
              }}
              transition={{
                duration: 0.44,
                delay: isSettled ? 1.02 : 0,
                ease: easeOut,
              }}
              className="hidden items-center gap-4 md:flex"
            >
              <Link
                to="/dashboard"
                className="border-2 border-lp-gold bg-lp-gold px-6 py-2.5 text-sm font-semibold text-lp-bg transition-opacity duration-200 hover:opacity-90 active:scale-[0.98]"
              >
                Start Allocating &rarr;
              </Link>
            </motion.div>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-lp-border-muted bg-lp-bg/96 backdrop-blur-xl md:hidden">
          <div className="space-y-2 px-6 py-4">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block py-2 text-sm text-lp-fg-secondary transition-colors hover:text-lp-fg"
              >
                {link.label}
              </a>
            ))}
            <Link
              to="/dashboard"
              onClick={() => setMobileOpen(false)}
              className="mt-2 inline-block border-2 border-lp-gold bg-lp-gold px-6 py-2.5 text-sm font-semibold text-lp-bg"
            >
              Start Allocating &rarr;
            </Link>
          </div>
        </div>
      )}
    </motion.nav>
  );
}
