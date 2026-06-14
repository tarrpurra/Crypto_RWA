import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useSettings } from "@/hooks/useSystem";
import { marketApi } from "@/lib/api/market";

export function ProposalNotification() {
  const navigate = useNavigate();
  const lastSeenCount = useRef(0);
  const initializedRef = useRef(false);
  const settingsQuery = useSettings();
  const aiDecisionMakerEnabled = settingsQuery.data?.ai_decision_maker_enabled ?? false;

  const { data: proposalsResponse } = useQuery({
    queryKey: ["proposals", "notification"],
    queryFn: () => marketApi.getProposals(),
    refetchInterval: 15_000,
    enabled: true,
  });

  useEffect(() => {
    if (!aiDecisionMakerEnabled) {
      lastSeenCount.current = 0;
      initializedRef.current = false;
      return;
    }

    const pendingProposals =
      proposalsResponse?.proposals?.filter(
        (p) => p.status_code === "PROPOSAL_PENDING_APPROVAL",
      ) ?? [];

    if (!initializedRef.current) {
      lastSeenCount.current = pendingProposals.length;
      initializedRef.current = true;
      return;
    }
    if (pendingProposals.length === 0) {
      return;
    }
    if (pendingProposals.length <= lastSeenCount.current) {
      return;
    }
    lastSeenCount.current = pendingProposals.length;

    const latest = pendingProposals[0];
    const planTo = latest.plan_hash?.slice(0, 12) ?? latest.proposal_id.slice(0, 12);

    toast(
      <div className="w-full">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            REBALANCE PROPOSED
          </span>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
        </div>
        <p className="text-sm text-foreground">AI created a trade proposal</p>
        <p className="mt-1 text-xs text-muted-foreground">Plan {planTo} is waiting for human approval.</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              navigate("/decision-log");
              toast.dismiss();
            }}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            View Decision Log -&gt;
          </button>
          <button
            type="button"
            onClick={() => toast.dismiss()}
            className="rounded px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      </div>,
      { duration: 10_000 },
    );
  }, [aiDecisionMakerEnabled, proposalsResponse, navigate]);

  return null;
}
