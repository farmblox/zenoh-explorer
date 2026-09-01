import { useMemo } from "react";
import { Position, type Edge, type Node } from "@xyflow/react";

import type { LinkSummary, NodeSummary, TopologySnapshot } from "@/ipc";
import { classifyEdge } from "../lib/edgeStyle";
import { isFirsthand } from "../lib/sources";
import { label } from "../lib/grouping";
import { layoutGraph } from "../lib/layout";
import type { NodeCardData } from "../components/NodeCard";
import type { LinkEdgeData } from "../components/LinkEdge";

/** Callbacks a node card offers once it is selected. */
export interface GraphActions {
  readonly onInspect: (zid: string) => void;
  readonly onTrace: (zid: string) => void;
}

export interface TopologyGraphInput {
  readonly snapshot: TopologySnapshot | null;
  readonly selectedZid: string | null;
  /** Zids drawn only as context for a narrowed region. */
  readonly anchors: ReadonlySet<string>;
  readonly actions: GraphActions;
}

export interface TopologyGraph {
  readonly nodes: Node[];
  readonly edges: Edge[];
}

/**
 * Turns a snapshot into React Flow nodes and edges.
 *
 * One level: the nodes, and the links between them. Regions narrow this graph
 * rather than standing in front of it, and the Regions view is where they are
 * the subject.
 *
 * Memoised on everything it reads, because React Flow re-measures and re-fits
 * whenever these arrays change identity. Rebuilding them on every render would
 * make the canvas twitch on unrelated state changes.
 */
export function useTopologyGraph(input: TopologyGraphInput): TopologyGraph {
  const { snapshot, selectedZid, anchors, actions } = input;

  return useMemo(() => {
    if (!snapshot) return { nodes: [], edges: [] };

    const positions = layoutGraph(snapshot.nodes, snapshot.links);
    const cards = buildNodeCards(snapshot.nodes, snapshot.links, selectedZid, anchors, actions);

    return {
      nodes: cards.map((card) => ({ ...card, position: positions.get(card.id) ?? card.position })),
      edges: buildEdges(snapshot.links, snapshot.nodes, selectedZid),
    };
  }, [snapshot, selectedZid, anchors, actions]);
}

/** One card per node, positioned by the caller. */
function buildNodeCards(
  nodes: readonly NodeSummary[],
  links: readonly LinkSummary[],
  selectedZid: string | null,
  anchors: ReadonlySet<string>,
  actions: GraphActions,
): Node<NodeCardData>[] {
  // Counted from the links we are about to draw, so the number on a card always
  // matches what is visible next to it.
  const degree = new Map<string, number>();
  for (const link of links) {
    degree.set(link.from, (degree.get(link.from) ?? 0) + 1);
    degree.set(link.to, (degree.get(link.to) ?? 0) + 1);
  }
  return nodes.map((node) => {
    const linkCount = degree.get(node.zid) ?? 0;
    return {
      id: node.zid,
      type: "zenohNode",
      position: { x: 0, y: 0 },
      selected: node.zid === selectedZid,
      // dagre ranks left to right, so an edge leaves a card's right edge and
      // arrives at the next card's left. Anchoring them anywhere else would
      // send half the edges back round the card they just left.
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        zid: node.zid,
        label: label(node),
        kind: node.kind,
        isLocal: node.isLocal,
        linkCount,
        locator: node.locators[0] ?? null,
        // Not reported by the admin space yet. An explicit null rather than an
        // invented number: a rate the tool made up is worse than no rate.
        rate: null,
        declarations: `${linkCount} ${linkCount === 1 ? "link" : "links"} · ${node.kind}`,
        firsthand: isFirsthand(node.source),
        context: anchors.has(node.zid),
        alert: describeNodeAlert(node, links),
        onInspect: actions.onInspect,
        onTrace: actions.onTrace,
      },
    };
  });
}

/** Edges, classified from the roles at each end. */
function buildEdges(
  links: readonly LinkSummary[],
  nodes: readonly NodeSummary[],
  selectedZid: string | null,
): Edge<LinkEdgeData>[] {
  const byZid = new Map(nodes.map((node) => [node.zid, node]));

  return links.map((link) => {
    const highlighted =
      selectedZid !== null && (link.from === selectedZid || link.to === selectedZid);
    return {
      id: `${link.from}--${link.to}`,
      source: link.from,
      target: link.to,
      type: "link",
      data: {
        protocol: link.protocol,
        kind: classifyEdge(link, byZid).kind,
        weight: 1,
        highlighted,
        // Only a selected node's own links animate. Animating the whole graph
        // would be motion for its own sake, and would make the one thing you
        // are looking at harder to follow rather than easier.
        flowing: highlighted,
      },
    };
  });
}

/**
 * What is wrong with a node, in as few words as carry it.
 *
 * Terse on purpose: this sits on a card whose subject is the node's NAME, and
 * an eight-word sentence there wraps to two lines and becomes the loudest thing
 * on it. The inspector has room to explain what "unconfirmed" means; the card
 * only has to say that something is.
 */
function describeNodeAlert(node: NodeSummary, links: readonly LinkSummary[]): string | null {
  const touching = links.filter((link) => link.from === node.zid || link.to === node.zid);
  if (touching.length === 0 && !node.isLocal) return "no links";

  const unconfirmed = touching.filter((link) => !link.bidirectional).length;
  return unconfirmed > 0 ? `${unconfirmed} link${unconfirmed === 1 ? "" : "s"} unconfirmed` : null;
}
