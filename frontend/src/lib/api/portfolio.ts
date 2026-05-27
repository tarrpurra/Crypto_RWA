import { request } from "./client";
import type { PortfolioSnapshotHistoryResponse, PortfolioSnapshotResponse } from "./types";

export const portfolioApi = {
  current: () => request<PortfolioSnapshotResponse>("/portfolio/current"),
  latestSnapshot: () => request<PortfolioSnapshotResponse>("/portfolio/snapshots/latest"),
  snapshots: (limit = 20) => request<PortfolioSnapshotHistoryResponse>(`/portfolio/snapshots?limit=${limit}`),
};

