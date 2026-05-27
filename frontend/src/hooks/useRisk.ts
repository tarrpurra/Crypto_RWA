import { useQuery } from "@tanstack/react-query";

import { riskApi } from "@/lib/api/risk";

export function useCurrentRisk() {
  return useQuery({
    queryKey: ["risk", "current"],
    queryFn: riskApi.current,
    refetchInterval: 30_000,
  });
}

export function useRiskAssessments(limit = 20) {
  return useQuery({
    queryKey: ["risk", "assessments", limit],
    queryFn: () => riskApi.assessments(limit),
    refetchInterval: 60_000,
  });
}
