"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import YieldMindIntro from "@/components/intro/YieldMindIntro";
import { LandingNav } from "@/components/landing/LandingNav";
import { HeroSection } from "@/components/landing/HeroSection";
import { Ticker } from "@/components/landing/Ticker";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { BuiltOnSection } from "@/components/landing/BuiltOnSection";
import { GlassBoxSection } from "@/components/landing/GlassBoxSection";
import { HumanVsAISection } from "@/components/landing/HumanVsAISection";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";

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
  { key: "human-vs-ai", node: <HumanVsAISection /> },
  { key: "cta", node: <FinalCta /> },
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
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-background text-foreground">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0.12, clipPath: `circle(6.5rem at ${activationOrigin})`, scale: 0.96 }}
        animate={{
          opacity: isVisible ? 0.34 : 0.12,
          clipPath: isVisible ? `circle(160vmax at ${activationOrigin})` : `circle(6.5rem at ${activationOrigin})`,
          scale: isVisible ? 1 : 0.96,
        }}
        transition={{
          duration: phase === "launching" ? 1.9 : 0.28,
          ease: easeOut,
        }}
        style={{ transformOrigin: activationOrigin }}
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(214,184,63,0.18),transparent_0%,transparent_38%),radial-gradient(circle_at_70%_22%,rgba(214,184,63,0.09),transparent_0%,transparent_28%),linear-gradient(180deg,rgba(9,7,5,0.14),rgba(5,4,3,0.4))]" />
      </motion.div>
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(214,184,63,0.08),transparent_40%),linear-gradient(to_bottom,rgba(3,3,3,0.04),rgba(3,3,3,0.34))]" />
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
            clipPath: "circle(160vmax at 50% 42%)",
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
        </motion.div>
      ) : null}
      </div>
    </div>
  );
};

export default Landing;
