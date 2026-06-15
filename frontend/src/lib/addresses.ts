import { getAddress, isAddress } from "viem";

export function normalizeAddress(value: string | null | undefined): `0x${string}` | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const candidate = trimmed.replace(/^0X/, "0x");
  if (!isAddress(candidate)) {
    return undefined;
  }

  return getAddress(candidate);
}
