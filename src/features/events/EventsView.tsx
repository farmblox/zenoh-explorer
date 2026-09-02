import { useEffect } from "react";
import { ScrollText, Trash2 } from "lucide-react";

import { Badge, Button, EmptyState, ScrollArea } from "@/components/ui";
import type { DiagnosticLevel } from "@/ipc";
import { timeOfDay } from "@/lib/format";
import { useDiagnosticsStore } from "@/stores";
import { ViewHeader } from "@/shell/ViewHeader";

const TONE = {
  info: "neutral",
  warning: "warn",
  error: "danger",
} as const satisfies Record<DiagnosticLevel, "neutral" | "warn" | "danger">;

/**
 * The events log.
 *
 * The view of last resort. When a topology probe comes back empty or a tap
 * stops on its own, the reason is here — including the hint the backend
 * attached, which is usually the actual fix.
 */
export function EventsView() {
  const entries = useDiagnosticsStore((state) => state.entries);
  const markRead = useDiagnosticsStore((state) => state.markRead);
  const clear = useDiagnosticsStore((state) => state.clear);

  // Opening the view is what "reading" means; clear the sidebar badge.
  useEffect(() => markRead(), [markRead]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title="Events"
        actions={
          <Button variant="ghost" icon={<Trash2 size={13} />} onClick={clear}>
            Clear
          </Button>
        }
      />
      {entries.length === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          title="Nothing yet"
          description="Diagnostics from the backend appear here — failed probes, dropped transports and anything else that happens without you asking."
        />
      ) : (
        <ScrollArea className="flex-1">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="border-line-soft text-small flex gap-3 border-b px-5 py-2.5"
            >
              <span className="numeric text-tiny text-ink-faint shrink-0">
                {timeOfDay(entry.at)}
              </span>
              <Badge tone={TONE[entry.level]} className="shrink-0">
                {entry.level}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="selectable text-ink">{entry.message}</p>
                {entry.hint ? (
                  <p className="selectable text-tiny text-ink-faint mt-0.5">{entry.hint}</p>
                ) : null}
              </div>
            </article>
          ))}
        </ScrollArea>
      )}
    </div>
  );
}
