import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import CircularText from "../ui/CircularText";
import MagicRings from "../ui/MagicRings";

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
          y: -84,
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
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <MagicRings
          color="#D49628"
          colorTwo="#f4edd6"
          ringCount={6}
          speed={0.85}
          attenuation={10}
          lineThickness={2}
          baseRadius={0.35}
          radiusStep={0.1}
          scaleRate={0.1}
          opacity={0.9}
          blur={0}
          noiseAmount={0.08}
          rotation={0}
          ringGap={1.5}
          fadeIn={0.7}
          fadeOut={0.5}
          followMouse={true}
          mouseInfluence={0.15}
          hoverScale={1.1}
          parallax={0.04}
          clickBurst={true}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,3,3,0.06),rgba(3,3,3,0.66))]" />

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
          transition={{ duration: isLaunching ? 0.56 : 0.18, ease: "easeOut" }}
          className="block h-full w-full cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D6B83F] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-default"
          aria-label="Launch YieldMind"
        >
          <div className="relative h-full w-full">
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              animate={{
                opacity: isLaunching ? 0 : 1,
                scale: isLaunching ? 0.72 : 1,
              }}
              transition={{ duration: 0.35 }}
            >
              <div className="relative flex h-full w-full items-center justify-center">
                <img
                  src="/master_logo.png"
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="relative h-full w-full scale-[1.7]  translate-y-[8%] select-none object-contain"
                />
              </div>
            </motion.div>
          </div>
        </motion.button>
      </motion.div>

      <motion.div
        initial={{ opacity: 1, scale: 1 }}
        animate={{
          opacity: isLaunching ? 0 : 1,
          scale: isLaunching ? 0.5 : 1,
        }}
        transition={{ duration: isLaunching ? 0.7 : 0.3, delay: isLaunching ? 0.25 : 0, ease: easeOut }}
        className="absolute z-[7]"
        style={{ left: "calc(50% - 100px)", top: "calc(50% - 100px)" }}
      >
        <CircularText text="YIELD MIND · AI · RWA · " spinDuration={24} onHover="slowDown" />
      </motion.div>


    </motion.div>
  );
}
