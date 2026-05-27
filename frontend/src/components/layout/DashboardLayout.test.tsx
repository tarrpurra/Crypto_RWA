import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { DashboardLayout } from "@/components/layout/DashboardLayout";

vi.mock("@/components/layout/TopBar", () => ({
  TopBar: () => <div>Top bar</div>,
}));

describe("DashboardLayout", () => {
  it("keeps the shell fixed to the viewport and allows route-level scrolling", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <DashboardLayout>
          <div>Overview body</div>
        </DashboardLayout>
      </MemoryRouter>,
    );

    const root = container.firstElementChild;
    const shell = root?.firstElementChild;
    const main = screen.getByRole("main");

    expect(root).toHaveClass("w-full", "min-h-screen", "overflow-visible");
    expect(shell).toHaveClass("w-full", "flex-1");
    expect(main).toHaveClass("flex", "min-w-0", "flex-1", "overflow-visible");
    expect(screen.getByText("Overview body")).toBeInTheDocument();
  });

  it("uses fixed shell scrolling for non-dashboard routes", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/portfolio"]}>
        <DashboardLayout>
          <div>Portfolio body</div>
        </DashboardLayout>
      </MemoryRouter>,
    );

    const root = container.firstElementChild;
    const shell = root?.firstElementChild;
    const main = screen.getByRole("main");

    expect(root).toHaveClass("h-screen", "overflow-hidden");
    expect(shell).toHaveClass("overflow-hidden");
    expect(main).toHaveClass("overflow-y-auto", "overflow-x-hidden");
    expect(screen.getByText("Portfolio body")).toBeInTheDocument();
  });
});
