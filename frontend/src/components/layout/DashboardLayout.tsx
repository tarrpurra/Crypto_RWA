import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";
import { RenderBoundary } from "./RenderBoundary";
import { TopBar } from "./TopBar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const useDocumentScroll = location.pathname === "/";

  return (
    <div
      className={cn(
        "flex w-full bg-background text-foreground",
        useDocumentScroll
          ? "min-h-screen overflow-visible"
          : "h-screen overflow-hidden",
      )}
    >
      <div
        className={cn(
          "shell-backdrop relative flex min-w-0 w-full flex-1 flex-col",
          useDocumentScroll ? "min-h-screen overflow-visible" : "overflow-hidden",
        )}
      >
        <RenderBoundary
          title="Top bar failed to render"
          description="The shell chrome hit a runtime error. Reload after checking the browser console."
        >
          <TopBar />
        </RenderBoundary>
        <main
          className={cn(
            "relative z-10 flex min-w-0 flex-1 scrollbar-thin",
            useDocumentScroll
              ? "overflow-visible"
              : "min-h-0 overflow-y-auto overflow-x-hidden",
          )}
        >
          <div
            className={cn(
              "flex min-h-0 min-w-0 w-full flex-1 flex-col",
              useDocumentScroll ? "pb-4" : "",
            )}
          >
            <RenderBoundary
              title="Page content failed to render"
              description="One of the route components threw during render, so this fallback is shown instead of a blank screen."
            >
              {children}
            </RenderBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
