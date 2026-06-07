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
    mutationFn: (payload: CreateProposalPayload) => marketApi.createProposal(payload),
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
      const txData = await marketApi.executeProposal(id)
      const amountIn = BigInt(txData.max_amount_in)
      const nativeValue = BigInt(txData.native_value)
      if (amountIn > 0n && publicClient && address) {
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
      const hash = await sendTransactionAsync({
        to: txData.router as `0x${string}`,
        data: txData.calldata as `0x${string}`,
        chainId: txData.chain_id,
        value: nativeValue > 0n ? nativeValue : undefined,
      })
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
