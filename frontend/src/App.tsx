import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { logger } from "@/lib/logger";
import Index from "./pages/Index";
import Portfolio from "./pages/Portfolio";
import RiskCenter from "./pages/RiskCenter";
import AllocationStudio from "./pages/AllocationStudio";
import MarketData from "./pages/MarketData";
import Approvals from "./pages/Approvals";
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <RouteChangeLogger />
          <DashboardLayout>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/risk" element={<RiskCenter />} />
              <Route path="/allocation" element={<AllocationStudio />} />
              <Route path="/market" element={<MarketData />} />
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </DashboardLayout>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
