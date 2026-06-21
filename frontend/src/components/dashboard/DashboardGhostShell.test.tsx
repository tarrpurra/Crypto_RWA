import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardGhostShell } from "@/components/dashboard/DashboardGhostShell";

describe("DashboardGhostShell", () => {
  it("renders the connected-wallet backend warmup state", () => {
    render(<DashboardGhostShell />);

    expect(screen.getByLabelText("Dashboard loading state")).toBeInTheDocument();
    expect(screen.getByText("Wallet connected")).toBeInTheDocument();
    expect(screen.getByText("Backend warming up")).toBeInTheDocument();
    expect(screen.getByText(/Syncing wallet balances, vault state, and market inputs/i)).toBeInTheDocument();
  });
});
