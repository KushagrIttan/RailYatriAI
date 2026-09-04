import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import type { LogEntry } from "@/lib/railblock/types";

const LEVEL_CLASS: Record<LogEntry["level"], string> = {
  info: "text-muted-foreground",
  warn: "text-warning",
  error: "text-destructive",
  success: "text-success",
};

export function LogStream({ logs }: { logs: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [logs]);

  return (
    <div className="panel-surface flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Terminal className="size-3.5 text-success" />
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Live Agent Audit Log
        </span>
        <span className="animate-led ml-auto size-2 rounded-full bg-success text-success" />
      </div>
      <div ref={ref} className="num min-h-40 flex-1 space-y-1 overflow-y-auto bg-background/60 p-3 text-[11px] leading-relaxed">
        {logs.map((l) => (
          <div key={l.id} className="flex gap-2">
            <span className="shrink-0 text-muted-foreground/70">[{l.time}]</span>
            <span className={LEVEL_CLASS[l.level]}>{l.message}</span>
          </div>
        ))}
        <div className="flex gap-2 text-success">
          <span>›</span>
          <span className="inline-block h-3 w-2 animate-pulse bg-success" />
        </div>
      </div>
    </div>
  );
}
