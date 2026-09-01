import type { TopologySnapshot } from "@/ipc";

/** A warning about how much of the network answered, phrased. */
export interface Coverage {
  /** Short enough for a badge, and specific: a count, not a category. */
  readonly label: string;
  /** What it means and what to do, for the tooltip. */
  readonly detail: string;
}

/**
 * Says how much of the graph is on somebody else's word.
 *
 * `null` when every node described itself, which is the only case worth saying
 * nothing about.
 *
 * The label names the count and the condition — `2 unresponsive` — rather than a
 * category. "Partial view" said nothing about what was missing or how much, so
 * it read as a permanent property of the tool instead of a fact about this
 * network. The tooltip carries the explanation.
 */
export function describeCoverage(snapshot: TopologySnapshot): Coverage | null {
  const count = snapshot.unverifiedNodes;
  if (count === 0) return null;

  return {
    label: `${count} unresponsive`,
    detail:
      count === 1
        ? "One node is in the graph because another node reported a session to it. Its own admin space did not reply, so its role, name and other links are unknown. Zenoh leaves adminspace.enabled off by default."
        : `${count} nodes are in the graph because other nodes reported sessions to them. Their own admin spaces did not reply, so their roles, names and other links are unknown. Zenoh leaves adminspace.enabled off by default.`,
  };
}
