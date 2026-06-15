const items = [
  ["USDY/USD", "$1.0523", "+0.02%", true],
  ["mETH/USD", "$2,204.81", "+0.34%", true],
  ["ETH/USD", "$2,118.43", "-0.12%", false],
  ["MNT/USD", "$0.6041", "-2.56%", false],
  ["Aave USDY APY", "5.82%", "+0.11%", true],
  ["Risk Level", "GREEN", "", null],
  ["Vault APY (Testnet)", "7.24%", "+2.59% vs bench", true],
];

export function Ticker() {
  return (
    <div className="h-10 overflow-hidden border-y border-lp-border bg-lp-surface">
      <div
        className="flex h-full items-center gap-11 whitespace-nowrap"
        style={{
          animation: "ticker 30s linear infinite",
        }}
      >
        {[...items, ...items].map(([l, v, d, up], i) => (
          <span key={i} className="inline-flex gap-1.5 font-mono text-[11px] text-lp-fg-muted">
            <span>{l}</span>
            <span className="text-lp-fg-secondary">{v}</span>
            {d && (
              <span className={up ? "text-up" : "text-down"}>
                {d as string}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
