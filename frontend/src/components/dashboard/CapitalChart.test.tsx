import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CapitalChart, formatCapitalAxisDate } from "@/components/dashboard/CapitalChart";
import type { PriceHistoryPoint } from "@/lib/api/types";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  };
});

const points: Record<string, PriceHistoryPoint[]> = {
  mETH: [
    { time: "2026-06-10T00:00:00Z", open: 2300, high: 2320, low: 2290, close: 2310, avg: 2305, samples: 60 },
    { time: "2026-06-11T00:00:00Z", open: 2310, high: 2520, low: 2305, close: 2520, avg: 2410, samples: 60 },
  ],
  USDY: [
    { time: "2026-06-10T00:00:00Z", open: 1.04, high: 1.06, low: 1.04, close: 1.05, avg: 1.05, samples: 60 },
    { time: "2026-06-11T00:00:00Z", open: 1.05, high: 1.07, low: 1.05, close: 1.06, avg: 1.06, samples: 60 },
  ],
  WMNT: [
    { time: "2026-06-10T00:00:00Z", open: 0.90, high: 0.95, low: 0.89, close: 0.93, avg: 0.92, samples: 60 },
    { time: "2026-06-11T00:00:00Z", open: 0.93, high: 0.96, low: 0.92, close: 0.95, avg: 0.94, samples: 60 },
  ],
};

const defaultProps = {
  points,
  isLoading: false,
  isDemo: false,
  availableAssets: ["mETH", "USDY", "WMNT"],
  range: "24h",
  bucket: "1h",
  onRangeChange: vi.fn(),
  onBucketChange: vi.fn(),
};

describe("CapitalChart", () => {
  it("shows a series switcher and defaults to first token", () => {
    render(<CapitalChart {...defaultProps} />);

    expect(screen.getByRole("button", { name: "mETH" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("mETH price history")).toBeInTheDocument();
    expect(screen.getByText("$2,410")).toBeInTheDocument();
  });

  it("switches the headline and current value when a token is selected", () => {
    render(<CapitalChart {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "USDY" }));

    expect(screen.getByRole("button", { name: "USDY" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("USDY price history")).toBeInTheDocument();
    expect(screen.getByText("$1.06")).toBeInTheDocument();
    expect(screen.getByText("Current USDY price")).toBeInTheDocument();
  });

  it("renders range and bucket controls", () => {
    render(<CapitalChart {...defaultProps} />);

    expect(screen.getByText("24H")).toBeInTheDocument();
    expect(screen.getByText("1H")).toBeInTheDocument();
    expect(screen.getByText("6H")).toBeInTheDocument();
    expect(screen.getByText("7D")).toBeInTheDocument();
  });

  it("shows demo label when isDemo is true", () => {
    render(<CapitalChart {...defaultProps} isDemo={true} />);

    expect(screen.getByText(/demo/)).toBeInTheDocument();
  });

  it("formats intraday axis labels as time for hourly charts", () => {
    expect(formatCapitalAxisDate(Date.parse("2026-06-14T13:30:00Z"), "24h")).toMatch(/1:30\s*PM|13:30/);
    expect(formatCapitalAxisDate(Date.parse("2026-06-14T13:30:00Z"), "1h")).toMatch(/1:30\s*PM|13:30/);
  });

  it("includes the date when the range spans multiple days", () => {
    const label = formatCapitalAxisDate(Date.parse("2026-06-15T13:30:00Z"), "7d");
    expect(label).toMatch(/Jun\s+15/i);
    expect(label).toMatch(/1:30\s*PM|13:30/);
  });
});
