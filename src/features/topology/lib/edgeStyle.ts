import type { LinkSummary, NodeSummary } from "@/ipc";

/**
 * What a link is, so it can be drawn as what it is.
 *
 * Zenoh's graph has genuinely different kinds of edge, and flattening them into
 * one grey line throws away most of what a topology view is for. A trunk
 * between two routers carries everyone's traffic; a mesh link between peers is
 * incidental; a half-open link is a fault.
 */
export type EdgeKind = "trunk" | "access" | "mesh" | "unconfirmed";

export interface EdgeStyle {
  readonly kind: EdgeKind;
  readonly stroke: string;
  readonly width: number;
  /** SVG dash array, or undefined for a solid line. */
  readonly dash: string | undefined;
  readonly opacity: number;
  /** One line for the tooltip. */
  readonly description: string;
}

const STYLES: Record<EdgeKind, Omit<EdgeStyle, "kind">> = {
  // Router to router: the backbone. Thickest and brightest.
  trunk: {
    stroke: "var(--wire-strong)",
    width: 2.6,
    dash: undefined,
    opacity: 1,
    description: "Trunk between routers",
  },
  // A node attached to its router. The common case.
  access: {
    stroke: "var(--wire)",
    width: 1.5,
    dash: undefined,
    opacity: 0.9,
    description: "Attached to a router",
  },
  // Peer to peer, bypassing the routers.
  mesh: {
    stroke: "var(--wire)",
    width: 1.4,
    dash: "2 5",
    opacity: 0.55,
    description: "Direct peer-to-peer link",
  },
  // Only one end reported it, so we cannot confirm it is up in both directions.
  unconfirmed: {
    stroke: "var(--warn)",
    width: 1.6,
    dash: "4 7",
    opacity: 0.8,
    description: "Only one end reported this link",
  },
};

/** Classifies a link from the roles at each end. */
export function classifyEdge(
  link: LinkSummary,
  nodesByZid: ReadonlyMap<string, NodeSummary>,
): EdgeStyle {
  // A link nobody confirmed is worth flagging whatever it connects: it usually
  // means the far end's admin space is unreadable, or the link is half-open.
  if (!link.bidirectional) return { kind: "unconfirmed", ...STYLES.unconfirmed };

  const from = nodesByZid.get(link.from)?.kind;
  const to = nodesByZid.get(link.to)?.kind;

  if (from === "router" && to === "router") return { kind: "trunk", ...STYLES.trunk };
  if (from === "router" || to === "router") return { kind: "access", ...STYLES.access };
  return { kind: "mesh", ...STYLES.mesh };
}

/** Every kind, for the legend. */
export const EDGE_KINDS: ReadonlyArray<EdgeStyle & { kind: EdgeKind }> = (
  Object.keys(STYLES) as EdgeKind[]
).map((kind) => ({ kind, ...STYLES[kind] }));
