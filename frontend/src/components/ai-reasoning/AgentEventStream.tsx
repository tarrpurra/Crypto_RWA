import { useEffect, useRef } from "react";
import { Activity, AlertTriangle, XCircle, Info } from "lucide-react";
import type { AgentEvent } from "./types";

interface AgentEventStreamProps {
  events: AgentEvent[];
}

const levelIcon = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};

const levelColor = {
  info: "text-muted-foreground",
  warning: "text-warning",
  error: "text-destructive",
};

const levelDot = {
  info: "bg-muted-foreground",
  warning: "bg-warning",
  error: "bg-destructive",
};

export function AgentEventStream({ events }: AgentEventStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (events.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <Activity className="h-4 w-4 text-primary" />
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-primary">Live Agent Events</p>
        <span className="ml-auto text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">{events.length} events</span>
      </div>
      <div className="max-h-[240px] space-y-0 overflow-y-auto p-2">
        {events.map((event, i) => {
          const Icon = levelIcon[event.level];
          return (
            <div key={`${event.timestamp}-${i}`} className="flex items-start gap-2.5 rounded px-2.5 py-1.5 transition-colors hover:bg-surface-2/50">
              <div className="mt-1.5 flex shrink-0 flex-col items-center">
                <div className={`h-1.5 w-1.5 rounded-full ${levelDot[event.level]}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Icon className={`h-3 w-3 ${levelColor[event.level]}`} />
                  <span className="text-[0.6rem] font-medium text-muted-foreground/70">{event.timestamp}</span>
                </div>
                <p className={`text-xs leading-5 ${levelColor[event.level]}`}>{event.message}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
