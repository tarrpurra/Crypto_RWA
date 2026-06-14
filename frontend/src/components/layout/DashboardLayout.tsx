import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";
import { ProposalNotification } from "@/components/dashboard/ProposalNotification";
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
          useDocumentScroll ? "min-h-screen overflow-visible" : "h-screen overflow-hidden",
        )}
      >
        <ProposalNotification />
        <RenderBoundary
          title="Top bar failed to render"
          description="The shell chrome hit a runtime error. Reload after checking the browser console."
        >
          <TopBar />
        </RenderBoundary>
        <main
          className={cn(
            "relative z-10 min-w-0 scrollbar-thin",
            useDocumentScroll
              ? "overflow-visible"
              : "h-[calc(100vh-3rem)] overflow-y-auto overflow-x-hidden pb-16",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 w-full flex-col",
              useDocumentScroll ? "min-h-full pb-4" : "min-h-full",
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
