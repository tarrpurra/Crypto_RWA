import { Settings2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { LoginButton } from "@/components/auth/LoginButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const navItems = [
  { title: "Dashboard", url: "/dashboard" },
  { title: "Risk", url: "/risk" },
  { title: "Allocation", url: "/allocation" },
  { title: "Trade", url: "/trade" },
  { title: "Approvals", url: "/approvals" },
  { title: "Strategy Lab", url: "/strategy-lab" },
  { title: "Settings", url: "/settings" },
];

export function TopBar() {
  const location = useLocation();
  const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000");
  const environmentLabel = /localhost|127\.0\.0\.1/i.test(apiBaseUrl)
    ? "LOCAL"
    : "REMOTE";

  return (
    <header className="sticky top-0 z-30 border-b-2 border-border bg-card">
      <div className="grid min-h-12 grid-cols-[auto_1fr_auto] items-stretch">
        <Link
           to="/dashboard"
           className="flex items-center gap-2 border-r-2 border-border px-4 text-foreground transition-colors hover:text-primary"
         >
           <span className="terminal-wordmark text-[18px] font-semibold leading-none">
             AIYield
           </span>
           <span className="hidden text-[11px] font-semibold text-primary sm:inline">
             Portfolio
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
              {item.title}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 border-l-2 border-border px-3">
          <ThemeToggle />
          <div className="hidden items-center gap-2 border-2 border-border bg-surface-2 px-2 py-1 md:inline-flex">
            <span className="h-1.5 w-1.5 bg-warning" />
            <span className="font-mono text-[11px] text-muted-foreground">{environmentLabel}</span>
          </div>
          <LoginButton />
          <Link
            to="/settings"
            title="Settings"
            className="flex h-8 w-8 items-center justify-center border-2 border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Settings2 className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
