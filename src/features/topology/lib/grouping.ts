/**
 * Turning a topology snapshot into the two levels the canvas draws.
 *
 * Pure functions, no React. Everything here is deterministic: the same snapshot
 * always produces the same grouping, which is what stops the graph rearranging
 * itself under the cursor between refreshes.
 */
import type { LinkSummary, NodeSummary, TopologySnapshot } from "@/ipc";

/** Nodes advertising no region end up here. */
export const UNGROUPED = "ungrouped";

/** One region and everything in it. */
export interface Region {
  readonly id: string;
  readonly nodes: readonly NodeSummary[];
  readonly routers: number;
  readonly peers: number;
  readonly clients: number;
  /** `true` when the explorer's own session is in this region. */
  readonly containsLocal: boolean;
}

/** A link between two regions, and how many node-level links it stands for. */
export interface RegionLink {
  readonly from: string;
  readonly to: string;
  readonly count: number;
}

/** Regions plus the links between them. */
export interface RegionView {
  readonly regions: readonly Region[];
  readonly links: readonly RegionLink[];
}

/**
 * Buckets nodes by region, largest first.
 *
 * Ordering by size rather than name keeps the biggest regions at the top-left
 * of the grid where the eye lands first, and it stays stable for a given
 * snapshot.
 */
export function buildRegionView(snapshot: TopologySnapshot): RegionView {
  const buckets = new Map<string, NodeSummary[]>();
  for (const node of snapshot.nodes) {
    const key = node.region ?? UNGROUPED;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(node);
    else buckets.set(key, [node]);
  }

  const regions: Region[] = [...buckets]
    .map(([id, nodes]) => ({
      id,
      nodes: [...nodes].sort(byKindThenName),
      routers: nodes.filter((n) => n.kind === "router").length,
      peers: nodes.filter((n) => n.kind === "peer").length,
      clients: nodes.filter((n) => n.kind === "client").length,
      containsLocal: nodes.some((n) => n.isLocal),
    }))
    // Size descending, then name, so ties do not reshuffle between refreshes.
    .sort((a, b) => b.nodes.length - a.nodes.length || a.id.localeCompare(b.id));

  const regionOf = new Map(snapshot.nodes.map((n) => [n.zid, n.region ?? UNGROUPED]));
  const tallies = new Map<string, RegionLink>();

  for (const link of snapshot.links) {
    const from = regionOf.get(link.from);
    const to = regionOf.get(link.to);
    // Links inside one region are drawn at the node level, not here.
    if (!from || !to || from === to) continue;

    const key = from <= to ? `${from} ${to}` : `${to} ${from}`;
    const existing = tallies.get(key);
    if (existing) tallies.set(key, { ...existing, count: existing.count + 1 });
    else tallies.set(key, { from, to, count: 1 });
  }

  return { regions, links: [...tallies.values()] };
}

/** A snapshot narrowed to one region, plus what holds it to the network. */
export interface NarrowedRegion {
  readonly nodes: readonly NodeSummary[];
  readonly links: readonly LinkSummary[];
  /**
   * Zids drawn only because something inside the group links to them.
   *
   * The canvas and the list draw these as context so the count of what is IN
   * the region stays honest.
   */
  readonly anchors: ReadonlySet<string>;
}

/**
 * Narrows a snapshot to one region, keeping the nodes that anchor it.
 *
 * Dropping every link that leaves the region produces orphans rather than a
 * smaller network, and on a real Zenoh topology that is the common case, not the
 * edge case. A client holds exactly one transport — to its router — and never
 * peers with anything, so a region of clients has no internal links at all: keep
 * only what is inside it and you get a row of nodes floating in empty canvas,
 * each labelled "no links". The routers they hang off are the whole answer to
 * "how is this region attached", so they come too, marked as context.
 *
 * Every drawn link touches the region. A link between two anchors belongs to
 * whichever region those two are in, not to this one.
 */
export function narrowToRegion(snapshot: TopologySnapshot, region: string): NarrowedRegion {
  const inside = new Set(
    snapshot.nodes.filter((node) => (node.region ?? UNGROUPED) === region).map((node) => node.zid),
  );

  const anchors = new Set<string>();
  for (const link of snapshot.links) {
    if (inside.has(link.from) === inside.has(link.to)) continue;
    anchors.add(inside.has(link.from) ? link.to : link.from);
  }

  const drawn = new Set([...inside, ...anchors]);
  return {
    nodes: snapshot.nodes.filter((node) => drawn.has(node.zid)),
    links: snapshot.links.filter(
      (link) =>
        drawn.has(link.from) &&
        drawn.has(link.to) &&
        (inside.has(link.from) || inside.has(link.to)),
    ),
    anchors,
  };
}

/** Routers first, then peers, then clients; alphabetical within each. */
function byKindThenName(a: NodeSummary, b: NodeSummary): number {
  const rank = { router: 0, peer: 1, client: 2 } as const;
  return rank[a.kind] - rank[b.kind] || label(a).localeCompare(label(b));
}

/** What the node is called on screen. */
export function label(node: NodeSummary): string {
  return node.name ?? node.zid.slice(0, 8);
}
