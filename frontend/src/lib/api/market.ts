import { request } from "./client";
import type {
  CreateProposalPayload,
  LatestPricesResponse,
  LatestQuotesResponse,
  MarketIngestionStatusResponse,
  NormalizedQuoteSnapshot,
  OndoUsdyOracleStatus,
  ProposalExecuteResponse,
  ProposalsResponse,
  RoutesResponse,
  TradeProposalResponse,
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
  createProposal: (payload: CreateProposalPayload) =>
    request<TradeProposalResponse>("/proposals/create", "POST", payload),
  approveProposal: (id: string) =>
    request<TradeProposalResponse>(`/proposals/${id}/approve`, "POST"),
  rejectProposal: (id: string) =>
    request<TradeProposalResponse>(`/proposals/${id}/reject`, "POST"),
  getProposals: (status?: string) =>
    request<ProposalsResponse>(`/proposals${status ? `?status=${status}` : ""}`),
  executeProposal: (id: string) =>
    request<ProposalExecuteResponse>(`/proposals/${id}/execute`, "POST"),
};

