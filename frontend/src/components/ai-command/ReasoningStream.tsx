import { useEffect, useState, useRef } from "react";
import { Terminal } from "lucide-react";

interface ReasoningStreamProps {
  lines: string[];
  isActive: boolean;
}

export function ReasoningStream({ lines, isActive }: ReasoningStreamProps) {
  const [visibleLines, setVisibleLines] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive) {
      setVisibleLines(lines.length);
      return;
    }
    if (visibleLines < lines.length) {
      const timer = setTimeout(() => setVisibleLines((v) => v + 1), 400);
      return () => clearTimeout(timer);
    }
  }, [isActive, lines.length, visibleLines]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleLines]);

  return (
    <section className="rounded-xl border border-yellow-900/40 bg-black/60 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Terminal className="h-4 w-4 text-yellow-500" />
        <p className="text-xs uppercase tracking-[0.18em] text-yellow-500">AI Reasoning Stream</p>
        {isActive && <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
      </div>
      <div className="max-h-64 space-y-1.5 overflow-y-auto font-mono text-sm">
        {lines.slice(0, visibleLines).map((line, i) => (
          <p key={i} className={`leading-6 ${line.startsWith("Recommendation") || line.startsWith("Risk") ? "text-yellow-400" : "text-white/70"}`}>
            <span className="text-white/30">{String(i + 1).padStart(2, "0")} </span>
            {line}
          </p>
        ))}
        {isActive && visibleLines < lines.length && (
          <p className="animate-pulse text-white/30">
            <span className="text-white/30">{String(visibleLines + 1).padStart(2, "0")} </span>
            Analyzing...
          </p>
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
