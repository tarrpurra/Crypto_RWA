import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const privyLoginMock = vi.hoisted(() => vi.fn());
const privyLogoutMock = vi.hoisted(() => vi.fn());
const privyGetAccessTokenMock = vi.hoisted(() => vi.fn());
const privyUseMock = vi.hoisted(() => vi.fn());
const privyProviderMock = vi.hoisted(() => vi.fn());

vi.mock("@privy-io/react-auth", async () => {
  const React = await import("react");
  return {
    PrivyProvider: ({ appId, children }: { appId: string; children: ReactNode }) => {
      privyProviderMock(appId);
      return React.createElement("div", { "data-testid": "privy-provider" }, children);
    },
    usePrivy: () => privyUseMock(),
  };
});

async function renderAuthButton() {
  const { AuthProvider } = await import("./AuthProvider");
  const { LoginButton } = await import("./LoginButton");

  return render(
    <AuthProvider>
      <LoginButton />
    </AuthProvider>,
  );
}

afterEach(() => {
  window.localStorage.clear();
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("AuthProvider", () => {
  it("starts in local unauthenticated mode when no Privy app ID is configured", async () => {
    vi.stubEnv("VITE_PRIVY_APP_ID", "");

    await renderAuthButton();
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));

    expect(privyProviderMock).not.toHaveBeenCalled();
    expect(privyLoginMock).not.toHaveBeenCalled();
  });

  it("clears a browser auth token from local mode logout", async () => {
    vi.stubEnv("VITE_PRIVY_APP_ID", "");
    window.localStorage.setItem("aixrwa_auth_token", "local-token");

    await renderAuthButton();
    fireEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(window.localStorage.getItem("aixrwa_auth_token")).toBeNull();
    expect(privyProviderMock).not.toHaveBeenCalled();
  });

  it("passes the configured Privy app ID into the Privy provider", async () => {
    vi.stubEnv("VITE_PRIVY_APP_ID", "privy-test-app");
    privyUseMock.mockReturnValue({
      ready: true,
      user: null,
      login: privyLoginMock,
      logout: privyLogoutMock,
      getAccessToken: privyGetAccessTokenMock,
    });

    await renderAuthButton();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /connect wallet/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));

    expect(privyProviderMock).toHaveBeenCalledWith("privy-test-app");
    expect(privyLoginMock).toHaveBeenCalledTimes(1);
  });

  it("syncs the Privy access token for API requests after login", async () => {
    vi.stubEnv("VITE_PRIVY_APP_ID", "privy-test-app");
    privyGetAccessTokenMock.mockResolvedValue("privy-access-token");
    privyLogoutMock.mockResolvedValue(undefined);
    privyUseMock.mockReturnValue({
      ready: true,
      user: {
        id: "did:privy:test-user",
        wallet: {
          address: "0x1234567890abcdef",
          chainType: "ethereum",
        },
      },
      login: privyLoginMock,
      logout: privyLogoutMock,
      getAccessToken: privyGetAccessTokenMock,
    });

    await renderAuthButton();

    await waitFor(() => {
      expect(window.localStorage.getItem("aixrwa_auth_token")).toBe("privy-access-token");
    });

    fireEvent.click(screen.getByRole("button"));

    expect(window.localStorage.getItem("aixrwa_auth_token")).toBeNull();
    expect(privyLogoutMock).toHaveBeenCalledTimes(1);
  });
});
