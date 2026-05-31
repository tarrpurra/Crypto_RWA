import { ArrowRightLeft, ShieldCheck, TrendingUp, Waypoints } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const exchangeRoles = [
  {
    name: "Pacifica",
    role: "Primary execution venue",
    detail: "Takes the long or short perp leg on-chain with the user's approved agent.",
    badge: "On-chain execution",
  },
  {
    name: "Lighter",
    role: "Hedge venue",
    detail: "Neutralizes price exposure with the opposite perp leg on-chain.",
    badge: "On-chain hedge",
  },
  {
    name: "Binance",
    role: "Reference signal only",
    detail: "Used as a public funding and mark-price feed. No account, API key, or KYC step for users.",
    badge: "Read-only signal",
  },
  {
    name: "Bybit",
    role: "Reference signal only",
    detail: "Used as a public funding and mark-price feed. No account, API key, or KYC step for users.",
    badge: "Read-only signal",
  },
  {
    name: "Rhino",
    role: "Funding path",
    detail: "Bridges USDC into Pacifica before the bot is enabled.",
    badge: "Bridge only",
  },
];

const flowPoints = [
  {
    icon: ShieldCheck,
    title: "No CEX onboarding",
    detail: "Users never need Binance or Bybit credentials to use the arb bot.",
  },
  {
    icon: ArrowRightLeft,
    title: "Execution stays on-chain",
    detail: "Pacifica and Lighter handle the actual paired orders once the user approves the agent.",
  },
  {
    icon: TrendingUp,
    title: "Binance and Bybit stay read-only",
    detail: "They are market references for funding divergence and price dislocations only.",
  },
  {
    icon: Waypoints,
    title: "Funding path is explicit",
    detail: "Users bridge USDC into Pacifica and enable the bot only after funding is in place.",
  },
];

export function ArbFlowHero() {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.8)]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-success/30 text-success">
          Testnet First
        </Badge>
        <Badge variant="outline" className="border-warning/30 text-warning">
          No Binance / Bybit KYC Path
        </Badge>
        <Badge variant="outline" className="border-primary/30 text-primary">
          Trading Off By Default
        </Badge>
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Funding arbitrage stays wallet-first.
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              The arb bot should onboard users through wallet connection, one-time agent approval,
              Pacifica funding, and explicit enablement. Binance and Bybit are read-only signal
              feeds, so the website should not imply that users need CEX accounts or KYC to trade.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {flowPoints.map((point) => (
              <div key={point.title} className=" border border-border/80 bg-surface-2 p-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <point.icon className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-medium text-foreground">{point.title}</h2>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{point.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {exchangeRoles.map((exchange) => (
            <div key={exchange.name} className="rounded-xl border border-border/80 bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{exchange.name}</p>
                  <p className="mt-1 text-xs text-foreground/90">{exchange.role}</p>
                </div>
                <Badge
                  variant="outline"
                  className="border-border bg-card text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {exchange.badge}
                </Badge>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{exchange.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
