import { Plus, X } from "lucide-react";

import { StatusDot } from "@/components/ui";
import { cn } from "@/lib/cn";
import { groupedNumber } from "@/lib/format";
import { transitionFast } from "@/lib/states";
import { useSessionStore, useUiStore } from "@/stores";

/**
 * The session tab strip.
 *
 * One tab per open Zenoh session, plus a tab for each connection attempt still
 * in flight — so clicking Connect gives immediate feedback rather than a dialog
 * that sits there while a TCP connect times out.
 */
export function SessionTabs() {
  const sessions = useSessionStore((state) => state.sessions);
  const pending = useSessionStore((state) => state.pending);
  const activeId = useSessionStore((state) => state.activeId);
  const setActive = useSessionStore((state) => state.setActive);
  const disconnect = useSessionStore((state) => state.disconnect);
  const dismissPending = useSessionStore((state) => state.dismissPending);
  const openOverlay = useUiStore((state) => state.openOverlay);

  return (
    // No drag attribute needed: the title bar above is marked "deep", so the
    // empty space here drags while the buttons inside keep their clicks.
    <div className="flex min-w-0 flex-1 items-center gap-1 px-3">
      {sessions.map((session) => {
        const active = session.id === activeId;
        return (
          <div
            key={session.id}
            className={cn(
              "group flex h-7 shrink-0 items-center gap-2 rounded-full pr-1.5 pl-3.5",
              transitionFast,
              active ? "bg-surface-2" : "hover:bg-surface-2/60",
            )}
          >
            <button
              type="button"
              onClick={() => setActive(session.id)}
              className="text-small flex items-center gap-2"
              aria-current={active ? "page" : undefined}
            >
              <StatusDot status={session.transportCount > 0 ? "live" : "degraded"} />
              <span className={cn("max-w-40 truncate", active ? "text-ink" : "text-ink-muted")}>
                {session.profile.name}
              </span>
              <span className="numeric text-tiny text-ink-faint">
                {groupedNumber(session.transportCount)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void disconnect(session.id)}
              aria-label={`Close ${session.profile.name}`}
              className={cn(
                "text-ink-faint flex size-4 items-center justify-center rounded-full",
                "hover:text-ink opacity-0 transition-opacity group-hover:opacity-100",
                "focus-visible:opacity-100",
              )}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}

      {pending.map((attempt) => (
        <div
          key={attempt.key}
          className={cn(
            "text-small flex h-7 shrink-0 items-center gap-2 rounded-full px-3.5",
            attempt.error ? "bg-danger-subtle text-danger" : "bg-surface-2 text-ink-muted",
          )}
          title={attempt.error ?? "Connecting…"}
        >
          <StatusDot status={attempt.error ? "down" : "connecting"} pulse={!attempt.error} />
          <span className="max-w-40 truncate">{attempt.profile.name}</span>
          {attempt.error ? (
            <button
              type="button"
              onClick={() => dismissPending(attempt.key)}
              aria-label="Dismiss failed connection"
            >
              <X size={11} />
            </button>
          ) : null}
        </div>
      ))}

      <button
        type="button"
        onClick={() => openOverlay("connect")}
        title="Connect to a network"
        aria-label="Connect to a network"
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          "text-ink-faint hover:bg-surface-2 hover:text-ink",
          transitionFast,
        )}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
