import {
  Activity,
  BarChart3,
  DatabaseZap,
  FileCheck2,
  LayoutDashboard,
  PieChart,
  Settings,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { useChainStatus, useSystemHealth } from "@/hooks/useSystem";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Portfolio", url: "/portfolio", icon: PieChart },
  { title: "Risk", url: "/risk", icon: ShieldCheck },
  { title: "Allocation", url: "/allocation", icon: BarChart3 },
  { title: "Market", url: "/market", icon: DatabaseZap },
  { title: "Approvals", url: "/approvals", icon: FileCheck2 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const healthQuery = useSystemHealth();
  const chainQuery = useChainStatus();

  const apiConnected = healthQuery.data?.status === "ok";
  const chainReady = chainQuery.data?.status === "ok";

  const liveStats = [
    {
      label: "Chain",
      value: chainReady ? "Ready" : chainQuery.isLoading ? "..." : "Check",
      tone: chainReady ? "accent" : "muted",
    },
    {
      label: "API",
      value: apiConnected ? "Online" : healthQuery.isLoading ? "..." : "Offline",
      tone: apiConnected ? "primary" : "muted",
    },
    {
      label: "Mode",
      value: "Advisory",
      tone: "accent",
    },
  ] as const;

  return (
    <Sidebar
      collapsible="icon"
      className="z-20 border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur-xl"
    >
      <SidebarHeader className="relative overflow-hidden border-b border-sidebar-border/70 px-3 py-3">
        <div className="relative flex w-full items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] border border-primary/20 bg-primary text-primary-foreground shadow-[0_18px_34px_-22px_hsl(var(--primary)/0.9)]">
            <Zap className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.24em] text-sidebar-foreground/60">
                  AIxRWA
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_14px_hsl(var(--accent)/0.8)]" />
              </div>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                Agent Console
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        {!collapsed ? (
          <div className="panel-muted mx-1 mb-3 rounded-[1.5rem] border border-sidebar-border/80 p-3 shadow-[inset_0_1px_0_hsl(var(--primary)/0.12)]">
            <p className="text-[10px] uppercase tracking-[0.24em] text-sidebar-foreground/55">
              System
            </p>
            <p className="mt-1 text-sm font-semibold leading-5 text-foreground">
              Advisory agent state, risk first.
            </p>
            <div className="mt-3 grid gap-2">
              {liveStats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center justify-between rounded-full border border-sidebar-border/70 bg-background/55 px-3 py-2 text-xs"
                >
                  <span className="text-sidebar-foreground/70">{stat.label}</span>
                  <span
                    className={
                      stat.tone === "accent"
                        ? "font-medium text-accent"
                        : stat.tone === "primary"
                          ? "font-medium text-primary"
                          : "font-medium text-sidebar-foreground"
                    }
                  >
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    className="h-11 rounded-[1rem] px-2"
                  >
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.18)]"
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && (
                        <span className="text-sm font-medium">
                          {item.title}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
