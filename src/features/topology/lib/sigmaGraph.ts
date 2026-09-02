import Graph from "graphology";

import { NODE_ROLES } from "@/components/domain/nodeRoles";
import type { LinkSummary, NodeKind, NodeSummary, TopologySnapshot } from "@/ipc";
import { classifyEdge, type EdgeKind } from "./edgeStyle";
import { isFirsthand } from "./sources";
import { label } from "./grouping";

/** A position in Graphology's layout coordinate space. */
export interface GraphPosition {
  readonly x: number;
  readonly y: number;
}

/** Resolved CSS colours: WebGL cannot read `var(--token)` values. */
export interface SigmaPalette {
  readonly accent: string;
  readonly accentStrong: string;
  readonly ink: string;
  readonly inkMuted: string;
  readonly inkFaint: string;
  readonly inkDisabled: string;
  readonly surface0: string;
  readonly surface1: string;
  readonly surface2: string;
  readonly surface3: string;
  readonly line: string;
  readonly ok: string;
  readonly warn: string;
  readonly wire: string;
  readonly wireSoft: string;
  readonly wireStrong: string;
}

/** Attributes Sigma reads for one node, plus the facts our reducers need. */
export interface SigmaNodeAttributes {
  x: number;
  y: number;
  size: number;
  color: string;
  borderColor: string;
  haloColor: string;
  label: string;
  roleLetter: string;
  forceLabel: boolean;
  type: "beacon";
  kind: NodeKind;
  baseColor: string;
  baseBorderColor: string;
  baseHaloColor: string;
  hoverColor: string;
  labelBackground: string;
  labelColor: string;
  context: boolean;
  firsthand: boolean;
  isLocal: boolean;
  alert: string | null;
}

/** Attributes Sigma reads for one link. */
export interface SigmaEdgeAttributes {
  size: number;
  color: string;
  label: string;
  protocol: string;
  type: "line";
  kind: EdgeKind;
  weight: number;
  sourceZid: string;
  targetZid: string;
}

export type SigmaGraph = Graph<SigmaNodeAttributes, SigmaEdgeAttributes>;

export interface BuiltSigmaGraph {
  readonly graph: SigmaGraph;
  readonly structureKey: string;
}

const NODE_SIZE: Record<NodeKind, number> = {
  router: 18,
  peer: 14,
  client: 10,
};

const EDGE_WEIGHT: Record<EdgeKind, number> = {
  // The northbound router mesh is the skeleton everything else hangs from.
  trunk: 3.2,
  // Router-to-peer/client links should stay close without crushing the mesh.
  access: 1.5,
  // Direct peer links explain adjacency but must not overpower the backbone.
  mesh: 0.65,
  // A link only one endpoint reports is weak evidence and weak attraction.
  unconfirmed: 0.35,
};

/**
 * Builds the WebGL graph in one pass, preserving positions from the prior view.
 *
 * The initial geometry is already meaningful before the worker moves anything:
 * routers form a backbone ring, and everything with a router neighbour starts
 * around that router. ForceAtlas2 refines a Zenoh-shaped map rather than trying
 * to recover one from a random cloud.
 */
export function buildSigmaGraph(
  snapshot: TopologySnapshot,
  anchors: ReadonlySet<string>,
  previous: ReadonlyMap<string, GraphPosition>,
  palette: SigmaPalette,
): BuiltSigmaGraph {
  const graph: SigmaGraph = new Graph({ multi: true, type: "undirected" });
  const byZid = new Map(snapshot.nodes.map((node) => [node.zid, node]));
  const positions = seedPositions(snapshot.nodes, snapshot.links, previous);

  const degree = new Map<string, number>();
  const unconfirmed = new Map<string, number>();
  for (const link of snapshot.links) {
    degree.set(link.from, (degree.get(link.from) ?? 0) + 1);
    degree.set(link.to, (degree.get(link.to) ?? 0) + 1);
    if (!link.bidirectional) {
      unconfirmed.set(link.from, (unconfirmed.get(link.from) ?? 0) + 1);
      unconfirmed.set(link.to, (unconfirmed.get(link.to) ?? 0) + 1);
    }
  }

  for (const node of snapshot.nodes) {
    const position = positions.get(node.zid) ?? { x: 0, y: 0 };
    const alert = nodeAlert(node, degree.get(node.zid) ?? 0, unconfirmed.get(node.zid) ?? 0);
    const context = anchors.has(node.zid);
    const base = nodeColours(node, alert, context, palette);

    graph.addNode(node.zid, {
      ...position,
      size: nodeSize(node.kind, snapshot.nodes.length),
      color: base.fill,
      borderColor: base.border,
      haloColor: base.halo,
      label: graphLabel(node),
      roleLetter: NODE_ROLES[node.kind].letter,
      forceLabel:
        snapshot.nodes.length <= 140 || node.kind === "router" || node.isLocal || alert !== null,
      type: "beacon",
      kind: node.kind,
      baseColor: base.fill,
      baseBorderColor: base.border,
      baseHaloColor: base.halo,
      hoverColor: palette.inkMuted,
      labelBackground: palette.surface1,
      labelColor: palette.ink,
      context,
      firsthand: isFirsthand(node.source),
      isLocal: node.isLocal,
      alert,
    });
  }

  snapshot.links.forEach((link, index) => {
    if (link.from === link.to || !graph.hasNode(link.from) || !graph.hasNode(link.to)) return;

    const kind = classifyEdge(link, byZid).kind;
    graph.addUndirectedEdgeWithKey(`${link.from}--${link.to}--${index}`, link.from, link.to, {
      size: edgeWidth(kind, snapshot.links.length),
      color: edgeColour(kind, palette),
      // Empty at rest. The reducer supplies `protocol` only for the selected
      // neighbourhood, so labels never carpet a dense graph.
      label: "",
      protocol: link.protocol ?? kind,
      // Sigma's rectangle renderer anti-aliases this line. The raw GL_LINES
      // program is faster and visibly stair-stepped in WKWebView.
      type: "line",
      kind,
      weight: EDGE_WEIGHT[kind],
      sourceZid: link.from,
      targetZid: link.to,
    });
  });

  return { graph, structureKey: topologyStructureKey(snapshot) };
}

/** What about a node needs attention, indexed in O(nodes + links). */
function nodeAlert(node: NodeSummary, linkCount: number, uncertain: number): string | null {
  if (linkCount === 0 && !node.isLocal) return "no links";
  return uncertain > 0 ? `${uncertain} link${uncertain === 1 ? "" : "s"} unconfirmed` : null;
}

function nodeColours(
  node: NodeSummary,
  alert: string | null,
  context: boolean,
  palette: SigmaPalette,
): { fill: string; border: string; halo: string } {
  if (alert) {
    return { fill: palette.surface2, border: palette.warn, halo: palette.warn };
  }
  if (node.isLocal) {
    return { fill: palette.surface2, border: palette.ok, halo: palette.ok };
  }
  if (context) {
    return { fill: palette.surface1, border: palette.inkDisabled, halo: "#00000000" };
  }
  if (!isFirsthand(node.source)) {
    return { fill: palette.surface1, border: palette.inkDisabled, halo: "#00000000" };
  }

  switch (node.kind) {
    case "router":
      // A router is a layered beacon: the extra ring makes the backbone read
      // before labels do, without turning every router accent-blue.
      return { fill: palette.surface3, border: palette.surface0, halo: palette.inkDisabled };
    case "peer":
      return { fill: palette.surface2, border: palette.inkDisabled, halo: "#00000000" };
    case "client":
      return { fill: palette.inkDisabled, border: palette.surface1, halo: "#00000000" };
  }
}

function edgeColour(kind: EdgeKind, palette: SigmaPalette): string {
  switch (kind) {
    case "trunk":
      return withAlpha(palette.accent, 0.64);
    case "access":
      return withAlpha(palette.inkMuted, 0.46);
    case "mesh":
      return withAlpha(palette.accentStrong, 0.36);
    case "unconfirmed":
      return withAlpha(palette.warn, 0.78);
  }
}

function nodeSize(kind: NodeKind, total: number): number {
  const scale = total > 5_000 ? 0.56 : total > 1_500 ? 0.7 : total > 500 ? 0.84 : 1;
  return NODE_SIZE[kind] * scale;
}

function graphLabel(node: NodeSummary): string {
  const value = label(node);
  return value.length > 30 ? `${value.slice(0, 29)}…` : value;
}

function edgeWidth(kind: EdgeKind, total: number): number {
  const scale = total > 30_000 ? 0.5 : total > 10_000 ? 0.62 : total > 2_000 ? 0.8 : 1;
  const width = (() => {
    switch (kind) {
      case "trunk":
        return 4;
      case "access":
        return 2.6;
      case "mesh":
        return 1.8;
      case "unconfirmed":
        return 2.2;
    }
  })();
  return width * scale;
}

/** Initial coordinates, stable for a zid and biased toward its router. */
function seedPositions(
  nodes: readonly NodeSummary[],
  links: readonly LinkSummary[],
  previous: ReadonlyMap<string, GraphPosition>,
): Map<string, GraphPosition> {
  const out = new Map(previous);
  const routers = nodes.filter((node) => node.kind === "router");
  const routerSet = new Set(routers.map((node) => node.zid));
  const routerPosition = new Map<string, GraphPosition>();
  const backboneRadius = Math.max(18, routers.length * 5.5);

  routers.forEach((router, index) => {
    const angle = routers.length === 1 ? 0 : (index / routers.length) * Math.PI * 2;
    const seeded = {
      x: Math.cos(angle) * backboneRadius,
      y: Math.sin(angle) * backboneRadius,
    };
    const position = previous.get(router.zid) ?? seeded;
    routerPosition.set(router.zid, position);
    out.set(router.zid, position);
  });

  const attachedTo = new Map<string, string>();
  for (const link of links) {
    if (routerSet.has(link.from) && !routerSet.has(link.to)) attachedTo.set(link.to, link.from);
    if (routerSet.has(link.to) && !routerSet.has(link.from)) attachedTo.set(link.from, link.to);
  }

  for (const [index, node] of nodes.entries()) {
    if (out.has(node.zid)) continue;

    const hash = hashString(node.zid);
    const angle = ((hash % 65_521) / 65_521) * Math.PI * 2;
    const radius = 8 + ((hash >>> 8) % 17);
    const router = attachedTo.get(node.zid);
    const anchor = router ? routerPosition.get(router) : undefined;

    if (anchor) {
      out.set(node.zid, {
        x: anchor.x + Math.cos(angle) * radius,
        y: anchor.y + Math.sin(angle) * radius,
      });
      continue;
    }

    // An isolated or peer-only node starts in a deterministic outer band. The
    // worker can pull it inward if links justify doing so.
    const outer = backboneRadius + 18 + (index % 11);
    out.set(node.zid, { x: Math.cos(angle) * outer, y: Math.sin(angle) * outer });
  }

  return out;
}

/** Structure only: metadata changes should not restart an expensive layout. */
export function topologyStructureKey(snapshot: TopologySnapshot): string {
  const nodes = snapshot.nodes.map((node) => `${node.zid}:${node.kind}`).join("|");
  const links = snapshot.links
    .map((link) => `${link.from}>${link.to}:${link.bidirectional ? 1 : 0}`)
    .join("|");
  return `${nodes}#${links}`;
}

function hashString(input: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Replaces a `#rrggbbaa` colour's alpha without changing its token-derived hue. */
function withAlpha(colour: string, alpha: number): string {
  const opaque = colour.length >= 7 ? colour.slice(0, 7) : colour;
  return `${opaque}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}
