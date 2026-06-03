"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import YieldMindIntro from "@/components/intro/YieldMindIntro";
import { LandingNav } from "@/components/landing/LandingNav";
import { HeroSection } from "@/components/landing/HeroSection";
import { MetricsBar } from "@/components/landing/MetricsBar";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { PerformanceChart } from "@/components/landing/PerformanceChart";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";

type LandingPhase = "intro" | "launching" | "entered";

const INTRO_STORAGE_KEY = "yieldmind-intro-seen";
const INTRO_DURATION_MS = 2850;
const easeOut = [0.23, 1, 0.32, 1] as const;
const revealItems = [
  { key: "hero", node: <HeroSection /> },
  { key: "metrics", node: <MetricsBar /> },
  { key: "features", node: <FeatureGrid /> },
  { key: "chart", node: <PerformanceChart /> },
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
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-zinc-950 text-white">
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
  );
};

export default Landing;
