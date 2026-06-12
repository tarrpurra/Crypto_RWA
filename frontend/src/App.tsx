import { useEffect, type ReactNode } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { ThemeProvider, useTheme } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { wagmiConfig } from "@/lib/wagmi";
import { logger } from "@/lib/logger";
import Landing from "./pages/Landing";
import Index from "./pages/Index";
import RiskCenter from "./pages/RiskCenter";
import Trade from "./pages/Trade";
import AllocationStudio from "./pages/AllocationStudio";
import ApprovalsPage from "./pages/ApprovalsPage";
import StrategyStudio from "./pages/StrategyStudio";
import SettingsPage from "./pages/SettingsPage";
import SimplexDemo from "./pages/SimplexDemo";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
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

function RainbowKitThemeWrapper({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  return (
    <RainbowKitProvider
      theme={resolvedTheme === "light" ? lightTheme() : darkTheme()}
    >
      {children}
    </RainbowKitProvider>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitThemeWrapper>
          <TooltipProvider>
            <AuthProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <RouteChangeLogger />
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/dashboard" element={<DashboardLayout><Index /></DashboardLayout>} />
                  <Route path="/risk" element={<DashboardLayout><RiskCenter /></DashboardLayout>} />
                  <Route path="/allocation" element={<DashboardLayout><AllocationStudio /></DashboardLayout>} />
                  <Route path="/trade" element={<DashboardLayout><Trade /></DashboardLayout>} />
                  <Route path="/approvals" element={<DashboardLayout><ApprovalsPage /></DashboardLayout>} />
                  <Route path="/strategy-lab" element={<DashboardLayout><StrategyStudio /></DashboardLayout>} />
                  <Route path="/settings" element={<DashboardLayout><SettingsPage /></DashboardLayout>} />
                  <Route path="/simplex" element={<SimplexDemo />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </AuthProvider>
          </TooltipProvider>
        </RainbowKitThemeWrapper>
      </QueryClientProvider>
    </WagmiProvider>
  </ThemeProvider>
);

export default App;
