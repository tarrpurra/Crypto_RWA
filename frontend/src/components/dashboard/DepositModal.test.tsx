import { describe, expect, it } from "vitest";

import { getDepositAssets } from "@/components/dashboard/DepositModal";

describe("getDepositAssets", () => {
  it("keeps WMNT and native MNT available when WMNT is configured", () => {
    expect(getDepositAssets(false, "0x1111111111111111111111111111111111111111")).toEqual([
      "WMNT",
      "MNT",
      "USDY",
      "mETH",
    ]);
  });

  it("removes WMNT and native MNT when WMNT is unavailable", () => {
    expect(getDepositAssets(false)).toEqual(["USDY", "mETH"]);
  });
});
