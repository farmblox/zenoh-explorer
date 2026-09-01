/**
 * How a Zenoh node's role is drawn, in one place.
 *
 * Data rather than a component, so the graph glyph, the legend and anything
 * else that names a role all read from the same table. The legend used to
 * restate these shapes in its own markup and had already drifted — a legend
 * that can disagree with its subject is worse than no legend.
 */
import type { NodeKind } from "@/ipc";

export interface NodeRole {
  /** The single character shown inside the glyph. */
  readonly letter: string;
  /** What the role is called in prose. */
  readonly label: string;
  /** Tailwind classes for the glyph's outline: role is encoded in SHAPE. */
  readonly shape: string;
}

/**
 * Shape and letter per role.
 *
 * Two channels, not one. A router is a rounded square, a peer a circle, a
 * client a dashed circle — so the role survives being scanned at a glance in a
 * dense graph, and survives being printed in greyscale or read by someone who
 * cannot separate the colours.
 */
export const NODE_ROLES: Record<NodeKind, NodeRole> = {
  router: { letter: "R", label: "Router", shape: "rounded-inner border-solid" },
  peer: { letter: "P", label: "Peer", shape: "rounded-full border-solid" },
  client: { letter: "C", label: "Client", shape: "rounded-full border-dashed" },
};

/** Every role, in the order a graph is read: backbone first. */
export const NODE_KINDS: readonly NodeKind[] = ["router", "peer", "client"];
