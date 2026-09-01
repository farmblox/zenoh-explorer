import { useEffect, useState } from "react";

/**
 * Keeps a thing mounted long enough to animate itself out.
 *
 * React unmounts on `false`, which is why an overlay that fades in vanishes on
 * a hard cut — there is nothing left in the tree to animate. This holds the
 * node for one exit duration and reports which way it is going, so a component
 * can key its animation off `data-state` the way CSS wants to.
 *
 * Returns `mounted` (render it at all) and `state` (`"open"` while it should be
 * on screen, `"closed"` while it is leaving).
 *
 * The close is noticed during render rather than in an effect: an effect that
 * calls `setState` synchronously triggers a second render pass for something
 * already knowable from the props, and React's compiler rightly refuses it.
 * Adjusting state during render when a prop changes is the documented way to
 * do exactly this — and the previous value is held in STATE rather than a ref,
 * because a ref read during render is refused for the same reason.
 *
 * Entrances need no such care — they are keyframe animations, which run from
 * the moment the element mounts, so there is nothing to defer a frame for.
 */
export function usePresence(
  open: boolean,
  exitMs: number,
): { mounted: boolean; state: "open" | "closed" } {
  const [exiting, setExiting] = useState(false);
  const [previous, setPrevious] = useState(open);

  if (previous !== open) {
    setPrevious(open);
    setExiting(!open);
  }

  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => setExiting(false), exitMs);
    return () => clearTimeout(timer);
  }, [exiting, exitMs]);

  return { mounted: open || exiting, state: open ? "open" : "closed" };
}
