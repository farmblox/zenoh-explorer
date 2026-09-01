import type { LinkSummary, NodeSummary, TopologySnapshot } from "@/ipc";
import { label } from "./grouping";

/** One node along a path, and the link that got there. */
export interface RouteHop {
  readonly node: NodeSummary;
  /** Protocol of the link from the previous hop. Null on the first hop. */
  readonly protocol: string | null;
  /** `true` when the link into this hop was reported by only one end. */
  readonly unconfirmed: boolean;
}

export interface Route {
  readonly hops: readonly RouteHop[];
  /** Hops that carry a caveat — an unconfirmed link into them. */
  readonly warnings: number;
  /** Set when no path exists through the links we can see. */
  readonly unreachable: boolean;
}

/**
 * The shortest path from a node to this explorer's own session.
 *
 * "How does what this node publishes actually reach me" is the question a
 * topology view exists to answer, and it is the one route we can compute
 * honestly: both endpoints are known and every link on the way was reported by
 * a node we talked to.
 *
 * Breadth-first, so the result is the fewest hops rather than the fastest —
 * Zenoh's own link weights are not in the snapshot, and inventing a cost
 * function would produce a confident answer to a question we cannot answer.
 */
export function traceToLocal(snapshot: TopologySnapshot, fromZid: string): Route {
  const byZid = new Map(snapshot.nodes.map((node) => [node.zid, node]));
  const adjacency = new Map<string, LinkSummary[]>();

  for (const link of snapshot.links) {
    adjacency.set(link.from, [...(adjacency.get(link.from) ?? []), link]);
    adjacency.set(link.to, [...(adjacency.get(link.to) ?? []), link]);
  }

  const cameFrom = new Map<string, { previous: string; link: LinkSummary }>();
  const seen = new Set([fromZid]);
  const queue = [fromZid];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (current === snapshot.localZid) break;

    for (const link of adjacency.get(current) ?? []) {
      const next = link.from === current ? link.to : link.from;
      if (seen.has(next)) continue;
      seen.add(next);
      cameFrom.set(next, { previous: current, link });
      queue.push(next);
    }
  }

  const start = byZid.get(fromZid);
  if (!start) return { hops: [], warnings: 0, unreachable: true };
  if (!seen.has(snapshot.localZid)) {
    return {
      hops: [{ node: start, protocol: null, unconfirmed: false }],
      warnings: 0,
      unreachable: true,
    };
  }

  // Walk back from the destination, then reverse: the path is discovered
  // end-first, but it is read start-first.
  const reversed: RouteHop[] = [];
  let cursor = snapshot.localZid;

  while (cursor !== fromZid) {
    const step = cameFrom.get(cursor);
    const node = byZid.get(cursor);
    if (!step || !node) break;
    reversed.push({
      node,
      protocol: step.link.protocol,
      unconfirmed: !step.link.bidirectional,
    });
    cursor = step.previous;
  }

  const hops = [{ node: start, protocol: null, unconfirmed: false }, ...reversed.reverse()];

  return {
    hops,
    warnings: hops.filter((hop) => hop.unconfirmed).length,
    unreachable: false,
  };
}

/** How the route reads in one line, for the panel's header. */
export function describeRoute(route: Route): string {
  if (route.unreachable) return "No path through the links we can see";
  const hops = route.hops.length - 1;
  return `${hops} ${hops === 1 ? "hop" : "hops"} to this explorer`;
}

/** The two ends of the route, named. */
export function routeTitle(route: Route): string {
  const first = route.hops[0];
  const last = route.hops[route.hops.length - 1];
  if (!first) return "";
  if (!last || last === first) return label(first.node);
  return `${label(first.node)} → ${label(last.node)}`;
}
