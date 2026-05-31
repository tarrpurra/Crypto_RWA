import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Index from "@/pages/Index";
import { createTestQueryClient } from "@/test/queryClient";

vi.mock("@/hooks/usePortfolioWallet", () => ({
  usePortfolioWallet: () => ({ walletAddress: "", storedWallet: "", connectedWalletAddress: "", setWalletAddress: () => {} }),
}));

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage() {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Index />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  fetchMock.mockReset();
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
          latest_block: 123456,
          rpc_url: "https://rpc.sepolia.mantle.xyz",
          websocket_enabled: false,
          rpc_error: null,
        }),
      );
    }

    if (url.endsWith("/portfolio/current")) {
      return Promise.resolve(
        jsonResponse({
          snapshot_id: "portfolio-1",
          generated_at: "2026-05-27T00:00:00Z",
          portfolio_address: null,
          chain_id: 5003,
          base_currency: "USD",
          total_value_usd: null,
          positions: [],
          data_sources_used: [],
          status: "degraded",
          status_code: "DATA_MISSING",
          status_label: "DATA_MISSING",
          status_reason: "No portfolio wallet or executor vault address is configured for balance reads.",
          metadata: {},
        }),
      );
    }

    if (url.endsWith("/risk/current")) {
      return Promise.resolve(
        jsonResponse({
          asset: "portfolio",
          recommended_action: "PAUSE",
          risk_score: 100,
          risk_band: "RISK_VETO",
          confidence: 1,
          reasoning_summary: "Missing portfolio data activates hard veto.",
          data_sources_used: ["portfolio"],
          hard_veto_status: "active",
          required_human_approval_status: "required",
          status: "degraded",
          status_code: "DATA_MISSING",
          status_label: "DATA_MISSING",
          status_reason: "Portfolio data is missing.",
          generated_at: "2026-05-27T00:00:00Z",
          runtime_mode: "monitor_only",
          target_chain: "mantle_sepolia",
          freshness_status: "missing",
          buckets: [],
          notes: [],
          metadata: {},
        }),
      );
    }

    if (url.endsWith("/allocation/recommendation")) {
      return Promise.resolve(
        jsonResponse({
          status: "ok",
          status_code: "DATA_MISSING",
          status_label: "DATA_MISSING",
          status_reason: "Portfolio data is missing.",
          generated_at: "2026-05-27T00:00:00Z",
          decision: {
            decision_id: "mock-001",
            wallet_or_vault: "",
            profile_name: "default",
            current_weights: {},
            target_weights: {},
            recommended_action: "PAUSE",
            confidence: 1,
            reasoning: "Missing portfolio data.",
            risk_snapshot_id: null,
            status_code: "DATA_MISSING",
            created_at: "2026-05-27T00:00:00Z",
          },
          rebalance_actions: [],
        }),
      );
    }

    if (url.endsWith("/market/ingestion/status")) {
      return Promise.resolve(
        jsonResponse({
          status: "degraded",
          status_code: "DATA_PARTIAL",
          status_label: "DATA_PARTIAL",
          status_reason: "Some market-data inputs are still missing or unverified.",
          generated_at: "2026-05-27T00:00:00Z",
          assets: [],
        }),
      );
    }

    if (url.includes("/portfolio/snapshots")) {
      return Promise.resolve(
        jsonResponse({
          status: "ok",
          status_code: "OK",
          status_label: "OK",
          status_reason: "Mock snapshot data.",
          snapshots: [],
        }),
      );
    }

    return Promise.resolve(jsonResponse({}, 404));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Index", () => {
  it("renders the AIYield dashboard with live degraded states", async () => {
    renderPage();

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("AI-powered yield optimization with real-time risk management for RWA portfolios.")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("monitor_only")).toBeInTheDocument();
      expect(screen.getAllByText("DATA_MISSING").length).toBeGreaterThan(0);
      expect(screen.getAllByText("RISK_VETO / 100").length).toBeGreaterThan(0);
    });
  });
});
