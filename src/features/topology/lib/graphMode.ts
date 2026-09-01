import type { DiscoverySource, NodeSummary, TopologySnapshot } from "@/ipc";
import { UNGROUPED } from "./grouping";

/**
 * How the canvas divides the network up.
 *
 * Three questions, not three skins. Region answers "how is this deployment
 * organised", router answers "who routes for whom", flat answers "what is
 * actually out there". A network that looks tidy grouped by region can look
 * alarming grouped by router, and that difference is the diagnosis.
 */
export type GraphMode = "region" | "router" | "flat";

export const GRAPH_MODES = [
  { value: "region", label: "Region" },
  { value: "router", label: "Router" },
  { value: "flat", label: "Flat" },
] as const satisfies ReadonlyArray<{ value: GraphMode; label: string }>;

/**
 * Whether we know this node first-hand.
 *
 * `adminSpace` means the node described itself; `transport` means we hold a
 * session to it. Everything else is hearsay — somebody else told us it exists,
 * and it may not be reachable, may have gone away, or may never have been what
 * was claimed.
 *
 * The graph draws the difference, because a topology tool that renders a rumour
 * identically to a fact is worse than one that shows less.
 */
export function isFirsthand(source: DiscoverySource): boolean {
  return source === "adminSpace" || source === "transport";
}

/** Nodes attached to no router at all. */
export const UNROUTED = "no router";

/**
 * Which sources of truth the graph is drawn from.
 *
 * Zenoh tells you about a node in several ways and they are not equally
 * trustworthy. A node that answered its own admin space described itself; one
 * seen only in a scout reply is a claim someone else made. Being able to strip
 * the graph back to what it knows first-hand is the difference between reading
 * a topology and guessing at one.
 */
export type SourceFilter = "all" | DiscoverySource;

/** Label and one-line meaning for each source, in descending confidence. */
export const SOURCE_LABELS: Record<DiscoverySource, string> = {
  adminSpace: "Admin space",
  transport: "Open transports",
  linkState: "Link-state",
  liveliness: "Liveliness tokens",
  scouting: "Scout replies",
};

/** The order sources appear in the menu: strongest evidence first. */
const SOURCE_ORDER: readonly DiscoverySource[] = [
  "adminSpace",
  "transport",
  "linkState",
  "liveliness",
  "scouting",
];

export interface SourceOption {
  readonly value: SourceFilter;
  readonly label: string;
  readonly count: number;
}

/** Every source present in this snapshot, with how many nodes came from it. */
export function sourceOptions(snapshot: TopologySnapshot): readonly SourceOption[] {
  const counts = new Map<DiscoverySource, number>();
  for (const node of snapshot.nodes) {
    counts.set(node.source, (counts.get(node.source) ?? 0) + 1);
  }

  return [
    { value: "all" as const, label: "Every source", count: snapshot.nodes.length },
    // Only sources this snapshot actually contains: a menu of four zeroes
    // describes the tool, not the network.
    ...SOURCE_ORDER.filter((source) => counts.has(source)).map((source) => ({
      value: source,
      label: SOURCE_LABELS[source],
      count: counts.get(source) ?? 0,
    })),
  ];
}

/** Narrows a snapshot to nodes from one source, dropping links that lose an end. */
export function applySourceFilter(
  snapshot: TopologySnapshot,
  filter: SourceFilter,
): TopologySnapshot {
  if (filter === "all") return snapshot;

  const nodes = snapshot.nodes.filter((node) => node.source === filter);
  const kept = new Set(nodes.map((node) => node.zid));

  return {
    ...snapshot,
    nodes,
    links: snapshot.links.filter((link) => kept.has(link.from) && kept.has(link.to)),
  };
}

/**
 * Which box each node belongs in, under the current mode.
 *
 * Router mode walks the links rather than trusting metadata: a node's router is
 * whichever router it actually holds a link to, and a node holding links to two
 * routers is filed under the first by zid so the answer is stable between
 * refreshes.
 */
export function groupNodes(
  snapshot: TopologySnapshot,
  mode: GraphMode,
): ReadonlyMap<string, string> {
  const groups = new Map<string, string>();
  if (mode === "flat") return groups;

  if (mode === "region") {
    for (const node of snapshot.nodes) groups.set(node.zid, node.region ?? UNGROUPED);
    return groups;
  }

  const routers = new Set(
    snapshot.nodes.filter((node) => node.kind === "router").map((node) => node.zid),
  );
  const attached = new Map<string, string[]>();

  for (const link of snapshot.links) {
    if (routers.has(link.from) && !routers.has(link.to)) {
      attached.set(link.to, [...(attached.get(link.to) ?? []), link.from]);
    }
    if (routers.has(link.to) && !routers.has(link.from)) {
      attached.set(link.from, [...(attached.get(link.from) ?? []), link.to]);
    }
  }

  for (const node of snapshot.nodes) {
    if (routers.has(node.zid)) {
      groups.set(node.zid, node.zid);
      continue;
    }
    const [first] = (attached.get(node.zid) ?? []).sort();
    groups.set(node.zid, first ?? UNROUTED);
  }

  return groups;
}

/** What a group box is called, given the mode that produced it. */
export function groupLabel(
  groupId: string,
  mode: GraphMode,
  nodes: readonly NodeSummary[],
): string {
  if (mode !== "router") return groupId;
  if (groupId === UNROUTED) return UNROUTED;
  const router = nodes.find((node) => node.zid === groupId);
  return router?.name ?? groupId.slice(0, 8);
}
