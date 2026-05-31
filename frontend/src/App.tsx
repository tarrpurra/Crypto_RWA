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
import Index from "./pages/Index";
import RiskCenter from "./pages/RiskCenter";
import Trade from "./pages/Trade";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
          <DashboardLayout>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/risk" element={<RiskCenter />} />
              <Route path="/trade" element={<Trade />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </DashboardLayout>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
    </RainbowKitThemeWrapper>
  </QueryClientProvider>
  </WagmiProvider>
  </ThemeProvider>
);

export default App;
