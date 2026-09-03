import type { TopologySnapshot } from "@/ipc";

/** A warning about how much of the network answered, phrased. */
export interface Coverage {
  /** Short enough for a badge, and specific: a count, not a category. */
  readonly label: string;
  /** What it means and what to do, for the tooltip. */
  readonly detail: string;
}

/**
 * Says how many known routers did not answer their own status record.
 *
 * `null` when every known router answered. Peers and clients are supposed to be
 * learned from router session tables and are not coverage failures.
 *
 * The label names the count and the condition rather than a category. "Partial
 * view" said nothing about what was missing or how much, so it read as a
 * permanent property of the tool instead of a fact about this network.
 */
export function describeCoverage(snapshot: TopologySnapshot): Coverage | null {
  const count = snapshot.unverifiedNodes;
  if (count === 0) return null;

  return {
    label: count === 1 ? "1 router unreadable" : `${count} routers unreadable`,
    detail:
      count === 1
        ? "One known router did not answer at @/<zid>/router. Peers and links behind it may be missing. Enable readable adminspace on that router."
        : `${count} known routers did not answer at @/<zid>/router. Peers and links behind them may be missing. Enable readable adminspace on those routers.`,
  };
}
