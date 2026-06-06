import { DitheringShader } from "@/components/ui/dithering-shader";
import Simplex from "@/components/ui/simplex";

export default function SimplexDemo() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-lp-bg text-lp-fg">
      <div className="absolute inset-0">
        <DitheringShader
          shape="ripple"
          type="2x2"
          colorBack="#330000"
          colorFront="#ffff00"
          pxSize={2}
          speed={1.2}
          width={1600}
          height={1200}
          className="h-full w-full opacity-80"
        />
      </div>
      <div className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center gap-8 px-6 text-center">
        <span className="pointer-events-none text-7xl font-semibold tracking-tighter whitespace-pre-wrap text-white">
          Simplex
        </span>
        <div className="rounded-2xl border border-lp-border-muted bg-lp-bg/80 p-4 backdrop-blur-xl">
          <Simplex />
        </div>
      </div>
    </div>
  );
}
