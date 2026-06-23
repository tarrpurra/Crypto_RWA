import { QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DecisionLog from "@/pages/DecisionLog";
import { createTestQueryClient } from "@/test/queryClient";

const allocationState = vi.hoisted(() => ({
  response: {
    status: "ok",
    status_code: "RISK_NORMAL",
    generated_at: "2026-06-15T00:00:00Z",
    decision: {
      decision_id: "decision-001",
      wallet_or_vault: "0xvault",
      profile_name: "Balanced",
      current_weights: { WMNT: 1 },
      target_weights: { USDY: 0.7, mETH: 0.15, WMNT: 0.15 },
      recommended_action: "HOLD",
      confidence: 0.95,
      reasoning: "No rebalance needed.",
      risk_snapshot_id: "risk-001",
      status_code: "DATA_FRESH",
      created_at: "2026-06-15T00:00:00Z",
    },
    rebalance_actions: [],
  },
}));

const walletState = vi.hoisted(() => ({
  connectedWalletAddress: "",
  get walletAddress() {
    return this.connectedWalletAddress;
  },
  get effectiveWalletAddress() {
    return this.connectedWalletAddress;
  },
  isSupportedChain: true,
}));

const swapState = vi.hoisted(() => ({
  appendEntry: vi.fn(),
}));

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/rwa/PageScaffold", () => ({
  PageScaffold: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/swap/RiskDetailsModal", () => ({
  RiskDetailsModal: () => null,
}));

vi.mock("@/components/swap/SwapDetailCard", () => ({
  SwapDetailCard: () => null,
}));

vi.mock("@/components/swap/TransactionStatus", () => ({
  TransactionStatus: () => null,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => <div />,
}));

vi.mock("@/hooks/usePortfolioWallet", () => ({
  usePortfolioWallet: () => walletState,
}));

vi.mock("@/hooks/useInvestmentScope", () => ({
  useInvestmentScope: () => ({
    scope: {
      depositAssetSymbol: "MNT",
      depositAmount: 50,
      riskProfile: "Balanced",
      allocationMode: "AI Suggested",
      chainId: 5003,
    },
    setScope: vi.fn(),
    clearScope: vi.fn(),
    hasScope: true,
  }),
}));

vi.mock("@/hooks/usePortfolio", () => ({
  useCurrentPortfolio: () => ({
    data: {
      snapshot_id: "portfolio-1",
      generated_at: "2026-06-15T00:00:00Z",
      portfolio_address: walletState.connectedWalletAddress,
      chain_id: 5003,
      base_currency: "USD",
      total_value_usd: "50",
      positions: [],
      data_sources_used: ["portfolio"],
      status: "ok",
      status_code: "DATA_FRESH",
      status_label: "DATA_FRESH",
      status_reason: "Portfolio loaded.",
      metadata: {},
    },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useAllocation", () => ({
  useAllocationRecommendation: () => ({
    data: allocationState.response,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useRisk", () => ({
  useCurrentRisk: () => ({
    data: {
      asset: "portfolio",
      recommended_action: "HOLD",
      risk_score: 12,
      risk_band: "RISK_NORMAL",
      confidence: 0.95,
      reasoning_summary: "Recommendation is safe to review.",
      data_sources_used: ["portfolio"],
      hard_veto_status: "inactive",
      required_human_approval_status: "required",
      status: "ok",
      status_code: "DATA_FRESH",
      status_label: "DATA_FRESH",
      status_reason: "Risk OK.",
      generated_at: "2026-06-15T00:00:00Z",
      runtime_mode: "recommendation",
      target_chain: "mantle_sepolia",
      freshness_status: "fresh",
      buckets: [],
      notes: [],
      metadata: {},
    },
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useDecisions", () => ({
  useDecisions: () => ({
    data: {
      asset: "portfolio",
      recommended_action: "HOLD",
      risk_score: 12,
      confidence: 0.95,
      reasoning_summary: "Recommendation is safe to review.",
      data_sources_used: ["portfolio"],
      hard_veto_status: "inactive",
      required_human_approval_status: "required",
      status: "ok",
      status_code: "DATA_FRESH",
      status_label: "DATA_FRESH",
      status_reason: "Recommendation ready.",
      runtime_mode: "recommendation",
      target_chain: "mantle_sepolia",
      freshness_status: "fresh",
      constraints_applied: [],
      notes: [],
      ai_debug: {
        prompt: "",
        raw_response: null,
        parsed_response: {},
        mode: "rules",
        used_fallback: true,
        ai_overrode_deterministic: false,
        fallback_reason: null,
      },
      metadata: {},
    },
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useMarket", () => ({
  useMarketIngestionStatus: () => ({ data: { assets: [] }, isLoading: false }),
  useLatestPrices: () => ({ data: { prices: [] }, isLoading: false }),
  useLatestQuotes: () => ({ data: { quotes: [] }, isLoading: false }),
  useMarketRoutes: () => ({ data: { routes: [] }, isLoading: false }),
}));

vi.mock("@/hooks/useStrategy", () => ({
  useStrategyActive: () => ({ data: { active_version: null } }),
}));

vi.mock("@/hooks/useSwap", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useSwap")>("@/hooks/useSwap");
  return {
    ...actual,
    useApproveProposal: () => ({ isPending: false, mutateAsync: vi.fn() }),
    useProposalDetail: () => ({ data: null, isLoading: false, refetch: vi.fn() }),
    useProposals: () => ({
      data: {
        proposals: [],
        status: "ok",
        status_code: "DATA_FRESH",
        status_label: "DATA_FRESH",
        status_reason: "Proposal queue loaded.",
      },
      isLoading: false,
      refetch: vi.fn(),
    }),
    useRejectProposal: () => ({ isPending: false, mutate: vi.fn() }),
  };
});

vi.mock("@/hooks/useSystem", () => ({
  useSettings: () => ({
    data: {
      ai_decision_maker_enabled: false,
      runtime_mode: "monitor_only",
      chain_id: 5003,
      native_mnt_enabled: true,
      sepolia_usdy_address: "0x1",
      sepolia_meth_address: "0x2",
      sepolia_meth_is_test_token: true,
      sepolia_meth_price_mode: "manual_mirror",
      sepolia_wmnt_address: "0x3",
    },
  }),
  useSystemReadiness: () => ({ data: { tokens: {} } }),
}));

vi.mock("@/hooks/useVault", () => ({
  useVaultBalance: () => ({
    data: {
      status: "ok",
      status_code: "DATA_FRESH",
      status_label: "DATA_FRESH",
      status_reason: "Vault balances loaded.",
      vault_address: "0xvault",
      vault_label: "AIxRWA Portfolio Vault",
      user_address: walletState.effectiveWalletAddress,
      total_value_usd: "50",
      balances: [
        {
          asset_symbol: "MNT",
          asset_address: "0x0000000000000000000000000000000000000000",
          balance: "50",
          value_usd: "50",
          share: 1,
        },
      ],
      pending_deposits: 0,
      pending_withdrawals: 0,
      generated_at: "2026-06-15T00:00:00Z",
      metadata: {},
    },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useProposalActivity", () => ({
  useProposalActivity: () => ({
    appendEntry: swapState.appendEntry,
    getEntriesForProposal: () => [],
  }),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: true }),
  useBalance: () => ({ data: { formatted: "50" } }),
}));

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
      <MemoryRouter initialEntries={["/decision-log?review=1&asset=MNT&amount=50&risk=Balanced"]}>
        <DecisionLog />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderPageAt(route: string) {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <DecisionLog />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  swapState.appendEntry.mockReset();
  walletState.connectedWalletAddress = "0x1234567890abcdef1234567890abcdef12345678";
  allocationState.response = {
    status: "ok",
    status_code: "RISK_NORMAL",
    generated_at: "2026-06-15T00:00:00Z",
    decision: {
      decision_id: "decision-001",
      wallet_or_vault: "0xvault",
      profile_name: "Balanced",
      current_weights: { WMNT: 1 },
      target_weights: { USDY: 0.7, mETH: 0.15, WMNT: 0.15 },
      recommended_action: "HOLD",
      confidence: 0.95,
      reasoning: "No rebalance needed.",
      risk_snapshot_id: "risk-001",
      status_code: "DATA_FRESH",
      created_at: "2026-06-15T00:00:00Z",
    },
    rebalance_actions: [],
  };
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.includes("/proposals/create")) {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      return Promise.resolve(
        jsonResponse({
          status: "ok",
          status_code: "EXECUTION_READY",
          status_label: "EXECUTION_READY",
          status_reason: "Proposal created from vault-backed recommendation.",
          generated_at: "2026-06-15T00:00:00Z",
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
              asset_symbol: "MNT",
              action: "BUY",
              token_in_symbol: "WMNT",
              token_out_symbol: "USDY",
              amount: 49,
              status_code: "PROPOSAL_PENDING_APPROVAL",
            },
          ],
          risk_assessment: {
            asset: "portfolio",
            recommended_action: "HOLD",
            risk_score: 12,
            risk_band: "RISK_NORMAL",
            confidence: 0.95,
            reasoning_summary: "Recommendation is safe to review.",
            data_sources_used: ["portfolio"],
            hard_veto_status: "inactive",
            required_human_approval_status: "required",
            status: "ok",
            status_code: "DATA_FRESH",
            status_label: "DATA_FRESH",
            status_reason: "Risk OK.",
            generated_at: "2026-06-15T00:00:00Z",
            runtime_mode: "recommendation",
            target_chain: "mantle_sepolia",
            freshness_status: "fresh",
            buckets: [],
            notes: [],
            metadata: {},
          },
          metadata: {
            runtime_mode: "recommendation",
            target_chain: "mantle_sepolia",
          },
        }),
      );
    }

    return Promise.resolve(jsonResponse({}, 404));
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

describe("DecisionLog", () => {
  it("creates an approval-ready proposal from the recommendation flow", async () => {
    renderPage();

    await new Promise((resolve) => setTimeout(resolve, 0));

    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).includes("/proposals/create") && init?.method === "POST",
    );

    expect(createCall).toBeDefined();
    const [, init] = createCall as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      wallet_address: walletState.walletAddress,
      deposit_asset_symbol: "MNT",
      deposit_amount: 49,
      risk_profile: "Balanced",
      allocation_mode: "AI Suggested",
    });
  });

  it("creates a proposal from a scoped rebalance recommendation without review query params", async () => {
    allocationState.response = {
      status: "ok",
      status_code: "RISK_NORMAL",
      generated_at: "2026-06-15T00:00:00Z",
      decision: {
        decision_id: "decision-002",
        wallet_or_vault: "0xvault",
        profile_name: "Balanced",
        current_weights: { WMNT: 1 },
        target_weights: { USDY: 0.7, mETH: 0.15, WMNT: 0.15 },
        recommended_action: "REBALANCE",
        confidence: 0.92,
        reasoning: "Reduce WMNT concentration.",
        risk_snapshot_id: "risk-002",
        status_code: "DATA_FRESH",
        created_at: "2026-06-15T00:00:00Z",
      },
      rebalance_actions: [
        {
          asset_symbol: "WMNT",
          action: "SELL",
          amount: 49,
          route_id: "route-001",
          token_in_symbol: "WMNT",
          token_out_symbol: "USDY",
          swap_pair_label: "WMNT -> USDY",
        },
      ],
    };

    renderPageAt("/decision-log");

    await new Promise((resolve) => setTimeout(resolve, 0));

    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).includes("/proposals/create") && init?.method === "POST",
    );

    expect(createCall).toBeDefined();
  });
});
