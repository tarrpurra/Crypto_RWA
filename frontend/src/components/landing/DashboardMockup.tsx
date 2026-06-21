import { useNavigate } from "react-router-dom";

export function DashboardMockup() {
   const navigate = useNavigate();
   return (
    <div
       className="w-full max-w-[520px] flex-shrink-0 overflow-hidden rounded-xl border border-lp-border cursor-pointer hover:scale-[1.02] transition-transform duration-200"
      style={{
        transform: "perspective(1100px) rotateY(-8deg) rotateX(3deg)",
        boxShadow: "0 40px 80px rgba(0,0,0,0.7),0 0 80px rgba(212,150,42,0.07)",
      }}
    >
      {/* Topbar */}
      <div className="flex items-center gap-2 border-b border-lp-border bg-lp-surface px-3 py-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lp-gold opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-lp-gold" />
        </span>
        <span className="font-mono text-[10px] text-lp-fg-secondary"><span className="font-brand">YieldMind</span> · Mantle Sepolia</span>
        <span className="ml-auto font-mono text-[10px] text-lp-fg-muted">
          Block <span className="text-lp-gold">#9,241,847</span>
        </span>
      </div>
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-1.5 bg-lp-bg p-2">
        {[
          ["AUM", "$124K", true],
          ["APY", "7.24%", false],
          ["Sharpe", "2.14", false],
          ["Decisions", "284", false],
        ].map(([l, v, acc]) => (
          <div
            key={l as string}
            className={`rounded-md border bg-lp-surface p-1.5 ${acc ? "border-t-2 border-t-lp-gold" : "border-lp-border"}`}
          >
            <div className="mb-0.5 font-sans text-[7.5px] font-medium uppercase tracking-wider text-lp-fg-muted">
              {l as string}
            </div>
            <div className={`font-display text-[13px] font-bold ${acc ? "text-lp-gold" : "text-lp-fg"}`}>
              {v as string}
            </div>
          </div>
        ))}
      </div>
      {/* Chart */}
      <div className="bg-lp-bg px-2.5 pb-1.5">
        <div className="rounded-md border border-lp-border bg-lp-surface p-2">
          <div className="mb-1.5 font-sans text-[9px] text-lp-fg-secondary">AI vs Passive · 28-day</div>
          <svg viewBox="0 0 300 52" className="block h-[52px] w-full">
            <line x1="0" y1="13" x2="300" y2="13" stroke="hsl(var(--lp-border))" strokeWidth="0.5" />
            <line x1="0" y1="26" x2="300" y2="26" stroke="hsl(var(--lp-border))" strokeWidth="0.5" />
            <line x1="0" y1="39" x2="300" y2="39" stroke="hsl(var(--lp-border))" strokeWidth="0.5" />
            <polyline
              points="0,40 60,38 120,36 180,34 240,32 300,30"
              fill="none"
              stroke="hsl(var(--lp-fg-muted))"
              strokeWidth="1"
              strokeDasharray="3 2"
            />
            <polyline
              points="0,40 40,37 80,33 120,29 160,26 200,22 240,18 280,14 300,12"
              fill="none"
              stroke="hsl(var(--lp-gold))"
              strokeWidth="2"
            />
            <polygon
              points="0,40 40,37 80,33 120,29 160,26 200,22 240,18 280,14 300,12 300,48 0,48"
              fill="hsl(var(--lp-gold) / 0.09)"
            />
            <circle cx="300" cy="12" r="3" fill="hsl(var(--lp-gold))" />
          </svg>
          <div className="mt-1 flex gap-3.5">
            {[
              ["bg-lp-gold", "AI Agent"],
              ["bg-lp-fg-muted/60", "Passive"],
            ].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1">
                <div className={`h-0.5 w-3.5 rounded-sm ${c}`} />
                <span className="font-sans text-[8px] text-lp-fg-secondary">{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Risk bars */}
      <div className="bg-lp-bg px-2.5 pb-2.5">
        <div className="rounded-md border border-lp-border bg-lp-surface p-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="font-sans text-[8.5px] text-lp-fg-secondary">Risk Level</span>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lp-gold opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-lp-gold" />
            </span>
            <span className="font-sans text-[8.5px] font-semibold text-lp-gold">GREEN · 25/100</span>
          </div>
          {[
            ["Credit", 18],
            ["Market", 34],
            ["Liquidity", 22],
            ["Concentration", 41],
          ].map(([n, s]) => (
            <div key={n as string} className="mb-1">
              <div className="mb-0.5 flex justify-between">
                <span className="font-sans text-[7.5px] text-lp-fg-muted">{n as string}</span>
                <span className="font-mono text-[7.5px] text-lp-gold">{s}</span>
              </div>
              <div className="h-0.5 rounded-full bg-lp-border">
                <div
                  className="h-full rounded-full bg-lp-gold"
                  onClick={() => navigate("/dashboard")}
       style={{ width: `${s}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
