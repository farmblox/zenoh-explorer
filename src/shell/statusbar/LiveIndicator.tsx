import { Zid } from "@/components/domain";
import { StatusDot } from "@/components/ui";
import type { SessionSummary } from "@/ipc";
import { cn } from "@/lib/cn";
import { focusRingOnChrome, transitionFast } from "@/lib/states";
import { useLastChange, useTopologyStore } from "@/stores";

export interface LiveIndicatorProps {
  session: SessionSummary;
}

/**
 * Whether the explorer is connected, and whether what you are looking at is
 * current.
 *
 * One indicator, not two. Those are the same question here: Zenoh pushes, so a
 * connected session is a current view by construction. A second "live" light
 * beside this one would imply the two can disagree, and the first thing anyone
 * would do is try to work out which to believe.
 *
 * This is also what replaced the per-view refresh buttons. A refresh button in
 * a push system is not a control, it is a confession that the app does not
 * trust its own data. The click target survives for the one case the live
 * signals genuinely cannot see: `adminspace.enabled` being switched on
 * somewhere after the explorer already connected. Nothing announces that.
 */
export function LiveIndicator({ session }: LiveIndicatorProps) {
  const lastChange = useLastChange(session.id);
  const resync = useTopologyStore((state) => state.resync);
  const connected = session.transportCount > 0;

  return (
    <span className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => void resync(session.id)}
        title={
          connected
            ? "Following the network — the view updates itself. Click to re-read everything, which is only needed if a node's admin space was switched on after you connected."
            : "Connected to nothing. Click to try reading the network again."
        }
        className={cn(
          "rounded-inner -mx-1 flex shrink-0 items-center px-1",
          "hover:text-ink",
          focusRingOnChrome,
          transitionFast,
        )}
      >
        {/* Keyed on the last change, so each one remounts the dot and fires the
            ring exactly once. No timer, and no state tracking whether it is
            mid-animation. */}
        <StatusDot
          key={lastChange ?? "initial"}
          status={connected ? "live" : "degraded"}
          ping={lastChange !== null}
        />
      </button>

      {/* Outside the button. Clicking the id should copy it, not set off a
          full re-read of the network. */}
      <Zid zid={session.zid} copyable />
    </span>
  );
}
