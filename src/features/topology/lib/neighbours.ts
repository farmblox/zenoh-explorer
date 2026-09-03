import type { LinkSummary, NodeSummary, TopologySnapshot } from "@/ipc";
import { isObservedOnlyLink } from "./edgeStyle";

/** One link off a node, with whatever is known about the far end. */
export interface Neighbour {
  readonly link: LinkSummary;
  readonly zid: string;
  /** `undefined` when the far end is named by a link but is not in the graph. */
  readonly node: NodeSummary | undefined;
  /** A router transport seen in sessions but absent from link-state. */
  readonly observedOnly: boolean;
}

/**
 * Every link touching one node, resolved to the node at the other end.
 *
 * Shared so the inspector panel and the node detail page cannot disagree about
 * how many links a node has, or which of them sit outside link-state. Links are stored
 * undirected, so `from` is whichever end reported it and either can be ours.
 */
export function neighboursOf(zid: string, snapshot: TopologySnapshot): readonly Neighbour[] {
  const byZid = new Map(snapshot.nodes.map((node) => [node.zid, node]));

  return snapshot.links
    .filter((link) => link.from === zid || link.to === zid)
    .map((link) => {
      const other = link.from === zid ? link.to : link.from;
      return {
        link,
        zid: other,
        node: byZid.get(other),
        observedOnly: isObservedOnlyLink(link, byZid),
      };
    });
}

/** How many router transports are absent from the current link-state map. */
export function observedOnlyCount(neighbours: readonly Neighbour[]): number {
  return neighbours.filter(({ observedOnly }) => observedOnly).length;
}

/** One direct neighbour, plus where IT goes. */
export interface Hop {
  readonly link: LinkSummary;
  readonly zid: string;
  readonly node: NodeSummary | undefined;
  /** A router transport seen in sessions but absent from link-state. */
  readonly observedOnly: boolean;
  /**
   * The neighbour's own other links, one hop further out.
   *
   * Excludes the node we started from — it is the thing being described, not a
   * discovery about its neighbour.
   */
  readonly onward: readonly NodeSummary[];
  /**
   * `true` when this neighbour has no link except the one to our node.
   *
   * Operationally the most important fact on the page: it means our node is
   * that neighbour's only path to the rest of the network, so losing it takes
   * the neighbour with it. A Zenoh client is single-homed by definition; a peer
   * or router that is single-homed usually is not meant to be.
   */
  readonly singleHomed: boolean;
}

/**
 * A node's neighbourhood, two hops deep.
 *
 * One hop answers "what is this attached to", which a link list already does.
 * Two answers the questions people actually open a node for: is this the only
 * way anything reaches that peer, and if this node goes away what goes with it.
 *
 * Only nodes and links already in the snapshot are consulted — this walks the
 * graph we have rather than querying for more, so it costs nothing and never
 * shows a hop the rest of the view does not.
 */
export function neighbourhoodOf(zid: string, snapshot: TopologySnapshot): readonly Hop[] {
  const byZid = new Map(snapshot.nodes.map((node) => [node.zid, node]));

  /** Every zid each node links to, built once rather than per neighbour. */
  const adjacency = new Map<string, Set<string>>();
  for (const link of snapshot.links) {
    for (const [a, b] of [
      [link.from, link.to],
      [link.to, link.from],
    ] as const) {
      const set = adjacency.get(a) ?? new Set<string>();
      set.add(b);
      adjacency.set(a, set);
    }
  }

  return neighboursOf(zid, snapshot).map(({ link, zid: other, node, observedOnly }) => {
    const onwardZids = [...(adjacency.get(other) ?? [])].filter((candidate) => candidate !== zid);
    const onward = onwardZids
      .map((candidate) => byZid.get(candidate))
      .filter((candidate): candidate is NodeSummary => candidate !== undefined);

    return { link, zid: other, node, observedOnly, onward, singleHomed: onwardZids.length === 0 };
  });
}

/** How many neighbours reach the network only through this node. */
export function singleHomedCount(hops: readonly Hop[]): number {
  return hops.filter((hop) => hop.singleHomed).length;
}
