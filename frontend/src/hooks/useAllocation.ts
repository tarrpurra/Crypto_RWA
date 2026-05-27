import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { allocationApi } from "@/lib/api/allocation";

export function useAllocationRecommendation() {
  return useQuery({
    queryKey: ["allocation", "recommendation"],
    queryFn: allocationApi.recommendation,
    refetchInterval: 45_000,
  });
}

export function useUpdateAllocationProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: allocationApi.updateProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["allocation"] });
    },
  });
}
