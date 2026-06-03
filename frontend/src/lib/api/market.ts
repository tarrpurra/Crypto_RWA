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
  ProposalExecuteResponse,
  ProposalMutationResponse,
  ProposalsResponse,
  RoutesResponse,
} from "./types";

export const marketApi = {
  ingestionStatus: () => request<MarketIngestionStatusResponse>("/market/ingestion/status"),
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
  getProposals: (status?: string) =>
    request<ProposalsResponse>(`/proposals${status ? `?status=${status}` : ""}`),
  executeProposal: (id: string) =>
    request<ProposalExecuteResponse>(`/proposals/${id}/execute`, "POST"),
};
