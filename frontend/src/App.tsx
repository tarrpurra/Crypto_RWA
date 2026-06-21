import { lazy, Suspense, useEffect } from "react";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { logger } from "@/lib/logger";

const Landing = lazy(() => import("./pages/Landing"));
const Index = lazy(() => import("./pages/Index"));
const RiskCenter = lazy(() => import("./pages/RiskCenter"));
const DecisionLog = lazy(() => import("./pages/DecisionLog"));
const StrategyStudio = lazy(() => import("./pages/StrategyStudio"));
const SimplexDemo = lazy(() => import("./pages/SimplexDemo"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DashboardShell = lazy(() =>
  import("@/components/layout/DashboardShell").then((module) => ({ default: module.DashboardShell })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

function RouteChangeLogger() {
  const location = useLocation();

  useEffect(() => {
    logger.info("route.change", {
      pathname: location.pathname,
      search: location.search,
    });
  }, [location.pathname, location.search]);

  return null;
}

function AppFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="rounded-xl border border-border/60 bg-card px-5 py-4 shadow-sm">
        <p className="text-sm font-medium">Loading AIxRWA</p>
        <p className="mt-1 text-sm text-muted-foreground">Preparing the interface.</p>
      </div>
    </div>
  );
}

function withDashboardLayout(element: ReactNode) {
  return (
    <DashboardShell>
      <DashboardLayout>{element}</DashboardLayout>
    </DashboardShell>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <RouteChangeLogger />
          <Suspense fallback={<AppFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/dashboard" element={withDashboardLayout(<Index />)} />
              <Route path="/risk" element={withDashboardLayout(<RiskCenter />)} />
              <Route path="/decision-log" element={withDashboardLayout(<DecisionLog />)} />
              <Route path="/allocation" element={<Navigate to="/strategy-lab" replace />} />
              <Route path="/trade" element={<Navigate to="/decision-log" replace />} />
              <Route path="/approvals" element={<Navigate to="/decision-log" replace />} />
              <Route path="/ai-command" element={<Navigate to="/dashboard" replace />} />
              <Route path="/strategy-lab" element={withDashboardLayout(<StrategyStudio />)} />
              <Route path="/simplex" element={<SimplexDemo />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
