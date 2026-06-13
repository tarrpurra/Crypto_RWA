import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CapitalChart } from "@/components/dashboard/CapitalChart";
import type { PortfolioSnapshotResponse } from "@/lib/api/types";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");

  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  };
});

const snapshots: PortfolioSnapshotResponse[] = [
  {
    status: "ok",
    status_code: "DATA_FRESH",
    status_label: "DATA_FRESH",
    status_reason: "ok",
    snapshot_id: "1",
    generated_at: "2026-06-10T00:00:00Z",
    portfolio_address: "0x1",
    chain_id: 5003,
    base_currency: "USD",
    total_value_usd: "950.00",
    positions: [
      {
        asset_key: "USDY",
        asset_symbol: "USDY",
        asset_address: "0xusdy",
        chain_id: 5003,
        balance: "500",
        balance_source: "portfolio_snapshot",
        price_usd: "1.05",
        value_usd: "525.00",
        weight: "0.55",
        target_weight: "0.50",
        weight_drift: "0.05",
        drift_status: "within_target",
        valuation_status: "valued",
        status_code: "DATA_FRESH",
        status_reason: "ok",
        data_sources_used: ["portfolio"],
      },
      {
        asset_key: "mETH",
        asset_symbol: "mETH",
        asset_address: "0xmeth",
        chain_id: 5003,
        balance: "0.2",
        balance_source: "portfolio_snapshot",
        price_usd: "2320",
        value_usd: "464.00",
        weight: "0.45",
        target_weight: "0.50",
        weight_drift: "-0.05",
        drift_status: "within_target",
        valuation_status: "valued",
        status_code: "DATA_FRESH",
        status_reason: "ok",
        data_sources_used: ["portfolio"],
      },
    ],
    data_sources_used: ["portfolio"],
    metadata: {},
  },
  {
    status: "ok",
    status_code: "DATA_FRESH",
    status_label: "DATA_FRESH",
    status_reason: "ok",
    snapshot_id: "2",
    generated_at: "2026-06-11T00:00:00Z",
    portfolio_address: "0x1",
    chain_id: 5003,
    base_currency: "USD",
    total_value_usd: "1160.00",
    positions: [
      {
        asset_key: "USDY",
        asset_symbol: "USDY",
        asset_address: "0xusdy",
        chain_id: 5003,
        balance: "500",
        balance_source: "portfolio_snapshot",
        price_usd: "1.06",
        value_usd: "530.00",
        weight: "0.46",
        target_weight: "0.50",
        weight_drift: "-0.04",
        drift_status: "within_target",
        valuation_status: "valued",
        status_code: "DATA_FRESH",
        status_reason: "ok",
        data_sources_used: ["portfolio"],
      },
      {
        asset_key: "mETH",
        asset_symbol: "mETH",
        asset_address: "0xmeth",
        chain_id: 5003,
        balance: "0.25",
        balance_source: "portfolio_snapshot",
        price_usd: "2520",
        value_usd: "630.00",
        weight: "0.54",
        target_weight: "0.50",
        weight_drift: "0.04",
        drift_status: "within_target",
        valuation_status: "valued",
        status_code: "DATA_FRESH",
        status_reason: "ok",
        data_sources_used: ["portfolio"],
      },
      {
        asset_key: "WMNT",
        asset_symbol: "WMNT",
        asset_address: "0xwmnt",
        chain_id: 5003,
        balance: "10",
        balance_source: "portfolio_snapshot",
        price_usd: "0.95",
        value_usd: "9.50",
        weight: "0.01",
        target_weight: "0",
        weight_drift: "0.01",
        drift_status: "within_target",
        valuation_status: "valued",
        status_code: "DATA_FRESH",
        status_reason: "ok",
        data_sources_used: ["portfolio"],
      },
    ],
    data_sources_used: ["portfolio"],
    metadata: {},
  },
];

describe("CapitalChart", () => {
  it("shows a series switcher and defaults to portfolio view", () => {
    render(<CapitalChart snapshots={snapshots} isLoading={false} />);

    expect(screen.getByRole("button", { name: "mETH" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "mETH" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "USDY" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "WMNT" })).toBeInTheDocument();
    expect(screen.getByText("mETH price history")).toBeInTheDocument();
    expect(screen.getByText("$2,520")).toBeInTheDocument();
  });

  it("switches the headline and current value when a token is selected", () => {
    render(<CapitalChart snapshots={snapshots} isLoading={false} />);

    fireEvent.click(screen.getByRole("button", { name: "USDY" }));

    expect(screen.getByRole("button", { name: "USDY" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("USDY price history")).toBeInTheDocument();
    expect(screen.getByText("$1.06")).toBeInTheDocument();
    expect(screen.getByText("Current USDY price")).toBeInTheDocument();
  });
});
