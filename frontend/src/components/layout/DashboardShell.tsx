import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { ThemeProvider, useTheme } from "next-themes";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { wagmiConfig } from "@/lib/wagmi";

function RainbowKitThemeWrapper({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const theme =
    resolvedTheme === "light"
      ? lightTheme({
          accentColor: "#D4962A",
          accentColorForeground: "#FFFBF5",
          borderRadius: "small",
          overlayBlur: "small",
        })
      : darkTheme({
          accentColor: "#D4962A",
          accentColorForeground: "#150F07",
          borderRadius: "small",
          overlayBlur: "small",
        });
  return <RainbowKitProvider theme={theme}>{children}</RainbowKitProvider>;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <WagmiProvider config={wagmiConfig}>
        <RainbowKitThemeWrapper>
          <AuthProvider>{children}</AuthProvider>
        </RainbowKitThemeWrapper>
      </WagmiProvider>
    </ThemeProvider>
  );
}
