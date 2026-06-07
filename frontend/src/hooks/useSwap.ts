import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { parseUnits } from "viem"
import { useAccount, usePublicClient, useSendTransaction, useWriteContract } from "wagmi"

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
  const queryClient = useQueryClient()
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { sendTransactionAsync } = useSendTransaction()
  const { writeContractAsync } = useWriteContract()

  return useMutation({
    mutationFn: async (id: string) => {
      console.info("[frontend][swap] requesting /proposals/{id}/execute", { proposal_id: id, wallet_address: address ?? null })
      const txData = await marketApi.executeProposal(id)
      console.info("[frontend][swap] received execute payload", {
        proposal_id: txData.proposal_id,
        router: txData.router,
        token_in: txData.token_in,
        token_out: txData.token_out,
        chain_id: txData.chain_id,
        max_amount_in: txData.max_amount_in,
        min_amount_out: txData.min_amount_out,
        native_value: txData.native_value,
      })
      const amountIn = BigInt(txData.max_amount_in)
      const nativeValue = BigInt(txData.native_value)
      if (amountIn > 0n && publicClient && address) {
        console.info("[frontend][swap] checking allowance", {
          token_in: txData.token_in,
          router: txData.router,
          amount_in: txData.max_amount_in,
        })
        const allowance = (await publicClient.readContract({
          address: txData.token_in as `0x${string}`,
          abi: [
            {
              type: "function",
              name: "allowance",
              stateMutability: "view",
              inputs: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
              ],
              outputs: [{ name: "", type: "uint256" }],
            },
          ] as const,
          functionName: "allowance",
          args: [address, txData.router as `0x${string}`],
        })) as bigint

        if (allowance < amountIn) {
          console.info("[frontend][swap] submitting approval transaction", {
            token_in: txData.token_in,
            router: txData.router,
            amount_in: txData.max_amount_in,
          })
          const approvalHash = await writeContractAsync({
            address: txData.token_in as `0x${string}`,
            abi: [
              {
                type: "function",
                name: "approve",
                stateMutability: "nonpayable",
                inputs: [
                  { name: "spender", type: "address" },
                  { name: "amount", type: "uint256" },
                ],
                outputs: [{ name: "", type: "bool" }],
              },
            ] as const,
            functionName: "approve",
            chainId: txData.chain_id,
            args: [txData.router as `0x${string}`, amountIn],
          })
          await publicClient.waitForTransactionReceipt({ hash: approvalHash })
          toast.success(`Token approval confirmed: ${approvalHash.slice(0, 16)}...`)
        }
      }
      console.info("[frontend][swap] submitting router transaction", {
        router: txData.router,
        chain_id: txData.chain_id,
        calldata: txData.calldata,
        native_value: txData.native_value,
      })
      const hash = await sendTransactionAsync({
        to: txData.router as `0x${string}`,
        data: txData.calldata as `0x${string}`,
        chainId: txData.chain_id,
        value: nativeValue > 0n ? nativeValue : undefined,
      })
      console.info("[frontend][swap] router transaction sent", { proposal_id: txData.proposal_id, hash })
      return { ...txData, hash }
    },
    onSuccess: (data) => {
      toast.success(`Transaction sent: ${data.hash.slice(0, 16)}...`)
      void queryClient.invalidateQueries({ queryKey: ["proposals"] })
      void queryClient.invalidateQueries({ queryKey: ["proposals", "detail", data.proposal_id] })
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] })
      void queryClient.invalidateQueries({ queryKey: ["system", "status"] })
      void queryClient.invalidateQueries({ queryKey: ["system", "readiness"] })
      void queryClient.invalidateQueries({ queryKey: ["risk"] })
      void queryClient.invalidateQueries({ queryKey: ["allocation"] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to execute proposal")
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

  return useMutation({
    mutationFn: async ({ wmntAddress, amount }: { wmntAddress: `0x${string}`; amount: string }) => {
      const value = parseUnits(amount, 18)
      const hash = await writeContractAsync({
        address: wmntAddress,
        abi: WMNT_ABI,
        functionName: "deposit",
        value,
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash })
      }
      return { hash }
    },
    onSuccess: (data) => {
      toast.success(`Wrapped MNT: ${data.hash.slice(0, 16)}...`)
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
