import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import YieldMindOrb from "./YieldMindOrb";

type YieldMindIntroProps = {
  isLaunching: boolean;
  onEnter: () => void;
};

const easeOut = [0.23, 1, 0.32, 1] as const;

export default function YieldMindIntro({
  isLaunching,
  onEnter,
}: YieldMindIntroProps) {
  const reduceMotion = useReducedMotion();
  const [canHover, setCanHover] = useState(false);
  const [targetLeft, setTargetLeft] = useState(24);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const updateHover = () => setCanHover(mediaQuery.matches);
    const updateTarget = () => setTargetLeft(window.innerWidth >= 1024 ? 32 : 24);

    updateHover();
    updateTarget();

    mediaQuery.addEventListener("change", updateHover);
    window.addEventListener("resize", updateTarget);

    return () => {
      mediaQuery.removeEventListener("change", updateHover);
      window.removeEventListener("resize", updateTarget);
    };
  }, []);

  const orbAnimation = reduceMotion
    ? {
        top: "50%",
        left: "50%",
        x: -72,
        y: -72,
        width: 144,
        height: 144,
        rotate: 0,
      }
    : isLaunching
      ? {
          top: 16,
          left: targetLeft,
          x: 0,
          y: 0,
          width: 40,
          height: 40,
          rotate: 540,
        }
      : {
          top: "50%",
          left: "50%",
          x: -84,
          y: -104,
          width: 168,
          height: 168,
          rotate: 0,
        };

  return (
    <motion.div
      initial={false}
      animate={{
        opacity: isLaunching ? 0 : 1,
      }}
      transition={{
        duration: isLaunching ? 2.1 : 0.2,
        delay: isLaunching ? 0.36 : 0,
        ease: easeOut,
      }}
      className="fixed inset-0 z-[60] overflow-hidden bg-[#030303]"
      aria-hidden={isLaunching}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(214,184,63,0.16),transparent_38%),linear-gradient(rgba(214,184,63,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(214,184,63,0.08)_1px,transparent_1px)] bg-[size:auto,56px_56px,56px_56px] opacity-50" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,232,167,0.08),transparent_46%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,3,3,0.2),rgba(3,3,3,0.82))]" />

      <motion.div
        initial={false}
        animate={orbAnimation}
        transition={{
          duration: isLaunching ? 2.35 : 0.24,
          ease: easeOut,
        }}
        className="absolute z-20"
      >
        <motion.button
          type="button"
          onClick={onEnter}
          disabled={isLaunching}
          initial={false}
          whileHover={canHover && !isLaunching ? { scale: 1.04 } : undefined}
          whileTap={!isLaunching ? { scale: 0.97 } : undefined}
          animate={{
            filter: isLaunching
              ? "drop-shadow(0 0 18px rgba(214,184,63,0.44))"
              : "drop-shadow(0 0 28px rgba(214,184,63,0.28))",
          }}
          transition={{ duration: isLaunching ? 0.56 : 0.18, ease: "easeOut" }}
          className="block h-full w-full cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D6B83F] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-default"
          aria-label="Launch YieldMind"
        >
          <YieldMindOrb className="h-full w-full" settled={isLaunching} />
        </motion.button>
      </motion.div>

      <motion.div
        initial={false}
        animate={{
          opacity: isLaunching ? 0 : 1,
          y: isLaunching ? 18 : 0,
          filter: isLaunching ? "blur(6px)" : "blur(0px)",
        }}
        transition={{ duration: 0.56, ease: easeOut }}
        className="absolute left-1/2 top-1/2 z-10 flex w-full max-w-sm -translate-x-1/2 translate-y-16 flex-col items-center px-6 text-center"
      >
        <p className="font-display text-sm font-medium uppercase tracking-[0.28em] text-[#F1D86A]">
          Enter YieldMind
        </p>
        <p className="mt-4 max-w-[18rem] text-sm leading-6 text-[#c8c1aa]">
          Click the mark to boot the yield intelligence terminal.
        </p>
      </motion.div>
    </motion.div>
  );
}
