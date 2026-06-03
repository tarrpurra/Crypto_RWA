import { motion } from "framer-motion";

type YieldMindOrbProps = {
  className?: string;
  size?: number | string;
  settled?: boolean;
};

const easeOut = [0.23, 1, 0.32, 1] as const;

const ringTransition = {
  repeat: Infinity,
  duration: 12,
  ease: "linear",
} as const;

const orbitTransition = {
  repeat: Infinity,
  duration: 8,
  ease: "linear",
} as const;

const shellTransition = {
  repeat: Infinity,
  repeatType: "reverse",
  duration: 3.8,
  ease: easeOut,
} as const;

const YieldMindOrb = ({
  className = "",
  size = "100%",
  settled = false,
}: YieldMindOrbProps) => {
  return (
    <div
      className={className}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <motion.div
        initial={false}
        animate={{
          rotate: 360,
          scale: settled ? 1 : [0.985, 1, 0.985],
        }}
        transition={{
          rotate: ringTransition,
          scale: settled
            ? { duration: 0.2 }
            : shellTransition,
        }}
        className="relative h-full w-full rounded-full"
      >
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,244,194,0.42),rgba(255,244,194,0)_20%),radial-gradient(circle_at_center,rgba(214,184,63,0.26),rgba(214,184,63,0)_55%)]" />

        <div className="absolute inset-0 rounded-full border border-[#f6e7ab]/30 shadow-[0_0_42px_rgba(214,184,63,0.16)]" />

        <div className="absolute inset-[11%] rounded-full bg-[conic-gradient(from_220deg,#7a5a0b_0deg,#f1d86a_55deg,#b79221_120deg,#332707_220deg,#d6b83f_310deg,#7a5a0b_360deg)] p-[10%] shadow-[inset_0_0_18px_rgba(255,236,165,0.34)]">
          <div className="relative h-full w-full rounded-full bg-[radial-gradient(circle_at_34%_28%,rgba(76,76,76,0.48),rgba(8,8,8,0.9)_36%,rgba(2,2,2,1)_72%)] shadow-[inset_0_0_30px_rgba(0,0,0,0.9)]">
            <div className="absolute inset-[18%] rounded-full border border-[#f1d86a]/15" />

            <div className="absolute left-1/2 top-[24%] h-[37%] w-[10%] -translate-x-1/2 rounded-full bg-[#f6e7ab] shadow-[0_0_12px_rgba(241,216,106,0.4)]" />
            <div className="absolute left-[38%] top-[50%] h-[10%] w-[13%] -rotate-45 rounded-full bg-[#f6e7ab] shadow-[0_0_10px_rgba(241,216,106,0.3)]" />
            <div className="absolute right-[38%] top-[50%] h-[10%] w-[13%] rotate-45 rounded-full bg-[#f6e7ab] shadow-[0_0_10px_rgba(241,216,106,0.3)]" />
          </div>
        </div>

        <motion.div
          initial={false}
          animate={{ rotate: -360 }}
          transition={orbitTransition}
          className="absolute inset-[3%] rounded-full"
        >
          <div className="absolute left-1/2 top-0 h-full w-[6%] -translate-x-1/2 rounded-full bg-[linear-gradient(to_bottom,rgba(241,216,106,0),rgba(241,216,106,0.95),rgba(241,216,106,0))] opacity-60 blur-[1px]" />
        </motion.div>

        <motion.div
          initial={false}
          animate={{
            opacity: settled ? 0.3 : [0.28, 0.52, 0.28],
          }}
          transition={settled ? { duration: 0.2 } : shellTransition}
          className="absolute inset-[-6%] rounded-full bg-[radial-gradient(circle,rgba(214,184,63,0.22),rgba(214,184,63,0)_58%)] blur-xl"
        />
      </motion.div>
    </div>
  );
};

export default YieldMindOrb;
