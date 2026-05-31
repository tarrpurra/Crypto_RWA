import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type HyperliquidProvisionPayload,
  type LighterConnectPayload,
  type PacificaConfirmPayload,
  type PacificaProvisionPayload,
} from "@/lib/api";


const queryKey = ["exchange", "status"] as const;


export function useExchangeStatus() {
  return useQuery({
    queryKey,
    queryFn: api.exchange.getStatus,
    refetchInterval: 15_000,
  });
}


export function useConnectLighter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LighterConnectPayload) => api.exchange.connectLighter(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}


export function useDisconnectLighter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.exchange.disconnectLighter(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}


export function useProvisionPacifica() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PacificaProvisionPayload) => api.exchange.provisionPacifica(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}


export function useConfirmPacifica() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PacificaConfirmPayload) => api.exchange.confirmPacifica(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}


export function useDisconnectPacifica() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.exchange.disconnectPacifica(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}


export function useProvisionHyperliquid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: HyperliquidProvisionPayload) =>
      api.exchange.provisionHyperliquid(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}


export function useConfirmHyperliquid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.exchange.confirmHyperliquid(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}


export function useDisconnectHyperliquid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.exchange.disconnectHyperliquid(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}
