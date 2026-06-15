const styles = `
.integration-section {
  position: relative;
  overflow: hidden;
  border-top: 1px solid rgba(212, 150, 42, 0.16);
  border-bottom: 1px solid rgba(212, 150, 42, 0.16);
  padding: 64px 0 72px;
}

.integration-kicker {
  text-align: center;
  margin-bottom: 40px;
  padding: 0 20px;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #d4962a;
}

.logo-carousel-shell {
  position: relative;
  overflow: hidden;
  width: 100%;
  padding: 0 72px;
}

.logo-carousel-shell::before,
.logo-carousel-shell::after {
  content: "";
  position: absolute;
  top: 0;
  width: 96px;
  height: 100%;
  z-index: 2;
  pointer-events: none;
}

.logo-carousel-shell::before {
  left: 0;
  background: linear-gradient(
    to right,
    hsl(var(--lp-bg)) 0%,
    hsl(var(--lp-bg) / 0.86) 35%,
    transparent 100%
  );
}

.logo-carousel-shell::after {
  right: 0;
  background: linear-gradient(
    to left,
    hsl(var(--lp-bg)) 0%,
    hsl(var(--lp-bg) / 0.86) 35%,
    transparent 100%
  );
}

.logo-carousel-track {
  display: flex;
  gap: 28px;
  align-items: center;
  width: max-content;
  animation: logo-scroll 40s linear infinite;
}

.logo-card {
  flex: 0 0 clamp(220px, 18vw, 300px);
  height: 150px;
  border-radius: 22px;
  background:
    linear-gradient(135deg, rgba(212, 150, 42, 0.72), rgba(160, 136, 88, 0.44)),
    #1e1509;
  border: 1px solid rgba(212, 150, 42, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 1px 0 rgba(244, 237, 214, 0.08),
    0 18px 44px rgba(0, 0, 0, 0.24);
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-decoration: none;
}

.logo-card:hover {
  transform: scale(1.04);
  box-shadow:
    inset 0 1px 0 rgba(244, 237, 214, 0.12),
    0 22px 52px rgba(0, 0, 0, 0.32);
}

.logo-card img {
  max-width: 82px;
  max-height: 82px;
  object-fit: contain;
  filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.28));
  pointer-events: none;
}

@keyframes logo-scroll {
  0% {
    transform: translate3d(0, 0, 0);
  }
  100% {
    transform: translate3d(-33.333%, 0, 0);
  }
}

@media (max-width: 1024px) {
  .logo-card {
    flex-basis: 260px;
  }
}

@media (max-width: 640px) {
  .logo-carousel-shell {
    padding: 0 20px;
  }

  .logo-carousel-shell::before,
  .logo-carousel-shell::after {
    width: 48px;
  }

  .logo-card {
    flex-basis: 78vw;
    height: 132px;
  }

  .logo-card img {
    max-width: 64px;
    max-height: 64px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .logo-carousel-track {
    animation: none;
  }
}
`;

const protocols = [
  { src: "/Mantle_no_bg.png", alt: "Mantle L2", href: "https://mantle.xyz" },
  { src: "/Ondo_no_bg.png", alt: "Ondo Finance (USDY)", href: "https://ondo.finance" },
  { src: "/Agni_no_bg.png", alt: "Agni Finance", href: "https://agni.finance" },
  { src: "/Pyth_no_bg.png", alt: "Pyth Network", href: "https://pyth.network" },
];

export function BuiltOnSection() {
  return (
    <>
      <style>{styles}</style>
      <section className="integration-section">
        <p className="integration-kicker">
          Integrated with Mantle&apos;s live RWA infrastructure
        </p>

        <div className="logo-carousel-shell">
          <div className="logo-carousel-track">
            {[...protocols, ...protocols, ...protocols].map((p, i) => (
              <a
                key={`${p.alt}-${i}`}
                href={p.href}
                target="_blank"
                rel="noreferrer noopener"
                className="logo-card"
                aria-label={p.alt}
              >
                <img src={p.src} alt={p.alt} draggable={false} />
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
