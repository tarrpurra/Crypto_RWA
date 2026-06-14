import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { TopBar } from "@/components/layout/TopBar";
import { createTestQueryClient } from "@/test/queryClient";

vi.mock("@/components/auth/LoginButton", () => ({
  LoginButton: () => <div>Connect Wallet</div>,
}));

function renderTopBar(pathname = "/risk") {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[pathname]}>
        <TopBar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TopBar", () => {
  it("renders the YieldMind navigation items", () => {
    renderTopBar();

    expect(screen.getByText("YieldMind")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Risk")).toBeInTheDocument();
    expect(screen.getByText("Decision Log")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-nav")).toBeInTheDocument();
  });
});
