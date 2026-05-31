import { Settings2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { LoginButton } from "@/components/auth/LoginButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const navItems = [
  { title: "Dashboard", url: "/" },
  { title: "Risk", url: "/risk" },
  { title: "Trade", url: "/trade" },
  { title: "Settings", url: "/settings" },
];

export function TopBar() {
  const location = useLocation();
  const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000");
  const environmentLabel = /localhost|127\.0\.0\.1/i.test(apiBaseUrl)
    ? "LOCAL"
    : "REMOTE";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card">
      <div className="grid min-h-11 grid-cols-[auto_1fr_auto] items-stretch">
<Link
           to="/"
           className="flex items-center gap-2 border-r border-border px-3 text-foreground"
         >
           <span className="terminal-wordmark text-[18px] leading-none">
             AIYield
           </span>
           <span className="terminal-label text-primary">PORTFOLIO</span>
         </Link>

        <nav
          data-testid="topbar-nav"
          className="flex min-w-0 items-stretch overflow-x-auto"
        >
          {navItems.map((item) => (
            <Link
              key={item.url}
              to={item.url}
              className={`flex min-h-11 items-center border-b-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                location.pathname === item.url
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.title}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 border-l border-border px-3">
          <ThemeToggle />
          <div className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 bg-warning" />
            <span className="terminal-label">{environmentLabel}</span>
          </div>
          <LoginButton />
          <Link
            to="/settings"
            title="Settings"
            className="flex h-8 w-8 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Settings2 className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
