import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DepositModal } from "@/components/dashboard/DepositModal";
import { createTestQueryClient } from "@/test/queryClient";

vi.mock("wagmi", () => ({
  usePublicClient: () => ({ waitForTransactionReceipt: vi.fn() }),
  useWriteContract: () => ({ writeContractAsync: vi.fn() }),
  useChainId: () => 5003,
}));

vi.mock("@/hooks/useSwap", () => ({
  useWrapMnt: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/lib/api/vault", () => ({
  vaultApi: {
    depositPrepare: vi.fn(),
    recordFlow: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const walletData = {
  status: "ok",
  status_code: "DATA_FRESH",
  status_label: "DATA_FRESH",
  status_reason: "Wallet snapshot",
  vault_address: "0x1111111111111111111111111111111111111111",
  vault_label: "Wallet",
  user_address: "0x2222222222222222222222222222222222222222",
  total_value_usd: "10",
  balances: [
    {
      asset_symbol: "USDY",
      asset_address: "0x3333333333333333333333333333333333333333",
      balance: "10",
      value_usd: "10",
      share: 1,
    },
  ],
  pending_deposits: 0,
  pending_withdrawals: 0,
};

describe("DepositModal render", () => {
  it("renders without throwing when open", () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <DepositModal
          open
          onClose={vi.fn()}
          walletData={walletData as never}
          vaultAddress="0x4444444444444444444444444444444444444444"
          nativeMntEnabled={false}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByText("Deposit into AIxRWA Portfolio Vault"),
    ).toBeInTheDocument();
  });
});
