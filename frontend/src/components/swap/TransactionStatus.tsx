import { mantleSepoliaTestnet } from "wagmi/chains";

import type { ProposalActivityEntry } from "@/hooks/useProposalActivity";

function explorerLink(hash: string, chainId?: number) {
  if (!hash) {
    return null;
  }
  const baseUrl = chainId === mantleSepoliaTestnet.id
    ? mantleSepoliaTestnet.blockExplorers?.default.url
    : mantleSepoliaTestnet.blockExplorers?.default.url;
  return `${baseUrl}/tx/${hash}`;
}

export function TransactionStatus({
  entries,
  emptyLabel,
}: {
  entries: ProposalActivityEntry[];
  emptyLabel: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const href = entry.hash ? explorerLink(entry.hash, entry.chainId) : null;
        const actorLabel =
          entry.actor === "ai"
            ? "AI"
            : entry.actor === "user"
              ? "User"
              : entry.actor === "system"
                ? "System"
                : null;
        return (
          <div key={`${entry.proposalId}-${entry.type}-${entry.timestamp}`} className="rounded border border-border bg-surface-2 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">{entry.message}</p>
                {actorLabel && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                    {actorLabel}
                  </span>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(entry.timestamp).toLocaleString()}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{entry.proposalId}</p>
            {entry.hash && (
              <div className="mt-2">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                  >
                    {entry.hash}
                  </a>
                ) : (
                  <span className="font-mono text-xs text-muted-foreground">{entry.hash}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
