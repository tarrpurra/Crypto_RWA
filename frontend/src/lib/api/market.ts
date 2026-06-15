import { request } from "./client";
import type {
  AllocationDecisionResponse,
  CreateProposalPayload,
  InvestmentPlanResponse,
  LatestPricesResponse,
  LatestQuotesResponse,
  MarketIngestionStatusResponse,
  NormalizedQuoteSnapshot,
  OndoUsdyOracleStatus,
  PriceHistoryResponse,
  ProposalExecuteResponse,
  ProposalMutationResponse,
  ProposalsResponse,
  RoutesResponse,
} from "./types";

export const marketApi = {
  ingestionStatus: () => request<MarketIngestionStatusResponse>("/market/ingestion/status"),
  priceHistory: (asset: string, range = "24h", bucket = "1h") =>
    request<PriceHistoryResponse>(`/market/price-history?asset=${encodeURIComponent(asset)}&range=${encodeURIComponent(range)}&bucket=${encodeURIComponent(bucket)}`),
  latestPrices: () => request<LatestPricesResponse>("/market/prices/latest"),
  usdyOracle: () => request<OndoUsdyOracleStatus>("/market/oracles/usdy"),
  routes: () => request<RoutesResponse>("/market/routes"),
  latestQuotes: () => request<LatestQuotesResponse>("/market/quotes/latest"),
  quotesForPair: (tokenIn: string, tokenOut: string) =>
    request<LatestQuotesResponse>(`/market/quotes/${tokenIn}/${tokenOut}`),
  bestQuoteForPair: (tokenIn: string, tokenOut: string) =>
    request<NormalizedQuoteSnapshot>(`/market/quotes/${tokenIn}/${tokenOut}/best`),
  getAllocationRecommendation: () =>
    request<AllocationDecisionResponse>("/allocation/recommendation"),
  createProposal: (payload: CreateProposalPayload) =>
    request<InvestmentPlanResponse>("/proposals/create", "POST", payload),
  getProposalDetail: (id: string) =>
    request<InvestmentPlanResponse>(`/proposals/${id}`),
  approveProposal: (id: string) =>
    request<ProposalMutationResponse>(`/proposals/${id}/approve`, "POST"),
  rejectProposal: (id: string) =>
    request<ProposalMutationResponse>(`/proposals/${id}/reject`, "POST"),
  getProposals: (status?: string, walletAddress?: string | null) => {
    const params = new URLSearchParams();
    if (status) {
      params.set("status", status);
    }
    if (walletAddress?.trim()) {
      params.set("wallet_address", walletAddress.trim());
    }
    const query = params.toString();
    return request<ProposalsResponse>(`/proposals${query ? `?${query}` : ""}`);
  },
  executeProposal: (id: string) =>
    request<ProposalExecuteResponse>(`/proposals/${id}/execute`, "POST"),
};
