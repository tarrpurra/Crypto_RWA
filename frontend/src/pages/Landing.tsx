"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import YieldMindIntro from "@/components/intro/YieldMindIntro";
import { LandingNav } from "@/components/landing/LandingNav";
const HeroSection = lazy(() => import("@/components/landing/HeroSection").then((module) => ({ default: module.HeroSection })));

const Ticker = lazy(() => import("@/components/landing/Ticker").then((module) => ({ default: module.Ticker })));
const ProblemSection = lazy(() => import("@/components/landing/ProblemSection").then((module) => ({ default: module.ProblemSection })));
const HowItWorksSection = lazy(() => import("@/components/landing/HowItWorksSection").then((module) => ({ default: module.HowItWorksSection })));
const BuiltOnSection = lazy(() => import("@/components/landing/BuiltOnSection").then((module) => ({ default: module.BuiltOnSection })));
const GlassBoxSection = lazy(() => import("@/components/landing/GlassBoxSection").then((module) => ({ default: module.GlassBoxSection })));
const Footer = lazy(() => import("@/components/landing/Footer").then((module) => ({ default: module.Footer })));

type LandingPhase = "intro" | "launching" | "entered";

const INTRO_STORAGE_KEY = "yieldmind-intro-seen";
const INTRO_DURATION_MS = 2850;
const easeOut = [0.23, 1, 0.32, 1] as const;
const activationOrigin = "50% 50%";
const revealItems = [
  { key: "hero", node: <HeroSection /> },
  { key: "ticker", node: <Ticker /> },
  { key: "problem", node: <ProblemSection /> },
  { key: "how-it-works", node: <HowItWorksSection /> },
  { key: "built-on", node: <BuiltOnSection /> },
  { key: "glass-box", node: <GlassBoxSection /> },
  { key: "footer", node: <Footer /> },
] as const;

const Landing = () => {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<LandingPhase>("intro");
  const launchTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hasSeenIntro = sessionStorage.getItem(INTRO_STORAGE_KEY) === "true";
    if (reduceMotion || hasSeenIntro) {
      setPhase("entered");
    }
  }, [reduceMotion]);

  useEffect(() => {
    return () => {
      if (launchTimeoutRef.current !== null) {
        window.clearTimeout(launchTimeoutRef.current);
      }
    };
  }, []);

  const handleEnter = () => {
    if (phase !== "intro") {
      return;
    }

    if (typeof window !== "undefined") {
      sessionStorage.setItem(INTRO_STORAGE_KEY, "true");
    }

    if (reduceMotion) {
      setPhase("entered");
      return;
    }

    setPhase("launching");
    launchTimeoutRef.current = window.setTimeout(() => {
      setPhase("entered");
    }, INTRO_DURATION_MS);
  };

  const isVisible = phase !== "intro";
  const isSettled = phase === "entered";

  return (
    <div className="landing-page relative min-h-[100dvh] overflow-x-hidden bg-lp-bg text-lp-fg">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0.12, clipPath: `circle(6.5rem at ${activationOrigin})`, scale: 0.96 }}
        animate={{
          opacity: isVisible ? 0.34 : 0.12,
          clipPath: isVisible ? `circle(999vmax at ${activationOrigin})` : `circle(6.5rem at ${activationOrigin})`,
          scale: isVisible ? 1 : 0.96,
        }}
        transition={{
          duration: phase === "launching" ? 1.9 : 0.28,
          ease: easeOut,
        }}
        style={{ transformOrigin: activationOrigin }}
        className="landing-ambient pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
      </motion.div>
      <div className="landing-overlay absolute inset-0 z-0" />
      <div className="relative z-10">
        <LandingNav isVisible={isVisible} isSettled={isSettled} isLaunching={phase === "launching"} />

      {phase !== "entered" ? (
        <YieldMindIntro isLaunching={phase === "launching"} onEnter={handleEnter} />
      ) : null}

      {isVisible ? (
        <motion.div
          animate={{
            opacity: 1,
            filter: "blur(0px)",
            clipPath: "circle(999vmax at 50% 42%)",
            scale: 1,
          }}
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0.24,
                  filter: "blur(20px)",
                  clipPath: "circle(5rem at 50% 42%)",
                  scale: 0.985,
                }
          }
          transition={{
            duration: phase === "launching" ? 1.9 : 0.24,
            delay: phase === "launching" ? 0.52 : 0,
            ease: easeOut,
          }}
          style={{
            pointerEvents: isSettled ? "auto" : "none",
            transformOrigin: "50% 42%",
          }}
        >
          <Suspense fallback={null}>
            {revealItems.map((item, index) => (
              <motion.div
                key={item.key}
                initial={
                  reduceMotion
                    ? false
                    : {
                        opacity: 0,
                        y: index === 0 ? 18 : 28,
                        scale: 0.985,
                        filter: "blur(12px)",
                      }
                }
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  filter: "blur(0px)",
                }}
                transition={{
                  duration: index === 0 ? 1.02 : 0.92,
                  delay: phase === "launching" ? 0.88 + index * 0.18 : 0,
                  ease: easeOut,
                }}
              >
                {item.node}
              </motion.div>
            ))}
          </Suspense>
        </motion.div>
      ) : null}
      </div>
    </div>
  );
};

export default Landing;
