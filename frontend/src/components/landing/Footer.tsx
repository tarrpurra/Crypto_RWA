export function Footer() {
  const links = [
    ["GitHub", "https://github.com/tarrpurra/Crypto_RWA"],
    ["DoraHacks", "https://dorahacks.io/buidl/44982"],
    ["Email", "mailto:yieldmind1@gmail.com"],
  ];

  return (
    <footer className="border-t border-lp-border bg-lp-surface">
      <div className="mx-auto max-w-screen-2xl px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 py-10 text-sm text-lp-fg-muted md:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-gradient-to-br from-lp-fg-muted to-lp-gold font-brand text-[11px] text-lp-bg">
              Y
            </div>
            <span className="font-brand text-[13px] text-lp-fg">YieldMind</span>
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
            Mantle Sepolia #5003 · AI × RWA
          </div>
        </div>
      </div>
    </footer>
  );
}
