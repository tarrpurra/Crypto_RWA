import { useMemo } from "react";

import { usePersistentState } from "@/hooks/use-persistent-state";

export type ProposalActivityType = "created" | "approved" | "rejected" | "submitted" | "executed";
export type ProposalActivityActor = "ai" | "user" | "system";

export interface ProposalActivityEntry {
  proposalId: string;
  type: ProposalActivityType;
  message: string;
  timestamp: string;
  actor?: ProposalActivityActor;
  hash?: string;
  chainId?: number;
}

const STORAGE_KEY = "aixrwa_proposal_activity";

export function useProposalActivity() {
  const [entries, setEntries] = usePersistentState<ProposalActivityEntry[]>(STORAGE_KEY, []);

  const appendEntry = (entry: ProposalActivityEntry) => {
    setEntries((current) => [entry, ...current].slice(0, 10));
  };

  const getEntriesForProposal = useMemo(
    () => (proposalId: string | null) => (proposalId ? entries.filter((entry) => entry.proposalId === proposalId) : []),
    [entries],
  );

  return {
    entries,
    appendEntry,
    getEntriesForProposal,
  };
}
