import { useMemo } from "react";
import { Database, FileSearch, Sparkles, Wand2 } from "lucide-react";

import { cn } from "@/lib/utils";

type ReasoningStreamPanelProps = {
  retrievalItems: string[];
  constraints: string[];
  notes: string[];
  parsedResponse: Record<string, unknown> | null;
};

function toPrettyValue(value: unknown) {
  if (value == null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function ReasoningStreamPanel({
  retrievalItems,
  constraints,
  notes,
  parsedResponse,
}: ReasoningStreamPanelProps) {
  const responsePairs = useMemo(
    () =>
      Object.entries(parsedResponse ?? {})
        .map(([key, value]) => ({ key, value: toPrettyValue(value) }))
        .filter((entry): entry is { key: string; value: string } => Boolean(entry.value))
        .slice(0, 6),
    [parsedResponse],
  );

  return (
    <div className="mt-4 grid gap-3">
      <section className="rounded-lg border border-border bg-surface-2/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-primary" />
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">
              Retrieval Context
            </p>
          </div>
          <span className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
            {retrievalItems.length} inputs
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="rounded-md border border-border/70 bg-background/60 p-3">
            <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Database className="h-3.5 w-3.5" />
              Retrieved Signals
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {retrievalItems.length > 0 ? retrievalItems.map((item) => (
                <span key={item} className="rounded border border-border bg-surface-2 px-2 py-1 font-mono text-[0.67rem] text-foreground">
                  {item}
                </span>
              )) : (
                <span className="text-xs text-muted-foreground">No retrieval inputs were recorded for this response.</span>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border/70 bg-background/60 p-3">
            <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Wand2 className="h-3.5 w-3.5" />
              Guardrails Applied
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {constraints.length > 0 ? constraints.map((item) => (
                <span key={item} className="rounded border border-primary/20 bg-primary/[0.06] px-2 py-1 text-[0.67rem] text-foreground">
                  {item}
                </span>
              )) : (
                <span className="text-xs text-muted-foreground">No explicit constraints were returned.</span>
              )}
            </div>
          </div>

          {notes.length > 0 && (
            <div className="rounded-md border border-border/70 bg-background/60 p-3">
              <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Diagnostic Notes
              </div>
              <div className="mt-3 space-y-2">
                {notes.slice(0, 4).map((note) => (
                  <p key={note} className="text-xs leading-5 text-muted-foreground">
                    {note}
                  </p>
                ))}
              </div>
            </div>
          )}

          {responsePairs.length > 0 && (
            <div className="rounded-md border border-border/70 bg-background/60 p-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Parsed Decision Output
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {responsePairs.map((item) => (
                  <div key={item.key} className="rounded border border-border/60 bg-surface-2 px-3 py-2">
                    <p className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
                      {item.key.replaceAll("_", " ")}
                    </p>
                    <p className={cn("mt-1 text-xs leading-5 text-foreground", item.value.length > 80 && "font-mono")}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
