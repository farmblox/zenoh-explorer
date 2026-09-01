/**
 * Where things go on the canvas.
 *
 * Region cards are placed by hand — there are a handful of them and a grid is
 * the right answer. The node graph is laid out by dagre, because a Zenoh region
 * is a real graph with cycles in it and every hand-rolled attempt at one ends
 * up as either a hairball or a set of columns that ignores the edges.
 *
 * Deterministic either way. A force simulation would look livelier and would
 * also settle somewhere different every time you opened it, which makes "did
 * that node move?" impossible to answer.
 */
import dagre from "@dagrejs/dagre";

import type { LinkSummary, NodeSummary } from "@/ipc";
import type { Region } from "./grouping";

/** A position on the canvas. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Region card, at the top level. */
export const REGION_SIZE = { width: 272, height: 212 } as const;

/**
 * Node card dimensions, per role.
 *
 * A router is the widest and a client the smallest, so the shape of the graph
 * carries the shape of the network before a single label is read. dagre needs
 * these to reserve the right space, so they live here rather than in the card.
 */
export const NODE_SIZE = {
  router: { width: 196, height: 38 },
  peer: { width: 184, height: 38 },
  client: { width: 168, height: 34 },
} as const;

/** Gap between region cards. */
const REGION_GAP = 56;

/**
 * Lays region cards out in a grid.
 *
 * Columns come from the count so the grid stays roughly square, instead of
 * becoming one long row at eight regions and one long column at three.
 */
export function layoutRegions(regions: readonly Region[]): Map<string, Point> {
  const columns = Math.max(1, Math.ceil(Math.sqrt(regions.length)));
  const stepX = REGION_SIZE.width + REGION_GAP;
  const stepY = REGION_SIZE.height + REGION_GAP;

  return new Map(
    regions.map((region, index) => [
      region.id,
      { x: (index % columns) * stepX, y: Math.floor(index / columns) * stepY },
    ]),
  );
}

/**
 * Lays out a region's nodes as the graph they actually are.
 *
 * Left to right, ranked by distance from the backbone: routers land on the
 * left, whatever attaches to them to their right, and so on outwards. That is
 * Zenoh's own shape — `north` carries router-to-router links and peers hang
 * below a router — so the arrangement says something true rather than just
 * being tidy.
 *
 * dagre handles the parts that made this hard by hand: peer-to-peer links make
 * cycles, which it breaks; nodes reached by no link still get a rank; and edges
 * are routed so they cross as little as the ranking allows.
 */
export function layoutGraph(
  nodes: readonly NodeSummary[],
  links: readonly LinkSummary[],
): Map<string, Point> {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: "LR",
    // Generous, because these are cards with text rather than dots, and edges
    // need room to separate before they reach one.
    ranksep: 140,
    nodesep: 28,
    ranker: "network-simplex",
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    const size = NODE_SIZE[node.kind];
    graph.setNode(node.zid, { width: size.width, height: size.height });
  }

  const present = new Set(nodes.map((node) => node.zid));
  for (const link of links) {
    // A link to something outside this region has nothing to attach to here.
    if (present.has(link.from) && present.has(link.to)) graph.setEdge(link.from, link.to);
  }

  dagre.layout(graph);

  const positions = new Map<string, Point>();
  for (const node of nodes) {
    // dagre's own types resolve to `any` here, so the shape is named rather
    // than inferred.
    const placed = graph.node(node.zid) as { x: number; y: number } | undefined;
    if (!placed) continue;
    const size = NODE_SIZE[node.kind];
    // dagre reports a centre; React Flow positions by the top-left corner.
    positions.set(node.zid, {
      x: Math.round(placed.x - size.width / 2),
      y: Math.round(placed.y - size.height / 2),
    });
  }

  return positions;
}
