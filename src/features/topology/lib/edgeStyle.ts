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
  /**
   * The stroke, at full opacity.
   *
   * How visible a wire is belongs to its colour and nothing else. There was an
   * `opacity` here as well, and multiplying a translucent token by it attenuated
   * the same line twice — the common case, a node attached to its router, ended
   * up at about a fifth of the canvas's contrast and read as absent.
   */
  readonly stroke: string;
  readonly width: number;
  /** SVG dash array, or undefined for a solid line. */
  readonly dash: string | undefined;
  /** One word, for the legend strip. */
  readonly label: string;
  /** One line for the tooltip. */
  readonly description: string;
}

const STYLES: Record<EdgeKind, Omit<EdgeStyle, "kind">> = {
  // Router to router: the backbone. Thickest and brightest.
  trunk: {
    stroke: "var(--wire-strong)",
    width: 2.6,
    dash: undefined,
    label: "trunk",
    description: "Trunk between routers",
  },
  // A node attached to its router. The common case.
  access: {
    stroke: "var(--wire)",
    width: 1.6,
    dash: undefined,
    label: "access",
    description: "Attached to a router",
  },
  // Peer to peer, bypassing the routers. A dashed line reads fainter than a
  // solid one of the same weight, so it gets its own token rather than a dimmed
  // version of the solid one.
  mesh: {
    stroke: "var(--wire-soft)",
    width: 1.5,
    dash: "3 4",
    label: "mesh",
    description: "Direct peer-to-peer link",
  },
  // Only one end reported it, so we cannot confirm it is up in both directions.
  unconfirmed: {
    stroke: "var(--warn)",
    width: 1.6,
    dash: "4 6",
    label: "unconfirmed",
    description: "Only one end reported this link",
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
  // A link nobody confirmed is worth flagging whatever it connects: it usually
  // means the far end's admin space is unreadable, or the link is half-open.
  if (!link.bidirectional) return edgeStyle("unconfirmed");

  const from = nodesByZid.get(link.from)?.kind;
  const to = nodesByZid.get(link.to)?.kind;

  if (from === "router" && to === "router") return edgeStyle("trunk");
  if (from === "router" || to === "router") return edgeStyle("access");
  return edgeStyle("mesh");
}

/** Every kind, for the legend. */
export const EDGE_KINDS: readonly EdgeStyle[] = (Object.keys(STYLES) as EdgeKind[]).map(edgeStyle);
