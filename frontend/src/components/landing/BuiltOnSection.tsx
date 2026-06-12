import LogoLoop from "../ui/LogoLoop";

const protocols = [
  { src: "/Mantle_no_bg.png", alt: "Mantle L2", href: "https://mantle.xyz" },
  { src: "/Ondo_no_bg.png", alt: "Ondo Finance (USDY)", href: "https://ondo.finance" },
  { src: "/Agni_no_bg.png", alt: "Agni Finance", href: "https://agni.finance" },
  { src: "/Pyth_no_bg.png", alt: "Pyth Network", href: "https://pyth.network" },
];

export function BuiltOnSection() {
  return (
    <section className="border-b border-lp-border bg-lp-surface px-6 py-14 lg:px-8">
      <div className="mx-auto max-w-screen-2xl text-center">
        <div className="mb-7 font-sans text-[11px] font-medium uppercase tracking-widest text-lp-fg-muted">
          Integrated with Mantle&apos;s live RWA infrastructure
        </div>
        <div className="relative mx-auto w-full max-w-[1400px]">
          <LogoLoop
            logos={protocols}
            speed={70}
            direction="left"
            logoHeight={32}
            gap={28}
            hoverSpeed={12}
            fadeOut
            fadeOutColor="hsl(var(--lp-surface))"
            scaleOnHover
            ariaLabel="Protocol integrations"
            renderItem={(item) => (
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer noopener"
                className="block transition-opacity duration-200 hover:opacity-90"
                aria-label={item.alt}
              >
                <span className="bg-copper-strong flex h-[130px] w-[180px] items-center justify-center rounded-[16px] border border-lp-gold/25 px-6">
                  <img
                    src={item.src}
                    alt={item.alt}
                    draggable={false}
                    className="block h-[52px] w-auto object-contain"
                  />
                </span>
              </a>
            )}
          />
        </div>
      </div>
    </section>
  );
}
