import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ApprovalsPage from "@/pages/ApprovalsPage";

const approvalsState = vi.hoisted(() => ({
  proposals: [] as Array<{
    proposal_id: string;
    token_in: string;
    token_out: string;
    max_amount_in: string;
    min_amount_out: string;
    status_code: string;
    created_at: string;
    router?: string;
    selector?: string;
    deadline?: number;
    native_value?: string;
  }>,
  settings: {
    ai_decision_maker_enabled: true,
    chain_id: 5003,
    native_mnt_enabled: true,
    sepolia_usdy_address: null as string | null,
    sepolia_meth_address: null as string | null,
    sepolia_meth_is_test_token: false,
    sepolia_meth_price_mode: "manual_mirror",
    sepolia_wmnt_address: null as string | null,
  },
  readiness: {
    tokens: {} as Record<string, { address: string | null; code_exists: boolean; symbol: string | null; symbol_ok: boolean; decimals: number | null; deposit_supported: boolean | null; test_token: boolean | null }>,
  },
}));

vi.mock("@/components/rwa/PageScaffold", () => ({
  MetricPanel: ({ label, value, detail }: { label: string; value: string; detail?: string }) => (
    <div>
      <span>{label}</span>
      <span>{value}</span>
      {detail ? <span>{detail}</span> : null}
    </div>
  ),
  PageScaffold: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  toneFromStatus: () => "neutral",
}));

vi.mock("@/components/swap/RiskDetailsModal", () => ({
  RiskDetailsModal: () => null,
}));

vi.mock("@/components/swap/TransactionStatus", () => ({
  TransactionStatus: () => null,
}));

vi.mock("@/hooks/useRisk", () => ({
  useCurrentRisk: () => ({ data: null }),
}));

vi.mock("@/hooks/useProposalActivity", () => ({
  useProposalActivity: () => ({
    appendEntry: vi.fn(),
    getEntriesForProposal: () => [],
  }),
}));

vi.mock("@/hooks/useSwap", () => ({
  useApproveProposal: () => ({ isPending: false, mutate: vi.fn() }),
  useExecuteProposal: () => ({ isPending: false, mutate: vi.fn() }),
  useProposalDetail: () => ({ data: null, isLoading: false }),
  useProposals: () => ({
    data: {
      proposals: approvalsState.proposals,
      status: "ok",
      status_code: "DATA_FRESH",
      status_label: "DATA_FRESH",
      status_reason: "Trade proposal queue loaded.",
    },
    isLoading: false,
  }),
  useRejectProposal: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("@/hooks/useSystem", () => ({
  useSettings: () => ({ data: approvalsState.settings }),
  useSystemReadiness: () => ({ data: approvalsState.readiness }),
}));

beforeEach(() => {
  approvalsState.proposals = [
    {
      proposal_id: "proposal-001",
      token_in: "0x67A1f4A939b477A6b7c5BF94D97E45dE87E608eF",
      token_out: "0x0931F3Eece8483A0BbbA8b13d1007cAB15a07C1a",
      max_amount_in: "51175000000000000000",
      min_amount_out: "5049000000000000000",
      status_code: "PROPOSAL_PENDING_APPROVAL",
      created_at: "2026-06-07T14:52:50.000Z",
      router: "0xrouter",
      selector: "0x12345678",
      deadline: 1770000000,
      native_value: "0",
    },
  ];
  approvalsState.settings = {
    ai_decision_maker_enabled: true,
    chain_id: 5003,
    native_mnt_enabled: true,
    sepolia_usdy_address: null,
    sepolia_meth_address: null,
    sepolia_meth_is_test_token: false,
    sepolia_meth_price_mode: "manual_mirror",
    sepolia_wmnt_address: null,
  };
  approvalsState.readiness = {
    tokens: {
      WMNT: {
        address: "0x67A1f4A939b477A6b7c5BF94D97E45dE87E608eF",
        code_exists: true,
        symbol: "WMNT",
        symbol_ok: true,
        decimals: 18,
        deposit_supported: true,
        test_token: false,
      },
      USDY: {
        address: "0x0931F3Eece8483A0BbbA8b13d1007cAB15a07C1a",
        code_exists: true,
        symbol: "USDY",
        symbol_ok: true,
        decimals: 18,
        deposit_supported: true,
        test_token: false,
      },
    },
  };
});

describe("ApprovalsPage", () => {
  it("shows human-readable token labels and keeps the AI note scoped to the queue", () => {
    render(<ApprovalsPage />);

    expect(screen.getByText(/Swap WMNT/i)).toHaveTextContent("Swap WMNT USDY");
    expect(screen.getByText(/51\.175 WMNT/)).toBeInTheDocument();
    expect(screen.getByText(/5\.049 USDY/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /review/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Full access AI is handling approval and execution automatically/i)).toHaveLength(1);
  });
});
