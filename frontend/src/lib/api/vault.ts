import { api } from ".";
import type { DepositPrepareResponse, VaultBalanceResponse, WithdrawPrepareResponse } from "./types";

export const vaultApi = {
  async balance(userAddress: string | null): Promise<VaultBalanceResponse> {
    return api.get<VaultBalanceResponse>(
      "vault/portfolio",
      userAddress ? { user_address: userAddress } : undefined,
    );
  },

  async walletBalance(walletAddress: string | null) {
    return api.get<VaultBalanceResponse>(
      "vault/wallet",
      walletAddress ? { wallet_address: walletAddress } : undefined,
    );
  },

  async depositPrepare(token: string, amount: string, userAddress: string | null): Promise<DepositPrepareResponse> {
    return api.post<DepositPrepareResponse>("vault/deposit/prepare", {
      token,
      amount,
      user_address: userAddress,
    });
  },

  async withdrawPrepare(token: string, amount: string, userAddress: string): Promise<WithdrawPrepareResponse> {
    return api.post<WithdrawPrepareResponse>("vault/withdraw/prepare", {
      token,
      amount,
      user_address: userAddress,
    });
  },
};
