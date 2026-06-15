import { request } from "./client";
import type {
  DepositPrepareResponse,
  VaultBalanceResponse,
  VaultFlowRecordRequest,
  VaultFlowRecordResponse,
  WithdrawPrepareResponse,
} from "./types";

function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

export const vaultApi = {
  async balance(userAddress: string | null): Promise<VaultBalanceResponse> {
    return request<VaultBalanceResponse>(`/vault/portfolio${queryString({ user_address: userAddress ?? undefined })}`);
  },

  async walletBalance(walletAddress: string | null) {
    return request<VaultBalanceResponse>(`/vault/wallet${queryString({ wallet_address: walletAddress ?? undefined })}`);
  },

  async depositPrepare(token: string, amount: string, userAddress: string | null): Promise<DepositPrepareResponse> {
    return request<DepositPrepareResponse>("/vault/deposit/prepare", "POST", {
      token,
      amount,
      user_address: userAddress,
    });
  },

  async withdrawPrepare(token: string, amount: string, userAddress: string): Promise<WithdrawPrepareResponse> {
    return request<WithdrawPrepareResponse>("/vault/withdraw/prepare", "POST", {
      token,
      amount,
      user_address: userAddress,
    });
  },

  async recordFlow(payload: VaultFlowRecordRequest): Promise<VaultFlowRecordResponse> {
    return request<VaultFlowRecordResponse>("/vault/flows/record", "POST", payload);
  },
};
