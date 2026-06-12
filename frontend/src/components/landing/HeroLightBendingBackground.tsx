"use client";

import FloatingLines from "@/components/ui/FloatingLines";

type HeroLightBendingBackgroundProps = {
  reduce: boolean | null;
};

export function HeroLightBendingBackground({ reduce }: HeroLightBendingBackgroundProps) {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      {/* Base glow */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_50%_20%,hsl(var(--lp-gold)/0.22),transparent_30%),radial-gradient(circle_at_82%_58%,rgba(214,184,63,0.14),transparent_24%)]" />

      {/* Floating lines */}
      <div className="absolute inset-0 z-[2] pointer-events-auto opacity-70">
        <FloatingLines
          enabledWaves={["top", "middle", "bottom"]}
          lineCount={[10, 15, 20]}
          lineDistance={[8, 6, 4]}
          animationSpeed={reduce ? 0.2 : 0.8}
          interactive={!reduce}
          bendRadius={7}
          bendStrength={-5.5}
          mouseDamping={0.05}
          parallax={!reduce}
          parallaxStrength={0.2}
          mixBlendMode="screen"
          linesGradient={["#2b1b08", "#6e5320", "#d6b83f", "#f7df8a"]}
        />
      </div>

      {/* Grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-[3] opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--lp-border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--lp-border)) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
        }}
      />

      {/* Readability vignette */}
      <div className="hero-vignette pointer-events-none absolute inset-0 z-[4]" />
    </div>
  );
}
