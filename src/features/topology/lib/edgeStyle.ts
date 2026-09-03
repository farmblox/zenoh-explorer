import type { LinkSummary, NodeSummary } from "@/ipc";

/**
 * What a link is, so it can be drawn as what it is.
 *
 * Zenoh's graph has genuinely different kinds of edge, and flattening them into
 * one grey line throws away most of what a topology view is for. A routing edge
 * came from Zenoh's link-state graph; an access edge came from a router session
 * table; a peer edge bypasses the router backbone; an observed-only router
 * transport is deliberately called out because it is absent from link-state.
 */
export type EdgeKind = "routing" | "access" | "peer" | "observed";

export interface EdgeStyle {
  readonly kind: EdgeKind;
  /** Token-derived stroke hue. */
  readonly stroke: string;
  /** Alpha used by both the SVG legend and the WebGL colour bridge. */
  readonly opacity: number;
  readonly width: number;
  /** One word, for the legend strip. */
  readonly label: string;
  /** One line for the tooltip. */
  readonly description: string;
}

const STYLES: Record<EdgeKind, Omit<EdgeStyle, "kind">> = {
  // Zenoh's actual link-state graph. Thickest and brightest.
  routing: {
    stroke: "var(--accent)",
    opacity: 0.64,
    width: 4,
    label: "routing",
    description: "Present in Zenoh's link-state routing graph",
  },
  // A node attached to its router. The common case.
  access: {
    stroke: "var(--ink-muted)",
    opacity: 0.46,
    width: 2.6,
    label: "access",
    description: "Attached to a router",
  },
  // Peer to peer, bypassing the router backbone. Soft blue and narrow, so it remains
  // visible without competing with the router backbone.
  peer: {
    stroke: "var(--accent-strong)",
    opacity: 0.36,
    width: 1.8,
    label: "peer mesh",
    description: "Direct peer-to-peer link",
  },
  // A router transport that the current link-state map did not include.
  observed: {
    stroke: "var(--warn)",
    opacity: 0.62,
    width: 2.2,
    label: "observed only",
    description: "Router transport absent from the current link-state map",
  },
};

/** How one classification is drawn. The only place that decides. */
export function edgeStyle(kind: EdgeKind): EdgeStyle {
  return { kind, ...STYLES[kind] };
}

/** Classifies a link from the roles at each end. */
export function classifyEdge(
  link: LinkSummary,
  nodesByZid: ReadonlyMap<string, NodeSummary>,
): EdgeStyle {
  const from = nodesByZid.get(link.from)?.kind;
  const to = nodesByZid.get(link.to)?.kind;

  if (link.inRoutingMap) return edgeStyle("routing");
  if (from === "router" && to === "router") return edgeStyle("observed");
  if (from === "router" || to === "router") return edgeStyle("access");
  if (from && to) return edgeStyle("peer");
  return edgeStyle("observed");
}

/** Whether a router transport is missing from the link-state routing graph. */
export function isObservedOnlyLink(
  link: LinkSummary,
  nodesByZid: ReadonlyMap<string, NodeSummary>,
): boolean {
  return classifyEdge(link, nodesByZid).kind === "observed";
}

/** Every kind, for the legend. */
export const EDGE_KINDS: readonly EdgeStyle[] = (Object.keys(STYLES) as EdgeKind[]).map(edgeStyle);
