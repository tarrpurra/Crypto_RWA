import { request } from "./client";
import type { AllocationDecisionResponse } from "./types";

export const allocationApi = {
  recommendation: () => request<AllocationDecisionResponse>("/allocation/recommendation"),
  updateProfile: (profile_name: string) => request<{ status: string; message: string }>("/allocation/profile", "POST", { profile_name }),
};

