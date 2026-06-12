import { useState } from "react";
import { ChevronDown, ChevronRight, Database, FileSearch, ShieldCheck, Sparkles, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

interface EvidenceSection {
  id: string;
  title: string;
  icon: typeof Database;
  status: string;
  content: EvidenceItem[];
}

interface EvidenceItem {
  label: string;
  value: string;
  source?: string;
  updated?: string;
}

interface EvidenceDrawerProps {
  sections: EvidenceSection[];
}

function EvidenceSectionCard({ section, defaultOpen }: { section: EvidenceSection; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = section.icon;

  return (
    <div className="rounded-md border border-border/70 bg-background/60">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2/50"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-primary" />
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-foreground">{section.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[0.6rem] uppercase tracking-[0.14em]",
            section.status === "Warning" && "text-warning",
            section.status === "Retrieved" && "text-success",
            section.status === "Blocked" && "text-destructive",
            section.status === "Info" && "text-muted-foreground",
          )}>
            {section.status}
          </span>
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border/50 px-3 py-2.5">
          {section.content.map((item) => (
            <div key={item.label} className="rounded border border-border/40 bg-surface-2/50 px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">{item.label}</p>
                <p className="text-right text-[0.6rem] text-muted-foreground/60">{item.value}</p>
              </div>
              <div className="mt-0.5 flex items-center gap-3">
                <p className="text-xs font-medium text-cream">{item.label === "Status" ? "" : item.value}</p>
                {item.source && <span className="text-[0.55rem] text-muted-foreground/50">Source: {item.source}</span>}
                {item.updated && <span className="text-[0.55rem] text-muted-foreground/50">Updated: {item.updated}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EvidenceDrawer({ sections }: EvidenceDrawerProps) {
  if (sections.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent">
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-primary" />
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-primary">Evidence Used</p>
        </div>
        <span className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">{sections.length} sections</span>
      </div>
      <div className="space-y-2 p-3">
        {sections.map((section, i) => (
          <EvidenceSectionCard key={section.id} section={section} defaultOpen={i < 2} />
        ))}
      </div>
    </div>
  );
}

export function buildEvidenceSections(
  retrievalItems: string[],
  constraints: string[],
  notes: string[],
  parsedResponse: Record<string, unknown> | null,
): EvidenceSection[] {
  const sections: EvidenceSection[] = [];

  if (retrievalItems.length > 0) {
    sections.push({
      id: "signals",
      title: "Retrieved Signals",
      icon: Database,
      status: "Retrieved",
      content: retrievalItems.map((item) => {
        const [key, ...rest] = item.split(":");
        return {
          label: key,
          value: rest.join(":") || "active",
          source: "API",
        };
      }),
    });
  }

  if (constraints.length > 0) {
    sections.push({
      id: "guardrails",
      title: "Guardrails Applied",
      icon: ShieldCheck,
      status: constraints.some((c) => c.toLowerCase().includes("veto") || c.toLowerCase().includes("block"))
        ? "Blocked"
        : "Active",
      content: constraints.map((c) => ({
        label: "Constraint",
        value: c,
      })),
    });
  }

  if (notes.length > 0) {
    sections.push({
      id: "diagnostics",
      title: "Diagnostic Notes",
      icon: Stethoscope,
      status: "Info",
      content: notes.slice(0, 5).map((n) => ({
        label: "Note",
        value: n,
      })),
    });
  }

  if (parsedResponse && Object.keys(parsedResponse).length > 0) {
    const pairs = Object.entries(parsedResponse)
      .map(([key, value]) => ({
        label: key.replaceAll("_", " "),
        value: value == null ? "null" : typeof value === "object" ? JSON.stringify(value) : String(value),
      }))
      .slice(0, 6);
    if (pairs.length > 0) {
      sections.push({
        id: "parsed",
        title: "Parsed Decision Output",
        icon: Sparkles,
        status: "Retrieved",
        content: pairs,
      });
    }
  }

  return sections;
}
