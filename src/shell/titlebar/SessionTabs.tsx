import { Plus } from "lucide-react";

import { cn } from "@/lib/cn";
import { groupedNumber } from "@/lib/format";
import { focusRingOnChrome, transitionFast } from "@/lib/states";
import { useSessionStore, useUiStore } from "@/stores";
import { SessionTab } from "./SessionTab";

/**
 * The session tab strip.
 *
 * One tab per open Zenoh session, plus a tab for each connection attempt still
 * in flight — so clicking Connect gives immediate feedback rather than a dialog
 * that sits there while a TCP connect times out.
 *
 * An attempt looks the same as a session and closes the same way. It is the
 * same thing at a different point in its life, and a tab you cannot close
 * because it has not finished opening is the one you most want to be rid of.
 */
export function SessionTabs() {
  const sessions = useSessionStore((state) => state.sessions);
  const pending = useSessionStore((state) => state.pending);
  const activeTab = useSessionStore((state) => state.activeTab);
  const setActive = useSessionStore((state) => state.setActive);
  const disconnect = useSessionStore((state) => state.disconnect);
  const dismissPending = useSessionStore((state) => state.dismissPending);
  const editProfile = useSessionStore((state) => state.editProfile);
  const openOverlay = useUiStore((state) => state.openOverlay);

  return (
    // No drag attribute needed: the title bar above is marked "deep", so the
    // empty space here drags while the buttons inside keep their clicks.
    //
    // No left padding: the first tab's edge has to land on the content pane's,
    // and the title bar's left block is already exactly the sidebar's width.
    // The gap from the sidebar toggle comes from that block's own right padding
    // instead. (Collapsed, the two cannot line up — the traffic lights hold the
    // block at 122px while the pane moves in to 72px — and giving way there
    // would put the toggle under the window buttons, where it is both invisible
    // and unclickable.)
    <div className="flex min-w-0 flex-1 items-center gap-1 pr-3">
      {sessions.map((session) => (
        <SessionTab
          key={session.id}
          label={session.profile.name}
          state={session.transportCount > 0 ? "live" : "degraded"}
          selected={session.id === activeTab}
          meta={groupedNumber(session.transportCount)}
          title={
            session.transportCount > 0
              ? `${session.profile.name} — ${groupedNumber(session.transportCount)} transports`
              : `${session.profile.name} — connected to nothing`
          }
          onSelect={() => setActive(session.id)}
          onClose={() => void disconnect(session.id)}
          closeLabel={`Close ${session.profile.name}`}
        />
      ))}

      {pending.map((attempt) => (
        <SessionTab
          key={attempt.key}
          label={attempt.profile.name}
          state={attempt.error ? "failed" : "connecting"}
          selected={attempt.key === activeTab}
          title={attempt.error ?? `Connecting to ${attempt.profile.name}`}
          onSelect={() => {
            setActive(attempt.key);
            // A failed attempt kept its profile, so selecting it offers the
            // dialog back with those settings rather than a blank one.
            if (attempt.error) {
              editProfile(attempt.profile);
              openOverlay("connect");
            }
          }}
          onClose={() => dismissPending(attempt.key)}
          closeLabel={
            attempt.error
              ? `Dismiss the failed connection to ${attempt.profile.name}`
              : `Stop connecting to ${attempt.profile.name}`
          }
        />
      ))}

      <button
        type="button"
        onClick={() => openOverlay("connect")}
        title="Connect to a network"
        aria-label="Connect to a network"
        className={cn(
          "rounded-control flex size-9 shrink-0 items-center justify-center",
          "text-ink-faint hover:bg-surface-2 hover:text-ink",
          focusRingOnChrome,
          transitionFast,
        )}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
