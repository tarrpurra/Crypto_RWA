import { request } from "./client";
import type {
  LatestPricesResponse,
  LatestQuotesResponse,
  MarketIngestionStatusResponse,
  OndoUsdyOracleStatus,
  RoutesResponse,
} from "./types";

export const marketApi = {
  ingestionStatus: () => request<MarketIngestionStatusResponse>("/market/ingestion/status"),
  latestPrices: () => request<LatestPricesResponse>("/market/prices/latest"),
  usdyOracle: () => request<OndoUsdyOracleStatus>("/market/oracles/usdy"),
  routes: () => request<RoutesResponse>("/market/routes"),
  latestQuotes: () => request<LatestQuotesResponse>("/market/quotes/latest"),
};

