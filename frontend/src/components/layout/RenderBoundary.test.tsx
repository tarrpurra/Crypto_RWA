import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RenderBoundary } from "@/components/layout/RenderBoundary";

function Crasher() {
  throw new Error("boom");
}

describe("RenderBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <RenderBoundary>
        <div>visible content</div>
      </RenderBoundary>,
    );

    expect(screen.getByText("visible content")).toBeInTheDocument();
  });

  it("renders a fallback instead of a blank area when a child throws", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <RenderBoundary title="Page content failed to render">
        <Crasher />
      </RenderBoundary>,
    );

    expect(screen.getByText("Page content failed to render")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();

    errorSpy.mockRestore();
  });
});
