import { toast } from "sonner"

import { MetricPanel, PageScaffold, toneFromStatus } from "@/components/rwa/PageScaffold"
import { Button } from "@/components/ui/button"
import { useMarketIngestionStatus, useLatestPrices, useMarketRoutes, useUsdyOracle } from "@/hooks/useMarket"
import { useApproveProposal, useExecuteProposal, useProposals, useRejectProposal } from "@/hooks/useSwap"

function ProposalCard({
  proposal,
  onApprove,
  onReject,
  onExecute,
  working,
}: {
  proposal: {
    id: string
    token_in: string
    token_out: string
    amount_in: string
    amount_out: string | null
    status: string
    created_at: string
    risk_info?: Record<string, unknown>
    execution_payload?: Record<string, unknown>
  }
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onExecute: (id: string) => void
  working: boolean
}) {
  const isPending = proposal.status === "pending"
  const isApproved = proposal.status === "approved"

  return (
    <div className="border border-border bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {proposal.token_in} → {proposal.token_out}
            </p>
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {proposal.status}
            </span>
          </div>
          <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              <span className="terminal-label">Amount In: </span>
              <span className="font-mono">{proposal.amount_in} {proposal.token_in}</span>
            </div>
            {proposal.amount_out && (
              <div>
                <span className="terminal-label">Amount Out: </span>
                <span className="font-mono">{proposal.amount_out} {proposal.token_out}</span>
              </div>
            )}
            <div>
              <span className="terminal-label">Created: </span>
              <span>{new Date(proposal.created_at).toLocaleString()}</span>
            </div>
            <div>
              <span className="terminal-label">Proposal ID: </span>
              <span className="font-mono">{proposal.id.slice(0, 16)}...</span>
            </div>
          </div>
          {proposal.risk_info && Object.keys(proposal.risk_info).length > 0 && (
            <details className="mt-2" open>
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Risk Details
              </summary>
              <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-[10px] text-muted-foreground">
                {JSON.stringify(proposal.risk_info, null, 2)}
              </pre>
            </details>
          )}
          {proposal.execution_payload && Object.keys(proposal.execution_payload).length > 0 && (
            <details className="mt-1" open>
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Execution Payload
              </summary>
              <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-[10px] text-muted-foreground">
                {JSON.stringify(proposal.execution_payload, null, 2)}
              </pre>
            </details>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {isPending && (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={() => onApprove(proposal.id)}
                disabled={working}
              >
                Approve
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onReject(proposal.id)}
                disabled={working}
              >
                Reject
              </Button>
            </>
          )}
          {isApproved && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onExecute(proposal.id)}
              disabled={working}
            >
              Execute
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Trade() {
  const ingestionQuery = useMarketIngestionStatus()
  const pricesQuery = useLatestPrices()
  const oracleQuery = useUsdyOracle()
  const routesQuery = useMarketRoutes()
  const proposalsQuery = useProposals()
  const approveMutation = useApproveProposal()
  const rejectMutation = useRejectProposal()
  const executeMutation = useExecuteProposal()

  const ingestion = ingestionQuery.data
  const prices = pricesQuery.data
  const oracle = oracleQuery.data
  const routes = routesQuery.data
  const proposals = proposalsQuery.data?.proposals ?? []

  const handleApprove = (id: string) => {
    approveMutation.mutate(id, {
      onSuccess: () => toast.success("Proposal approved"),
      onError: () => toast.error("Failed to approve proposal"),
    })
  }

  const handleReject = (id: string) => {
    rejectMutation.mutate(id, {
      onSuccess: () => toast.success("Proposal rejected"),
      onError: () => toast.error("Failed to reject proposal"),
    })
  }

  const handleExecute = (id: string) => {
    executeMutation.mutate(id, {
      onSuccess: () => toast.success("Proposal executed"),
      onError: () => toast.error("Failed to execute proposal"),
    })
  }

  const working = approveMutation.isPending || rejectMutation.isPending || executeMutation.isPending

  return (
    <PageScaffold
      eyebrow="Market & Trading"
      title="Trade"
      description="Proposals, routes, oracle freshness, prices, and ingestion health — all in one view."
    >
      {/* Market metrics */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricPanel
          label="Ingestion"
          value={ingestion?.status_label ?? "Loading"}
          detail={ingestion?.status_reason ?? "Reading /market/ingestion/status."}
          tone={toneFromStatus(ingestion?.status)}
        />
        <MetricPanel
          label="Prices"
          value={`${prices?.prices.length ?? 0} Assets`}
          detail={prices?.status_reason ?? "Reading /market/prices/latest."}
          tone={toneFromStatus(prices?.status)}
        />
        <MetricPanel
          label="USDY Oracle"
          value={oracle?.status ?? "Loading"}
          detail={oracle?.price ? `Oracle price ${oracle.price}` : "Reading /market/oracles/usdy."}
          tone={oracle?.status === "ok" ? "ready" : "degraded"}
        />
        <MetricPanel
          label="Routes"
          value={`${routes?.routes.length ?? 0} Routes`}
          detail={routes?.status_reason ?? "Reading /market/routes."}
          tone={toneFromStatus(routes?.status)}
        />
      </div>

      {/* Latest Prices */}
      <section className="terminal-panel p-4">
        <p className="terminal-label text-primary">Latest Prices</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {(prices?.prices ?? []).map((price) => (
            <div key={price.snapshot_id} className="border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-foreground">{price.asset_symbol}</p>
                <span className="font-mono text-sm text-muted-foreground">{price.price_usd ?? "-"}</span>
              </div>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">{price.status_reason}</p>
            </div>
          ))}
          {!prices?.prices?.length && (
            <p className="text-sm text-muted-foreground">No price snapshots returned yet.</p>
          )}
        </div>
      </section>

      {/* Proposal queue */}
      <section className="terminal-panel p-4">
        <p className="terminal-label text-primary">Proposal Queue</p>
        <div className="mt-3 space-y-3">
          {proposals.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {proposalsQuery.isLoading ? "Loading proposals..." : "No proposals yet. Create a swap to start."}
            </p>
          )}
          {proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              onApprove={handleApprove}
              onReject={handleReject}
              onExecute={handleExecute}
              working={working}
            />
          ))}
        </div>
      </section>

      {/* Available Routes */}
      <section className="terminal-panel p-4">
        <p className="terminal-label text-primary">Available Routes</p>
        <div className="mt-3 space-y-2">
          {(routes?.routes ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No routes available.</p>
          )}
          {(routes?.routes ?? []).map((route) => (
            <div
              key={route.route_id ?? `${route.protocol}-${route.token_in}-${route.token_out}`}
              className="flex items-center justify-between border border-border bg-surface-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {route.token_in} → {route.token_out}
                </p>
                <p className="text-xs text-muted-foreground">{route.protocol}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{route.route_type}</span>
            </div>
          ))}
        </div>
      </section>
    </PageScaffold>
  )
}
