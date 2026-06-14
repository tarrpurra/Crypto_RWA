import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { parseUnits } from "viem"
import { useChainId, usePublicClient, useWriteContract } from "wagmi"

import { marketApi } from "@/lib/api/market"
import type { CreateProposalPayload } from "@/lib/api/types"
import { toast } from "sonner"

export function useSwapQuote(tokenIn: string, tokenOut: string, enabled = true) {
  return useQuery({
    queryKey: ["swap", "quote", tokenIn, tokenOut],
    queryFn: () => marketApi.bestQuoteForPair(tokenIn, tokenOut),
    enabled: Boolean(tokenIn) && Boolean(tokenOut) && enabled,
    retry: false,
    refetchInterval: (query) => {
      if (query.state.error) return false
      const quote = query.state.data
      if (quote && (!quote.amount_out || quote.status_code === "LIQUIDITY_UNKNOWN")) {
        return false
      }
      return 15_000
    },
  })
}

export function useCreateProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateProposalPayload) => {
      console.info("[frontend][proposal] submitting /proposals/create", {
        wallet_address: payload.wallet_address ?? null,
        deposit_asset_symbol: payload.deposit_asset_symbol,
        deposit_amount: payload.deposit_amount,
        risk_profile: payload.risk_profile,
        allocation_mode: payload.allocation_mode,
        manual_target_weights: payload.manual_target_weights ?? null,
      })
      try {
        const response = await marketApi.createProposal(payload)
        console.info("[frontend][proposal] /proposals/create completed", {
          status: response.status,
          status_code: response.status_code,
          proposal_id: response.proposal_id,
          message: response.message,
        })
        return response
      } catch (error) {
        console.error("[frontend][proposal] /proposals/create failed", {
          wallet_address: payload.wallet_address ?? null,
          deposit_asset_symbol: payload.deposit_asset_symbol,
          deposit_amount: payload.deposit_amount,
          risk_profile: payload.risk_profile,
          allocation_mode: payload.allocation_mode,
          error,
        })
        throw error
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["proposals"] })
      void queryClient.invalidateQueries({ queryKey: ["allocation"] })
      void queryClient.invalidateQueries({ queryKey: ["risk"] })
    },
  })
}

export function useProposalDetail(id: string | null) {
  return useQuery({
    queryKey: ["proposals", "detail", id],
    queryFn: () => marketApi.getProposalDetail(id as string),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (query) => (query.state.error ? false : 30_000),
  })
}

export function useApproveProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => marketApi.approveProposal(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["proposals"] })
      void queryClient.invalidateQueries({ queryKey: ["proposals", "detail", id] })
    },
  })
}

export function useRejectProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => marketApi.rejectProposal(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["proposals"] })
      void queryClient.invalidateQueries({ queryKey: ["proposals", "detail", id] })
    },
  })
}

export function useExecuteProposal() {
  return useMutation({
    mutationFn: async () => {
      throw new Error(
        "Direct wallet execution is disabled. Deposit funds into the vault and use the ExecutorVault execution path only.",
      )
    },
  })
}

const WMNT_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const

export function useWrapMnt() {
  const queryClient = useQueryClient()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const chainId = useChainId()

  return useMutation({
    mutationFn: async ({ wmntAddress, amount }: { wmntAddress: `0x${string}`; amount: string }) => {
      const value = parseUnits(amount, 18)
      const hash = await writeContractAsync({
        address: wmntAddress,
        abi: WMNT_ABI,
        functionName: "deposit",
        chainId,
        value,
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash })
      }
      return { hash }
    },
    onSuccess: (data) => {
      toast.success(`Wrapped MNT: ${data.hash.slice(0, 16)}...`)
      // Bug G fix: invalidate vault balance so the UI reflects the new WMNT
      // balance immediately rather than waiting for the next 30-second poll.
      void queryClient.invalidateQueries({ queryKey: ["vault"] })
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] })
      void queryClient.invalidateQueries({ queryKey: ["system", "status"] })
      void queryClient.invalidateQueries({ queryKey: ["system", "readiness"] })
      void queryClient.invalidateQueries({ queryKey: ["market"] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to wrap MNT")
    },
  })
}

export function useProposals(status?: string) {
  return useQuery({
    queryKey: ["proposals", status],
    queryFn: () => marketApi.getProposals(status),
    refetchInterval: 30_000,
  })
}
