import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSendTransaction } from "wagmi"

import { marketApi } from "@/lib/api/market"
import type { CreateProposalPayload } from "@/lib/api/types"
import { toast } from "sonner"

export function useSwapQuote(tokenIn: string, tokenOut: string) {
  return useQuery({
    queryKey: ["swap", "quote", tokenIn, tokenOut],
    queryFn: () => marketApi.bestQuoteForPair(tokenIn, tokenOut),
    enabled: Boolean(tokenIn) && Boolean(tokenOut),
    refetchInterval: 15_000,
  })
}

export function useCreateProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateProposalPayload) => marketApi.createProposal(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["proposals"] })
    },
  })
}

export function useApproveProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => marketApi.approveProposal(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["proposals"] })
    },
  })
}

export function useRejectProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => marketApi.rejectProposal(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["proposals"] })
    },
  })
}

export function useExecuteProposal() {
  const queryClient = useQueryClient()
  const { sendTransactionAsync } = useSendTransaction()

  return useMutation({
    mutationFn: async (id: string) => {
      const txData = await marketApi.executeProposal(id)
      const hash = await sendTransactionAsync({
        to: txData.router as `0x${string}`,
        data: txData.calldata as `0x${string}`,
        chainId: txData.chain_id,
      })
      return { ...txData, hash }
    },
    onSuccess: (data) => {
      toast.success(`Transaction sent: ${data.hash.slice(0, 16)}...`)
      void queryClient.invalidateQueries({ queryKey: ["proposals"] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to execute proposal")
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
