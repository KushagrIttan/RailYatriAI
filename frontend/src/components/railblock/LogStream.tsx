import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import type { LogEntry } from "@/lib/railblock/types";

const LEVEL_CLASS: Record<LogEntry["level"], string> = {
  info:    "text-muted-foreground",
  warn:    "text-warning",
  error:   "text-destructive",
  success: "text-success",
};

export function LogStream({ logs }: { logs: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [logs]);

  return (
    <div className="panel-surface overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-gray-50/60 px-4 py-2.5">
        <Terminal className="size-3.5 text-primary" />
        <span className="text-sm font-semibold text-foreground tracking-tight">
          Activity Log
        </span>
        <span className="animate-led ml-auto size-2 rounded-full bg-success" />
      </div>
      <div
        ref={ref}
        className="num max-h-40 space-y-1.5 overflow-y-auto p-4 text-[11px] leading-relaxed"
      >
        {logs.map((l) => (
          <div key={l.id} className="flex gap-2">
            <span className="shrink-0 text-muted-foreground/50">[{l.time}]</span>
            <span className={LEVEL_CLASS[l.level]}>{l.message}</span>
          </div>
        ))}
        <div className="flex gap-2 text-success">
          <span>›</span>
          <span className="inline-block h-3 w-2 animate-pulse bg-success/60" />
        </div>
      </div>
    </div>
  );
}
