import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { createTestQueryClient } from "@/test/queryClient";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderSidebar() {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppSidebar", () => {
  it("shows API and chain readiness for the AIYield terminal", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return Promise.resolve(
          jsonResponse({
            status: "ok",
            status_code: "DEGRADED",
            status_label: "DEGRADED",
            status_reason: "Monitor-only mode active",
            environment: "local",
            service: "AIYield",
            runtime_mode: "monitor_only",
            target_chain: "mantle_sepolia",
          }),
        );
      }
      if (url.endsWith("/chain/status")) {
        return Promise.resolve(
          jsonResponse({
            status: "ok",
            status_code: "DATA_FRESH",
            status_label: "DATA_FRESH",
            status_reason: "Chain RPC responded with a fresh sample.",
            chain_id: 5003,
            latest_block: 123,
            rpc_url: "http://rpc",
            websocket_enabled: false,
            rpc_error: null,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });

    renderSidebar();

    await waitFor(() => {
      expect(screen.getByText("Chain")).toBeInTheDocument();
      expect(screen.getByText("Ready")).toBeInTheDocument();
      expect(screen.getByText("Online")).toBeInTheDocument();
      expect(screen.getByText("Advisory")).toBeInTheDocument();
    });
  });
});
