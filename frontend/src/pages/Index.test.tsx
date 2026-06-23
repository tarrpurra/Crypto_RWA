import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Index from "@/pages/Index";
import { createTestQueryClient } from "@/test/queryClient";

const navigateMock = vi.hoisted(() => vi.fn());
const walletState = vi.hoisted(() => ({
  storedWallet: "",
  connectedWalletAddress: "",
  connectedChainId: null as number | null,
  get walletAddress() {
    return this.connectedWalletAddress;
  },
  get effectiveWalletAddress() {
    return this.connectedWalletAddress;
  },
  isSupportedChain: false,
  setWalletAddress: vi.fn(),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ login: vi.fn(), logout: vi.fn(), ready: true, user: null }),
}));

vi.mock("@/hooks/usePortfolioWallet", () => ({
  usePortfolioWallet: () => walletState,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const fetchMock = vi.fn();
let settingsResponse = {
  ai_decision_maker_enabled: false,
  runtime_mode: "monitor_only",
  chain_id: 5003,
  native_mnt_enabled: true,
  sepolia_usdy_address: "0x1",
  sepolia_meth_address: "0x2",
  sepolia_meth_is_test_token: true,
  sepolia_meth_price_mode: "manual_mirror",
  sepolia_wmnt_address: "0x3",
};

let allocationResponse = {
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
};

let riskResponse = {
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
};

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
  sessionStorage.clear();
  navigateMock.mockReset();
  walletState.storedWallet = "";
  walletState.connectedWalletAddress = "";
  walletState.connectedChainId = null;
  walletState.isSupportedChain = false;
  walletState.setWalletAddress.mockReset();
  settingsResponse = {
    ai_decision_maker_enabled: false,
    runtime_mode: "monitor_only",
    chain_id: 5003,
    native_mnt_enabled: true,
    sepolia_usdy_address: "0x1",
    sepolia_meth_address: "0x2",
    sepolia_meth_is_test_token: true,
    sepolia_meth_price_mode: "manual_mirror",
    sepolia_wmnt_address: "0x3",
  };
  allocationResponse = {
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
  };
  riskResponse = {
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
  };
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith("/health")) {
      return Promise.resolve(
        jsonResponse({
          status: "ok",
          status_code: "DEGRADED",
          status_label: "DEGRADED",
          status_reason: "Monitor-only mode active",
          environment: "local",
          service: "YieldMind",
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
          portfolio_address: walletState.effectiveWalletAddress || walletState.walletAddress || null,
          chain_id: 5003,
          base_currency: "USD",
          total_value_usd: "103.266794",
          positions: [
            {
              asset_key: "MNT",
              asset_symbol: "MNT",
              asset_address: null,
              chain_id: 5003,
              balance: "103.266794",
              balance_source: "portfolio_snapshot",
              price_usd: "1",
              value_usd: "103.266794",
              weight: "1",
              target_weight: "1",
              weight_drift: "0",
              drift_status: "within_target",
              route_depth_usd: null,
              slippage_impact_bps: null,
              valuation_status: "valued",
              status_code: "DATA_FRESH",
              status_reason: "Portfolio snapshot valued successfully.",
              data_sources_used: ["portfolio"],
              metadata: {},
            },
          ],
          data_sources_used: ["portfolio"],
          status: "ok",
          status_code: "DATA_FRESH",
          status_label: "DATA_FRESH",
          status_reason: "Portfolio snapshot valued successfully.",
          metadata: {},
        }),
      );
    }

    if (url.includes("/dashboard/summary")) {
      const portfolioPayload = walletState.effectiveWalletAddress ? {
        snapshot_id: "portfolio-1",
        generated_at: "2026-05-27T00:00:00Z",
        portfolio_address: walletState.effectiveWalletAddress || walletState.walletAddress || null,
        chain_id: 5003,
        base_currency: "USD",
        total_value_usd: "103.266794",
        positions: [
          {
            asset_key: "MNT",
            asset_symbol: "MNT",
            asset_address: null,
            chain_id: 5003,
            balance: "103.266794",
            balance_source: "portfolio_snapshot",
            price_usd: "1",
            value_usd: "103.266794",
            weight: "1",
            target_weight: "1",
            weight_drift: "0",
            drift_status: "within_target",
            route_depth_usd: null,
            slippage_impact_bps: null,
            valuation_status: "valued",
            status_code: "DATA_FRESH",
            status_reason: "Portfolio snapshot valued successfully.",
            data_sources_used: ["portfolio"],
            metadata: {},
          },
        ],
        data_sources_used: ["portfolio"],
        status: "ok",
        status_code: "DATA_FRESH",
        status_label: "DATA_FRESH",
        status_reason: "Portfolio snapshot valued successfully.",
        metadata: {},
      } : null;

      return Promise.resolve(
        jsonResponse({
          portfolio: portfolioPayload,
          risk: riskResponse,
          allocation: allocationResponse,
          latest_decision: null,
          pending_proposal: null,
          alerts: [],
          freshness: {
            updated_at: "2026-05-27T00:00:00Z",
            age_seconds: 10,
            status: "fresh",
          },
          mode: "monitor_only",
          cache: {
            hit: false,
            ttl_seconds: 30,
          },
        }),
      );
    }

    if (url.includes("/risk/current")) {
      return Promise.resolve(jsonResponse(riskResponse));
    }

    if (url.includes("/allocation/recommendation")) {
      return Promise.resolve(jsonResponse(allocationResponse));
    }

    if (url.includes("/proposals") && !url.includes("/proposals/create")) {
      return Promise.resolve(
        jsonResponse({
          status: "ok",
          status_code: "DATA_FRESH",
          status_label: "DATA_FRESH",
          status_reason: "Proposal queue loaded.",
          proposals: [],
        }),
      );
    }

    if (url.includes("/proposals/create")) {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      return Promise.resolve(
        jsonResponse({
          status: "ok",
          status_code: "EXECUTION_READY",
          status_label: "EXECUTION_READY",
          status_reason: "Proposal created from AI recommendation.",
          generated_at: "2026-05-27T00:00:00Z",
          plan_id: "plan-001",
          deposit_asset_symbol: body.deposit_asset_symbol ?? "MNT",
          deposit_amount: body.deposit_amount ?? 0,
          risk_profile: body.risk_profile ?? "Balanced",
          allocation_mode: body.allocation_mode ?? "AI Suggested",
          ai_target_allocations: [],
          selected_target_allocations: [],
          warning_messages: [],
          approval_enabled: true,
          approval_blockers: [],
          guard_checks: [],
          estimated_gas_native: null,
          transaction_steps: [],
          linked_proposals: [
            {
              proposal_id: "proposal-001",
              asset_symbol: "USDY",
              action: "SELL",
              token_in_symbol: "USDY",
              token_out_symbol: "mETH",
              amount: 50,
              status_code: "EXECUTION_READY",
            },
          ],
          risk_assessment: riskResponse,
          metadata: {
            runtime_mode: "monitor_only",
            target_chain: "mantle_sepolia",
          },
        }),
      );
    }

    if (url.includes("/market/ingestion/status")) {
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

    if (url.includes("/market/price-history")) {
      return Promise.resolve(
        jsonResponse({
          status: "ok",
          status_code: "DATA_FRESH",
          status_label: "DATA_FRESH",
          status_reason: "Price history retrieved successfully.",
          asset: "mETH",
          range: "24h",
          bucket: "1h",
          points: [],
          demo: true,
        }),
      );
    }

    if (url.includes("/settings")) {
      return Promise.resolve(jsonResponse(settingsResponse));
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
  it("renders the YieldMind dashboard with wallet-required states when disconnected", async () => {
    renderPage();

    expect(screen.getByText("YieldMind")).toBeInTheDocument();
    expect(screen.getAllByText("Connect wallet").length).toBeGreaterThan(0);

  });

  it("creates a proposal when full access AI recommends rebalance", async () => {
    walletState.connectedWalletAddress = "0x1234567890abcdef1234567890abcdef12345678";
    walletState.storedWallet = walletState.connectedWalletAddress;
    walletState.connectedChainId = 5003;
    walletState.isSupportedChain = true;
    settingsResponse.ai_decision_maker_enabled = true;
    riskResponse = {
      ...riskResponse,
      recommended_action: "REBALANCE",
      risk_score: 27.5,
      risk_band: "RISK_REBALANCE_ONLY",
      confidence: 0.9,
      reasoning_summary: "Rebalance is recommended for the scoped portfolio.",
      data_sources_used: ["portfolio", "allocation"],
      hard_veto_status: "inactive",
      required_human_approval_status: "not_required",
      status: "ok",
      status_code: "DATA_FRESH",
      status_label: "DATA_FRESH",
      status_reason: "Risk engine permits rebalance.",
      freshness_status: "fresh",
    };
    allocationResponse = {
      status: "ok",
      status_code: "DATA_FRESH",
      status_label: "DATA_FRESH",
      status_reason: "Rebalance recommendation available.",
      generated_at: "2026-05-27T00:00:00Z",
      decision: {
        decision_id: "mock-002",
        wallet_or_vault: walletState.walletAddress,
        profile_name: "balanced",
        current_weights: { MNT: 1 },
        target_weights: { USDY: 0.5, mETH: 0.3, MNT: 0.2 },
        recommended_action: "REBALANCE",
        confidence: 0.9,
        reasoning: "Portfolio should be rebalanced.",
        risk_snapshot_id: null,
        status_code: "DATA_FRESH",
        created_at: "2026-05-27T00:00:00Z",
      },
      rebalance_actions: [
        {
          asset_symbol: "USDY",
          action: "SELL",
          amount: 50,
          route_id: "agni:usdy",
          token_in_symbol: "USDY",
          token_out_symbol: "mETH",
          swap_pair_label: "USDY -> mETH",
        },
      ],
    };

    renderPage();

    const createCall = fetchMock.mock.calls.find(([input, init]) => String(input).includes("/proposals/create") && init?.method === "POST");
    expect(createCall).toBeUndefined();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /review swap/i })).not.toBeInTheDocument();
  });
});
