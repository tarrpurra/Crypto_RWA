import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { usePortfolioWallet } from "@/hooks/usePortfolioWallet";
import { useSettings } from "@/hooks/useSystem";
import { marketApi } from "@/lib/api/market";

export function ProposalNotification() {
  const navigate = useNavigate();
  const lastSeenCount = useRef(0);
  const initializedRef = useRef(false);
  const settingsQuery = useSettings();
  const { effectiveWalletAddress } = usePortfolioWallet();
  const aiDecisionMakerEnabled = settingsQuery.data?.ai_decision_maker_enabled ?? false;

  const { data: proposalsResponse } = useQuery({
    queryKey: ["proposals", "notification", effectiveWalletAddress],
    queryFn: () => marketApi.getProposals(undefined, effectiveWalletAddress),
    refetchInterval: 15_000,
    enabled: Boolean(effectiveWalletAddress),
  });

  useEffect(() => {
    if (!aiDecisionMakerEnabled) {
      lastSeenCount.current = 0;
      initializedRef.current = false;
      return;
    }

    // In AI mode proposals skip PENDING_APPROVAL and land in PROPOSAL_APPROVED/EXECUTING.
    // Track newly-approved proposals so the notification fires when the AI acts.
    const trackedProposals =
      proposalsResponse?.proposals?.filter(
        (p) => p.status_code === "PROPOSAL_APPROVED" || p.status_code === "PROPOSAL_EXECUTING",
      ) ?? [];

    if (!initializedRef.current) {
      lastSeenCount.current = trackedProposals.length;
      initializedRef.current = true;
      return;
    }
    if (trackedProposals.length === 0) {
      return;
    }
    if (trackedProposals.length <= lastSeenCount.current) {
      return;
    }
    lastSeenCount.current = trackedProposals.length;

    const latest = trackedProposals[0];
    const planTo = latest.plan_hash?.slice(0, 12) ?? latest.proposal_id.slice(0, 12);

    toast(
      <div className="w-full">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            AI AUTO-APPROVED
          </span>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
        </div>
        <p className="text-sm text-foreground">AI created and auto-approved a trade proposal</p>
        <p className="mt-1 text-xs text-muted-foreground">Plan {planTo} is queued for vault execution.</p>
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
