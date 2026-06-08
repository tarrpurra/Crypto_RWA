import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Eye } from "lucide-react";
import { formatUnits } from "viem";

import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold";
import { RiskDetailsModal } from "@/components/swap/RiskDetailsModal";
import { TransactionStatus } from "@/components/swap/TransactionStatus";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentRisk } from "@/hooks/useRisk";
import { useProposalActivity } from "@/hooks/useProposalActivity";
import { useApproveProposal, useExecuteProposal, useProposalDetail, useProposals, useRejectProposal } from "@/hooks/useSwap";
import { useSettings, useSystemReadiness } from "@/hooks/useSystem";

function formatRawAmount(value: string | null | undefined, decimals = 18) {
  if (!value) {
    return "-";
  }
  try {
    return formatUnits(BigInt(value), decimals);
  } catch {
    return value;
  }
}

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const ACTIVE_QUEUE_STATUSES = new Set([
  "PROPOSAL_PENDING_APPROVAL",
  "PROPOSAL_APPROVED",
  "PROPOSAL_EXECUTING",
]);

function shortAddress(value: string) {
  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function resolveTokenLabel(token: string, tokenLabelsByAddress: Map<string, string>) {
  if (!ADDRESS_PATTERN.test(token)) {
    return token;
  }

  return tokenLabelsByAddress.get(token.toLowerCase()) ?? shortAddress(token);
}

function formatApproxQuoteRate(
  maxAmountIn: string,
  minAmountOut: string,
  tokenInDecimals: number,
  tokenOutDecimals: number,
  tokenInLabel: string,
  tokenOutLabel: string,
) {
  try {
    const amountIn = Number(formatUnits(BigInt(maxAmountIn), tokenInDecimals));
    const amountOut = Number(formatUnits(BigInt(minAmountOut), tokenOutDecimals));
    if (!Number.isFinite(amountIn) || !Number.isFinite(amountOut) || amountIn <= 0 || amountOut <= 0) {
      return null;
    }

    const quotedAmountOut = amountOut / 0.99;
    const rate = quotedAmountOut / amountIn;
    if (!Number.isFinite(rate) || rate <= 0) {
      return null;
    }

    return `~1 ${tokenInLabel} = ${rate.toFixed(4)} ${tokenOutLabel}`;
  } catch {
    return null;
  }
}

function ProposalActionCard({
  proposal,
  working,
  onApprove,
  onReject,
  onExecute,
  onInspect,
  aiDecisionMakerEnabled,
  tokenLabelsByAddress,
  tokenDecimalsByAddress,
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
    approval_enabled?: boolean | null;
    approval_blockers?: string[];
  };
  working: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onExecute: (id: string) => void;
  onInspect: (proposalId: string) => void;
  aiDecisionMakerEnabled: boolean;
  tokenLabelsByAddress: Map<string, string>;
  tokenDecimalsByAddress: Map<string, number>;
}) {
  const isPending = proposal.status_code === "PROPOSAL_PENDING_APPROVAL";
  const isApproved = proposal.status_code === "PROPOSAL_APPROVED";
  const approvalEnabled = proposal.approval_enabled ?? true;
  const approvalBlockers = proposal.approval_blockers ?? [];
  const approvalBlocked = !approvalEnabled || approvalBlockers.length > 0;
  const tokenInLabel = resolveTokenLabel(proposal.token_in, tokenLabelsByAddress);
  const tokenOutLabel = resolveTokenLabel(proposal.token_out, tokenLabelsByAddress);
  const tokenInDecimals = tokenDecimalsByAddress.get(proposal.token_in.toLowerCase()) ?? 18;
  const tokenOutDecimals = tokenDecimalsByAddress.get(proposal.token_out.toLowerCase()) ?? 18;
  const quoteRate = formatApproxQuoteRate(
    proposal.max_amount_in,
    proposal.min_amount_out,
    tokenInDecimals,
    tokenOutDecimals,
    tokenInLabel,
    tokenOutLabel,
  );

  return (
    <div className="border border-border bg-surface-2 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              Swap {tokenInLabel} <ArrowRight className="mx-1 inline h-3.5 w-3.5" /> {tokenOutLabel}
            </p>
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {proposal.status_code}
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Max in</p>
              <p className="mt-1 font-mono text-sm text-foreground">
                {formatRawAmount(proposal.max_amount_in)} {tokenInLabel}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Min out</p>
              <p className="mt-1 font-mono text-sm text-foreground">
                {formatRawAmount(proposal.min_amount_out)} {tokenOutLabel}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Approx quote</p>
              <p className="mt-1 font-mono text-sm text-foreground">{quoteRate ?? "-"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Created</p>
              <p className="mt-1 text-sm text-muted-foreground">{new Date(proposal.created_at).toLocaleString()}</p>
            </div>
          </div>
          {approvalBlocked && (
            <div className="mt-3 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              <p className="font-medium">Approval blocked</p>
              <p className="mt-1">
                {approvalBlockers.length > 0
                  ? approvalBlockers[0]
                  : "Live quote freshness or guard checks are not satisfied yet."}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="outline" size="sm" onClick={() => onInspect(proposal.proposal_id)}>
            <Eye className="mr-2 h-3.5 w-3.5" />
            Review
          </Button>
          {!aiDecisionMakerEnabled && isPending && (
            <>
              <Button size="sm" onClick={() => onApprove(proposal.proposal_id)} disabled={working || approvalBlocked}>
                Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onReject(proposal.proposal_id)} disabled={working}>
                Reject
              </Button>
            </>
          )}
          {!aiDecisionMakerEnabled && isApproved && (
            <Button size="sm" onClick={() => onExecute(proposal.proposal_id)} disabled={working || approvalBlocked}>
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
  const settingsQuery = useSettings();
  const readinessQuery = useSystemReadiness();
  const approveMutation = useApproveProposal();
  const rejectMutation = useRejectProposal();
  const executeMutation = useExecuteProposal();
  const { appendEntry, getEntriesForProposal } = useProposalActivity();
  const proposals = useMemo(() => proposalsQuery.data?.proposals ?? [], [proposalsQuery.data?.proposals]);
  const queueProposals = useMemo(
    () => proposals.filter((proposal) => ACTIVE_QUEUE_STATUSES.has(proposal.status_code)),
    [proposals],
  );
  const aiDecisionMakerEnabled = settingsQuery.data?.ai_decision_maker_enabled ?? false;
  const tokenLabelsByAddress = useMemo(() => {
    const labels = new Map<string, string>();

    const readinessTokens = readinessQuery.data?.tokens ?? {};
    Object.values(readinessTokens).forEach((token) => {
      if (token.address && token.symbol) {
        labels.set(token.address.toLowerCase(), token.symbol);
      }
    });

    const settings = settingsQuery.data;
    if (settings?.sepolia_usdy_address) {
      labels.set(settings.sepolia_usdy_address.toLowerCase(), "USDY");
    }
    if (settings?.sepolia_wmnt_address) {
      labels.set(settings.sepolia_wmnt_address.toLowerCase(), "WMNT");
    }
    if (settings?.sepolia_meth_address) {
      labels.set(settings.sepolia_meth_address.toLowerCase(), "mETH");
    }

    return labels;
  }, [readinessQuery.data?.tokens, settingsQuery.data]);
  const tokenDecimalsByAddress = useMemo(() => {
    const decimals = new Map<string, number>();
    const readinessTokens = readinessQuery.data?.tokens ?? {};

    Object.values(readinessTokens).forEach((token) => {
      if (token.address && typeof token.decimals === "number") {
        decimals.set(token.address.toLowerCase(), token.decimals);
      }
    });

    return decimals;
  }, [readinessQuery.data?.tokens]);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [showRiskDialog, setShowRiskDialog] = useState(false);
  const proposalDetailQuery = useProposalDetail(selectedProposalId);

  const selectedProposal = useMemo(
    () => proposals.find((proposal) => proposal.proposal_id === selectedProposalId) ?? null,
    [proposals, selectedProposalId],
  );
  const proposalDetail = proposalDetailQuery.data;
  const selectedApprovalEnabled = selectedProposal?.approval_enabled ?? proposalDetail?.approval_enabled ?? true;
  const selectedApprovalBlockers = selectedProposal?.approval_blockers ?? proposalDetail?.approval_blockers ?? [];
  const selectedApprovalBlocked = !selectedApprovalEnabled || selectedApprovalBlockers.length > 0;

  const pendingCount = queueProposals.filter((p) => p.status_code === "PROPOSAL_PENDING_APPROVAL").length;
  const approvedCount = queueProposals.filter((p) => p.status_code === "PROPOSAL_APPROVED").length;
  const executedCount = proposals.filter((p) => p.status_code === "PROPOSAL_EXECUTED").length;
  const working = approveMutation.isPending || rejectMutation.isPending || executeMutation.isPending;
  const proposalActivity = getEntriesForProposal(selectedProposalId);
  const pageDescription = aiDecisionMakerEnabled
    ? "Review proposal timelines and inspect execution details while full access AI handles approvals and swaps automatically."
    : "Review proposal timelines, inspect execution details, approve intent, and submit qualified swaps onchain.";

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
      description={pageDescription}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricPanel
          label="Queue"
          value={`${queueProposals.length} Total`}
          detail={proposalsQuery.data?.status_reason ?? "Reading /proposals for the current approval queue."}
          tone={toneFromStatus(proposalsQuery.data?.status)}
        />
        <MetricPanel
          label="Pending"
          value={`${pendingCount}`}
          detail={aiDecisionMakerEnabled ? "Proposals are handled automatically by full access AI." : "Proposals waiting for a human approval decision."}
          tone={pendingCount > 0 ? "degraded" : "neutral"}
        />
        <MetricPanel
          label="Approved"
          value={`${approvedCount}`}
          detail={aiDecisionMakerEnabled ? "Proposals are auto-approved and auto-executed by the current AI mode." : "Proposals that can be executed through the connected wallet."}
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
            {aiDecisionMakerEnabled ? "AI-managed queue" : "Human approval required"}
          </Badge>
        </div>
        {aiDecisionMakerEnabled && (
          <div className="mt-3 rounded border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
            Full access AI is handling approval and execution automatically. Open Review to inspect the payload and guard checks.
          </div>
        )}
        <div className="mt-3 space-y-3">
          {proposals.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {proposalsQuery.isLoading ? "Loading proposals..." : "No proposals in the queue."}
            </p>
          )}
          {queueProposals.map((proposal) => (
            <ProposalActionCard
              key={proposal.proposal_id}
            proposal={proposal}
            working={working}
            onApprove={handleApprove}
            onReject={handleReject}
            onExecute={handleExecute}
            onInspect={setSelectedProposalId}
            aiDecisionMakerEnabled={aiDecisionMakerEnabled}
            tokenLabelsByAddress={tokenLabelsByAddress}
            tokenDecimalsByAddress={tokenDecimalsByAddress}
          />
          ))}
          {proposals.length > 0 && queueProposals.length === 0 && !proposalsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">
              No active approval queue items are available right now.
            </p>
          )}
        </div>
      </section>

      <Dialog open={Boolean(selectedProposal)} onOpenChange={(open) => !open && setSelectedProposalId(null)}>
        <DialogContent className="max-w-2xl border-border bg-background">
          <DialogHeader>
            <DialogTitle>Proposal review</DialogTitle>
            <DialogDescription>
              {aiDecisionMakerEnabled
                ? "Inspect the execution payload and risk state; full access AI handles approval and execution automatically."
                : "Inspect the execution payload, then approve or reject with the current wallet context."}
            </DialogDescription>
          </DialogHeader>

          {selectedProposal && (
            <div className="grid gap-3 text-sm">
              <div className="grid gap-2 rounded border border-border bg-surface-2 p-3 md:grid-cols-2">
                <p className="text-muted-foreground">Proposal ID</p>
                <p className="font-mono text-foreground">{selectedProposal.proposal_id}</p>
                <p className="text-muted-foreground">Pair</p>
                <div>
                  <p className="font-medium text-foreground">
                    {resolveTokenLabel(selectedProposal.token_in, tokenLabelsByAddress)}{" "}
                    <ArrowRight className="mx-1 inline h-3.5 w-3.5" />{" "}
                    {resolveTokenLabel(selectedProposal.token_out, tokenLabelsByAddress)}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
                    {selectedProposal.token_in} → {selectedProposal.token_out}
                  </p>
                </div>
                <p className="text-muted-foreground">Router</p>
                <p className="font-mono text-foreground">{selectedProposal.router ?? "-"}</p>
                <p className="text-muted-foreground">Selector</p>
                <p className="font-mono text-foreground">{selectedProposal.selector ?? "-"}</p>
                <p className="text-muted-foreground">Deadline</p>
                <p className="font-mono text-foreground">
                  {selectedProposal.deadline ? new Date(selectedProposal.deadline * 1000).toLocaleString() : "-"}
                </p>
                <p className="text-muted-foreground">Native value</p>
                <p className="font-mono text-foreground">
                  {formatRawAmount(selectedProposal.native_value)} MNT
                </p>
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
                          {check.passed ? "pass" : check.blocking ? "block" : "warn"}
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
                            {aiDecisionMakerEnabled ? "AI managed" : step.requires_user_action ? "user action" : "informational"}
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
                  {aiDecisionMakerEnabled
                    ? "Full access AI is handling approval and execution automatically. Use this dialog to inspect the payload and risk state."
                    : "Approve only after checking the pair, amount bounds, guard checks, and whether the proposal is still pending."}
                </p>
              </div>
              {selectedApprovalBlocked && (
                <div className="grid gap-2 rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                  <p className="font-medium">Approval blocked</p>
                  {selectedApprovalBlockers.length > 0 ? (
                    selectedApprovalBlockers.map((blocker) => <p key={blocker}>{blocker}</p>)
                  ) : (
                    <p>Live quote freshness or guard checks are not satisfied yet.</p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setShowRiskDialog(true)} disabled={!proposalDetail?.risk_assessment && !riskQuery.data}>
                  View risk details
                </Button>
                {!aiDecisionMakerEnabled && (
                  <>
                    <Button
                      onClick={() => handleApprove(selectedProposal.proposal_id)}
                      disabled={working || selectedProposal.status_code !== "PROPOSAL_PENDING_APPROVAL" || selectedApprovalBlocked}
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
                      disabled={working || selectedProposal.status_code !== "PROPOSAL_APPROVED" || selectedApprovalBlocked}
                    >
                      Execute
                    </Button>
                  </>
                )}
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
