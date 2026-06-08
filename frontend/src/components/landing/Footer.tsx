export function Footer() {
  const links = [
    ["GitHub", "https://github.com/your-org/yieldmind"],
    ["Contract", "https://explorer.sepolia.mantle.xyz"],
    ["DoraHacks", "https://dorahacks.io/hackathon/mantleturingtesthackathon2026"],
  ];

  return (
    <footer className="border-t border-lp-border bg-lp-surface">
      <div className="mx-auto max-w-screen-2xl px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 py-10 text-sm text-lp-fg-muted md:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-gradient-to-br from-lp-fg-muted to-lp-gold font-display text-[11px] font-bold text-lp-bg">
              Y
            </div>
            <span className="font-display text-[13px] font-bold text-lp-fg">YieldMind</span>
          </div>
          <div className="flex gap-6">
            {links.map(([l, h]) => (
              <a
                key={l}
                href={h as string}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-lp-gold"
              >
                {l} &uarr;
              </a>
            ))}
          </div>
          <div className="font-mono text-[10px]">
            Mantle Sepolia #5003 · ERC-8004 · AI × RWA
          </div>
        </div>
      </div>
    </footer>
  );
}
