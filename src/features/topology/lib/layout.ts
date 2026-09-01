/**
 * Where things go on the canvas.
 *
 * Deterministic and synchronous. A force simulation would look livelier and
 * would also mean the graph sits somewhere different every time you open it,
 * which makes "did that node move?" impossible to answer. Given the same
 * snapshot these functions always return the same coordinates.
 */
import type { LinkSummary, NodeSummary } from "@/ipc";
import type { Region } from "./grouping";

/** How a region's members are arranged. */
export type LayoutMode = "tree" | "rings";

/** The arrangements, for the control that picks between them. */
export const LAYOUTS = [
  { value: "tree", label: "Tree" },
  { value: "rings", label: "Rings" },
] as const satisfies ReadonlyArray<{ value: LayoutMode; label: string }>;

/** Region card dimensions, matched to the node card so the grid lines up. */
export const REGION_SIZE = { width: 272, height: 212 } as const;

/**
 * Node card dimensions, per role.
 *
 * A router is the widest and a client the smallest, so the graph encodes
 * importance in size before you read a single label.
 */
export const NODE_SIZE = {
  router: { width: 200, height: 46 },
  peer: { width: 190, height: 46 },
  client: { width: 170, height: 38 },
} as const;

/** Tallest card, for row spacing that works whatever a column holds. */
const ROW_HEIGHT = 46;

/** Gap between region cards. */
const REGION_GAP = 56;

/** A position on the canvas. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

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
 * Lays out the nodes inside a region as rings, one per role.
 *
 * Routers in the middle, peers around them, clients outside that. The shape
 * carries information: you can see at a glance whether a region is
 * router-heavy and which nodes are leaves. Within a ring, nodes keep the order
 * the grouping produced, so positions hold still across refreshes.
 */
export function layoutRegionNodes(nodes: readonly NodeSummary[]): Map<string, Point> {
  const rings: Record<NodeSummary["kind"], NodeSummary[]> = { router: [], peer: [], client: [] };
  for (const node of nodes) rings[node.kind].push(node);

  const positions = new Map<string, Point>();
  let radius = 0;

  for (const kind of ["router", "peer", "client"] as const) {
    const ring = rings[kind];
    if (ring.length === 0) continue;

    // A lone router belongs at the centre, not on a circle of radius zero.
    const only = ring[0];
    if (radius === 0 && ring.length === 1 && only) {
      positions.set(only.zid, { x: 0, y: 0 });
      radius = ringRadius(Math.max(1, rings.peer.length));
      continue;
    }

    radius = radius === 0 ? ringRadius(ring.length) : radius + ringGap(ring.length);
    placeOnCircle(ring, radius, positions);
  }

  return positions;
}

/** Radius that keeps `count` cards from overlapping on a circle. */
function ringRadius(count: number): number {
  const circumference = count * (NODE_SIZE.router.width + 48);
  return Math.max(180, circumference / (2 * Math.PI));
}

/** How much further out the next ring sits. */
function ringGap(count: number): number {
  return Math.max(ROW_HEIGHT + 90, ringRadius(count) * 0.55);
}

/** Distributes nodes evenly around a circle, starting at twelve o'clock. */
function placeOnCircle(
  nodes: readonly NodeSummary[],
  radius: number,
  into: Map<string, Point>,
): void {
  const step = (2 * Math.PI) / nodes.length;
  nodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + index * step;
    into.set(node.zid, {
      x: Math.round(Math.cos(angle) * radius),
      // Squashed vertically: a wide ellipse suits a landscape window better
      // than a circle, and keeps more of the graph on screen without zooming.
      y: Math.round(Math.sin(angle) * radius * 0.72),
    });
  });
}

/** Horizontal gap between columns in the tree layout. */
const COLUMN_GAP = 300;

/** Vertical gap between siblings in a column. */
const ROW_GAP = 24;

/**
 * Lays nodes out left to right by their distance from the backbone.
 *
 * Zenoh's own model is hierarchical — `north` carries router-to-router links
 * and `south` hangs peers and clients below a router — so a left-to-right tree
 * says something true about the network rather than being a tidier picture.
 *
 * Depth is breadth-first from the routers, following real links. A node reached
 * by no link falls into the column its role implies, so nothing is dropped and
 * a mesh with no clear root still lays out sensibly. Routers meshed with each
 * other share column 0 and their links become the vertical edges you expect.
 */
export function layoutTree(
  nodes: readonly NodeSummary[],
  links: readonly LinkSummary[],
): Map<string, Point> {
  const adjacency = new Map<string, string[]>();
  for (const link of links) {
    adjacency.set(link.from, [...(adjacency.get(link.from) ?? []), link.to]);
    adjacency.set(link.to, [...(adjacency.get(link.to) ?? []), link.from]);
  }

  // Routers are the backbone and therefore the roots. With no router at all,
  // every peer is its own root and the graph fans out from each.
  const roots = nodes.filter((node) => node.kind === "router");
  const seeds = roots.length > 0 ? roots : nodes.filter((node) => node.kind === "peer");

  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const node of seeds) {
    depth.set(node.zid, 0);
    queue.push(node.zid);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const currentDepth = depth.get(current) ?? 0;

    for (const neighbour of adjacency.get(current) ?? []) {
      if (depth.has(neighbour)) continue;
      depth.set(neighbour, currentDepth + 1);
      queue.push(neighbour);
    }
  }

  // Anything the walk never reached still needs a column; its role is the best
  // available guess at how far from the backbone it sits.
  const fallback = { router: 0, peer: 1, client: 2 } as const;
  const columns = new Map<number, NodeSummary[]>();
  for (const node of nodes) {
    const column = depth.get(node.zid) ?? fallback[node.kind];
    columns.set(column, [...(columns.get(column) ?? []), node]);
  }

  const positions = new Map<string, Point>();
  const tallest = Math.max(
    ...[...columns.values()].map((members) => members.length * (ROW_HEIGHT + ROW_GAP)),
    0,
  );

  for (const [column, members] of columns) {
    const height = members.length * (ROW_HEIGHT + ROW_GAP);
    // Each column is centred against the tallest, so the tree reads as a spine
    // rather than everything hanging from the top edge.
    const top = (tallest - height) / 2;

    members.forEach((node, index) => {
      positions.set(node.zid, {
        x: column * COLUMN_GAP,
        y: Math.round(top + index * (ROW_HEIGHT + ROW_GAP)),
      });
    });
  }

  return positions;
}

/* -------------------------------------------------------- grouped layout -- */

/** Inset from a group box's edge to the cards inside it. */
const GROUP_PADDING = 18;

/** Extra room at the top of a box for its floating label chip. */
const GROUP_HEADER = 30;

/** Gap between two group boxes. */
const GROUP_GAP = 40;

/** Vertical gap between cards stacked in a box. */
const STACK_GAP = 30;

/** Cards in one column before the box starts a second. */
const COLUMN_LIMIT = 8;

/** A dashed container drawn behind a set of nodes. */
export interface GroupBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly NodeSummary[];
}

export interface GroupedLayout {
  readonly positions: Map<string, Point>;
  readonly boxes: readonly GroupBox[];
}

/**
 * Lays nodes out in labelled columns, one per group.
 *
 * Boxes sit side by side and grow downwards, which suits the shape of a real
 * deployment: a handful of groups, each holding a few dozen nodes. A group that
 * outgrows one column wraps into a second inside the same box rather than
 * making the canvas taller than everything beside it.
 */
export function layoutGrouped(
  nodes: readonly NodeSummary[],
  groups: ReadonlyMap<string, string>,
): GroupedLayout {
  const buckets = new Map<string, NodeSummary[]>();
  for (const node of nodes) {
    const key = groups.get(node.zid) ?? "";
    buckets.set(key, [...(buckets.get(key) ?? []), node]);
  }

  const ordered = [...buckets].sort(
    ([aId, a], [bId, b]) => b.length - a.length || aId.localeCompare(bId),
  );

  const positions = new Map<string, Point>();
  const boxes: GroupBox[] = [];
  let cursorX = 0;

  for (const [id, members] of ordered) {
    const columns = Math.max(1, Math.ceil(members.length / COLUMN_LIMIT));
    const perColumn = Math.ceil(members.length / columns);
    const cardWidth = NODE_SIZE.router.width;
    const innerWidth = columns * cardWidth + (columns - 1) * STACK_GAP;

    members.forEach((node, index) => {
      const column = Math.floor(index / perColumn);
      const row = index % perColumn;
      positions.set(node.zid, {
        x: cursorX + GROUP_PADDING + column * (cardWidth + STACK_GAP),
        y: GROUP_HEADER + GROUP_PADDING + row * (ROW_HEIGHT + STACK_GAP),
      });
    });

    const height =
      GROUP_HEADER + GROUP_PADDING * 2 + perColumn * ROW_HEIGHT + (perColumn - 1) * STACK_GAP;

    boxes.push({
      id,
      x: cursorX,
      y: 0,
      width: innerWidth + GROUP_PADDING * 2,
      height,
      nodes: members,
    });

    cursorX += innerWidth + GROUP_PADDING * 2 + GROUP_GAP;
  }

  return { positions, boxes };
}
