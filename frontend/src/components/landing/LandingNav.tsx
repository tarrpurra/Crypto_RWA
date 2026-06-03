"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import YieldMindOrb from "@/components/intro/YieldMindOrb";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Product", href: "#features" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Docs", href: "#" },
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
            ? "border-lp-border-muted bg-black/78 backdrop-blur-xl"
            : "border-transparent bg-transparent",
        )}
      >
        <div className="mx-auto max-w-screen-2xl px-6 lg:px-8">
          <div className="flex h-[72px] items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
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
                  <YieldMindOrb className="h-full w-full" settled />
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
                  className="block font-display text-xl font-semibold tracking-tight text-lp-fg"
                >
                  YieldMind
                </motion.span>
              </div>
            </Link>

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
                className="border border-lp-border-muted px-5 py-2.5 text-sm font-medium text-lp-fg-muted transition-colors hover:border-lp-border hover:text-lp-fg"
              >
                Log in
              </Link>
              <Link
                to="/dashboard"
                className="border-2 border-lp-gold bg-lp-gold px-6 py-2.5 text-sm font-semibold text-lp-bg transition-opacity duration-200 hover:opacity-90 active:scale-[0.98]"
              >
                Get started
              </Link>
            </motion.div>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="flex items-center justify-center text-lp-fg-secondary hover:text-lp-fg md:hidden"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-lp-border-muted bg-black/95 backdrop-blur-xl md:hidden">
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
            <hr className="border-lp-border-muted" />
            <Link
              to="/dashboard"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm text-lp-fg-muted transition-colors hover:text-lp-fg"
            >
              Log in
            </Link>
            <Link
              to="/dashboard"
              onClick={() => setMobileOpen(false)}
              className="mt-2 inline-block border-2 border-lp-gold bg-lp-gold px-6 py-2.5 text-sm font-semibold text-lp-bg"
            >
              Get started
            </Link>
          </div>
        </div>
      )}
    </motion.nav>
  );
}
