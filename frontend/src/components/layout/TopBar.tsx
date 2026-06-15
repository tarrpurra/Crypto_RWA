import { Link, useLocation } from "react-router-dom";

import { LoginButton } from "@/components/auth/LoginButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const navItems = [
  { title: "Dashboard", url: "/dashboard" },
  { title: "Risk", url: "/risk" },
  { title: "Decision Log", url: "/decision-log" },
  { title: "Strategy Studio", url: "/strategy-lab" },
];

export function TopBar() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-xl">
      <div className="grid min-h-12 grid-cols-[auto_1fr_auto] items-stretch">
        <Link
          to="/"
          className="flex items-center gap-2 border-r border-border px-4 text-foreground transition-colors hover:text-primary"
        >
          <img src="/master_logo.png" alt="" aria-hidden="true" draggable={false} className="h-6 w-6 object-contain shrink-0" />
          <span className="terminal-wordmark text-[18px] font-semibold leading-none">
            YieldMind
          </span>
        </Link>

        <nav
          data-testid="topbar-nav"
          className="flex min-w-0 items-stretch overflow-x-auto"
        >
          {navItems.map((item) => (
            <Link
              key={item.url}
              to={item.url}
              className={`flex min-h-12 items-center whitespace-nowrap border-b-2 px-3 text-[12px] font-semibold transition-colors ${
                (item.url === "/" && location.pathname === "/") ||
                (item.url === "/dashboard" && (location.pathname === "/" || location.pathname === "/dashboard")) ||
                (item.url !== "/" && location.pathname.startsWith(item.url))
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{item.title}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 border-l border-border px-3">
          <ThemeToggle />
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
