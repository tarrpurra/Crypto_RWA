import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Eye } from "lucide-react";

import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { RiskDetailsModal } from "@/components/swap/RiskDetailsModal";
import { TransactionStatus } from "@/components/swap/TransactionStatus";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentRisk } from "@/hooks/useRisk";
import { useProposalActivity } from "@/hooks/useProposalActivity";
import { useApproveProposal, useExecuteProposal, useProposalDetail, useProposals, useRejectProposal } from "@/hooks/useSwap";

function ProposalActionCard({
  proposal,
  working,
  onApprove,
  onReject,
  onExecute,
  onInspect,
}: {
  proposal: {
    proposal_id: string;
    token_in: string;
    token_out: string;
    max_amount_in: string;
    min_amount_out: string;
    status_code: string;
    created_at: string;
    router?: string;
    selector?: string;
    deadline?: number;
    native_value?: string;
  };
  working: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onExecute: (id: string) => void;
  onInspect: (proposalId: string) => void;
}) {
  const isPending = proposal.status_code === "PROPOSAL_PENDING_APPROVAL";
  const isApproved = proposal.status_code === "PROPOSAL_APPROVED";

  return (
    <div className="border border-border bg-surface-2 p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {proposal.token_in} -&gt; {proposal.token_out}
            </p>
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {proposal.status_code}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
            <div>
              <span className="terminal-label">Max Amount In: </span>
              <span className="font-mono">{proposal.max_amount_in}</span>
            </div>
            <div>
              <span className="terminal-label">Min Amount Out: </span>
              <span className="font-mono">{proposal.min_amount_out ?? "-"}</span>
            </div>
            <div>
              <span className="terminal-label">Created: </span>
              <span>{new Date(proposal.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="outline" size="sm" onClick={() => onInspect(proposal.proposal_id)}>
            <Eye className="mr-2 h-3.5 w-3.5" />
            Review
          </Button>
          {isPending && (
            <>
              <Button size="sm" onClick={() => onApprove(proposal.proposal_id)} disabled={working}>
                Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onReject(proposal.proposal_id)} disabled={working}>
                Reject
              </Button>
            </>
          )}
          {isApproved && (
            <Button size="sm" onClick={() => onExecute(proposal.proposal_id)} disabled={working}>
              Execute
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const proposalsQuery = useProposals();
  const riskQuery = useCurrentRisk();
  const approveMutation = useApproveProposal();
  const rejectMutation = useRejectProposal();
  const executeMutation = useExecuteProposal();
  const { appendEntry, getEntriesForProposal } = useProposalActivity();
  const proposals = useMemo(() => proposalsQuery.data?.proposals ?? [], [proposalsQuery.data?.proposals]);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [showRiskDialog, setShowRiskDialog] = useState(false);
  const proposalDetailQuery = useProposalDetail(selectedProposalId);

  const selectedProposal = useMemo(
    () => proposals.find((proposal) => proposal.proposal_id === selectedProposalId) ?? null,
    [proposals, selectedProposalId],
  );
  const proposalDetail = proposalDetailQuery.data;

  const pendingCount = proposals.filter((p) => p.status_code === "PROPOSAL_PENDING_APPROVAL").length;
  const approvedCount = proposals.filter((p) => p.status_code === "PROPOSAL_APPROVED").length;
  const executedCount = proposals.filter((p) => p.status_code === "PROPOSAL_EXECUTED").length;
  const working = approveMutation.isPending || rejectMutation.isPending || executeMutation.isPending;
  const proposalActivity = getEntriesForProposal(selectedProposalId);

  const handleApprove = (id: string) => {
    approveMutation.mutate(id, {
      onSuccess: () => {
        appendEntry({
          proposalId: id,
          type: "approved",
          message: "Proposal approved for execution",
          timestamp: new Date().toISOString(),
        });
        toast.success("Proposal approved");
      },
      onError: () => toast.error("Failed to approve proposal"),
    });
  };

  const handleReject = (id: string) => {
    rejectMutation.mutate(id, {
      onSuccess: () => {
        appendEntry({
          proposalId: id,
          type: "rejected",
          message: "Proposal rejected",
          timestamp: new Date().toISOString(),
        });
        toast.success("Proposal rejected");
      },
      onError: () => toast.error("Failed to reject proposal"),
    });
  };

  const handleExecute = (id: string) => {
    executeMutation.mutate(id, {
      onSuccess: (data) => {
        appendEntry({
          proposalId: id,
          type: "submitted",
          message: "Proposal execution submitted onchain",
          timestamp: new Date().toISOString(),
          hash: data.hash,
          chainId: data.chain_id,
        });
        toast.success("Proposal execution submitted");
      },
      onError: () => toast.error("Failed to execute proposal"),
    });
  };

  return (
    <PageScaffold
      eyebrow="Trade Approval"
      title="Approvals"
      description="Review proposal timelines, inspect execution details, approve intent, and submit qualified swaps onchain."
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricPanel
          label="Queue"
          value={`${proposals.length} Total`}
          detail={proposalsQuery.data?.status_reason ?? "Reading /proposals for the current approval queue."}
          tone={toneFromStatus(proposalsQuery.data?.status)}
        />
        <MetricPanel
          label="Pending"
          value={`${pendingCount}`}
          detail="Proposals waiting for a human approval decision."
          tone={pendingCount > 0 ? "degraded" : "neutral"}
        />
        <MetricPanel
          label="Approved"
          value={`${approvedCount}`}
          detail="Proposals that can be executed through the connected wallet."
          tone={approvedCount > 0 ? "ready" : "neutral"}
        />
        <MetricPanel
          label="Executed"
          value={`${executedCount}`}
          detail="Proposals already sent through the current execution path."
          tone="ready"
        />
      </div>

      <section className="terminal-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="terminal-label text-primary">Approval Queue</p>
          <Badge variant="outline" className="border-border text-muted-foreground">
            Human approval required
          </Badge>
        </div>
        <div className="mt-3 space-y-3">
          {proposals.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {proposalsQuery.isLoading ? "Loading proposals..." : "No proposals in the queue."}
            </p>
          )}
          {proposals.map((proposal) => (
            <ProposalActionCard
              key={proposal.proposal_id}
              proposal={proposal}
              working={working}
              onApprove={handleApprove}
              onReject={handleReject}
              onExecute={handleExecute}
              onInspect={setSelectedProposalId}
            />
          ))}
        </div>
      </section>

      <Dialog open={Boolean(selectedProposal)} onOpenChange={(open) => !open && setSelectedProposalId(null)}>
        <DialogContent className="max-w-2xl border-border bg-background">
          <DialogHeader>
            <DialogTitle>Proposal review</DialogTitle>
            <DialogDescription>
              Inspect the execution payload, then approve or reject with the current wallet context.
            </DialogDescription>
          </DialogHeader>

          {selectedProposal && (
            <div className="grid gap-3 text-sm">
              <div className="grid gap-2 rounded border border-border bg-surface-2 p-3 md:grid-cols-2">
                <p className="text-muted-foreground">Proposal ID</p>
                <p className="font-mono text-foreground">{selectedProposal.proposal_id}</p>
                <p className="text-muted-foreground">Pair</p>
                <p className="font-medium text-foreground">
                  {selectedProposal.token_in} <ArrowRight className="mx-1 inline h-3.5 w-3.5" /> {selectedProposal.token_out}
                </p>
                <p className="text-muted-foreground">Router</p>
                <p className="font-mono text-foreground">{selectedProposal.router ?? "-"}</p>
                <p className="text-muted-foreground">Selector</p>
                <p className="font-mono text-foreground">{selectedProposal.selector ?? "-"}</p>
                <p className="text-muted-foreground">Deadline</p>
                <p className="font-mono text-foreground">
                  {selectedProposal.deadline ? new Date(selectedProposal.deadline * 1000).toLocaleString() : "-"}
                </p>
                <p className="text-muted-foreground">Native value</p>
                <p className="font-mono text-foreground">{selectedProposal.native_value ?? "-"}</p>
              </div>
              {proposalDetail && (
                <>
                  <div className="grid gap-2 rounded border border-border bg-surface-2 p-3 md:grid-cols-2">
                    <p className="text-muted-foreground">Plan ID</p>
                    <p className="font-mono text-foreground">{proposalDetail.plan_id}</p>
                    <p className="text-muted-foreground">Deposit</p>
                    <p className="font-medium text-foreground">
                      {proposalDetail.deposit_amount} {proposalDetail.deposit_asset_symbol}
                    </p>
                    <p className="text-muted-foreground">Risk profile</p>
                    <p className="font-medium text-foreground">{proposalDetail.risk_profile}</p>
                    <p className="text-muted-foreground">Allocation mode</p>
                    <p className="font-medium text-foreground">{proposalDetail.allocation_mode}</p>
                    <p className="text-muted-foreground">Gas estimate</p>
                    <p className="font-mono text-foreground">{proposalDetail.estimated_gas_native ?? "-"}</p>
                  </div>
                  <div className="grid gap-2 rounded border border-border bg-surface-2 p-3">
                    <p className="font-medium text-foreground">Guard checks</p>
                    {proposalDetail.guard_checks.map((check) => (
                      <div
                        key={check.code}
                        className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-b-0 last:pb-0"
                      >
                        <div>
                          <p className="text-sm text-foreground">{check.label}</p>
                          <p className="text-xs text-muted-foreground">{check.message}</p>
                        </div>
                        <span className={check.passed ? "text-success" : check.blocking ? "text-destructive" : "text-warning"}>
                          {check.passed ? "pass" : check.blocking ? "block" : "pending"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-2 rounded border border-border bg-surface-2 p-3">
                    <p className="font-medium text-foreground">Transaction sequence</p>
                    {proposalDetail.transaction_steps.map((step) => (
                      <div key={`${step.step_index}-${step.step_type}`} className="rounded border border-border/60 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-foreground">
                            Step {step.step_index}: {step.step_type}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {step.requires_user_action ? "user action" : "informational"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {!proposalDetail && selectedProposalId && !proposalDetailQuery.isLoading && (
                <div className="grid gap-2 rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                  <p>
                    Full backend proposal detail is unavailable for this proposal. This usually means the proposal was created before
                    the current process booted or before detail caching was added.
                  </p>
                </div>
              )}
              <div className="grid gap-2 rounded border border-border bg-surface-2 p-3">
                <p className="font-medium text-foreground">Approval guidance</p>
                <p className="text-muted-foreground">
                  Approve only after checking the pair, amount bounds, guard checks, and whether the proposal is still pending.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setShowRiskDialog(true)} disabled={!proposalDetail?.risk_assessment && !riskQuery.data}>
                  View risk details
                </Button>
                <Button
                  onClick={() => handleApprove(selectedProposal.proposal_id)}
                  disabled={working || selectedProposal.status_code !== "PROPOSAL_PENDING_APPROVAL"}
                >
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleReject(selectedProposal.proposal_id)}
                  disabled={working || selectedProposal.status_code !== "PROPOSAL_PENDING_APPROVAL"}
                >
                  Reject
                </Button>
                <Button
                  onClick={() => handleExecute(selectedProposal.proposal_id)}
                  disabled={working || selectedProposal.status_code !== "PROPOSAL_APPROVED"}
                >
                  Execute
                </Button>
              </div>
              <TransactionStatus
                entries={proposalActivity}
                emptyLabel="No approval or execution activity has been recorded for this proposal yet."
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <RiskDetailsModal
        open={showRiskDialog}
        onOpenChange={setShowRiskDialog}
        risk={proposalDetail?.risk_assessment ?? riskQuery.data}
      />
    </PageScaffold>
  );
}
