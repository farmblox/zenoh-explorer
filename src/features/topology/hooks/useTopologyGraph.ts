import { useMemo } from "react";
import { Position, type Edge, type Node } from "@xyflow/react";

import type { LinkSummary, NodeSummary, TopologySnapshot } from "@/ipc";
import { classifyEdge } from "../lib/edgeStyle";
import { isFirsthand } from "../lib/sources";
import { buildRegionDetail, buildRegionView, label } from "../lib/grouping";
import { layoutGraph, layoutRegions } from "../lib/layout";
import type { NodeCardData } from "../components/NodeCard";
import type { RegionCardData } from "../components/RegionCard";
import type { LinkEdgeData } from "../components/LinkEdge";

/** What the canvas is currently showing. */
export type GraphLevel = { kind: "regions" } | { kind: "region"; regionId: string };

/** Callbacks a node card offers once it is selected. */
export interface GraphActions {
  readonly onInspect: (zid: string) => void;
  readonly onTrace: (zid: string) => void;
}

export interface TopologyGraphInput {
  readonly snapshot: TopologySnapshot | null;
  readonly level: GraphLevel;
  readonly selectedZid: string | null;
  readonly actions: GraphActions;
}

export interface TopologyGraph {
  readonly nodes: Node[];
  readonly edges: Edge[];
  /** `true` when the drilled region no longer exists in this snapshot. */
  readonly missing: boolean;
}

/**
 * Turns a snapshot into React Flow nodes and edges.
 *
 * Memoised on everything it reads, because React Flow re-measures and re-fits
 * whenever these arrays change identity. Rebuilding them on every render would
 * make the canvas twitch on unrelated state changes.
 */
export function useTopologyGraph(input: TopologyGraphInput): TopologyGraph {
  const { snapshot, level, selectedZid, actions } = input;

  return useMemo(() => {
    if (!snapshot) return { nodes: [], edges: [], missing: false };
    // Two levels: one card per region, then that region's nodes as a graph.
    return level.kind === "regions"
      ? buildRegionGraph(snapshot)
      : buildRegionDetailGraph(snapshot, level.regionId, selectedZid, actions);
  }, [snapshot, level, selectedZid, actions]);
}

/** The overview: one node per region. */
function buildRegionGraph(snapshot: TopologySnapshot): TopologyGraph {
  const { regions, links } = buildRegionView(snapshot);
  const positions = layoutRegions(regions);

  const nodes: Node<RegionCardData>[] = regions.map((region) => ({
    id: region.id,
    type: "region",
    position: positions.get(region.id) ?? { x: 0, y: 0 },
    data: {
      label: region.id,
      total: region.nodes.length,
      routers: region.routers,
      peers: region.peers,
      clients: region.clients,
      containsLocal: region.containsLocal,
      // Counted from the links leaving this region, so the footer and the
      // edges drawn beside it always agree.
      trunks: links.filter((link) => link.from === region.id || link.to === region.id).length,
      // Routers first, which `buildRegionView` already ordered them as, so the
      // names shown are the ones that identify the region rather than three
      // arbitrary leaves.
      members: region.nodes.map((node) => label(node)),
    },
  }));

  const edges: Edge<LinkEdgeData>[] = links.map((link) => ({
    id: `${link.from}--${link.to}`,
    source: link.from,
    target: link.to,
    type: "link",
    data: {
      protocol: null,
      kind: "trunk",
      weight: link.count,
      highlighted: false,
      flowing: false,
    },
  }));

  return { nodes, edges, missing: false };
}

/** One region opened up: a node per member. */
function buildRegionDetailGraph(
  snapshot: TopologySnapshot,
  regionId: string,
  selectedZid: string | null,
  actions: GraphActions,
): TopologyGraph {
  const detail = buildRegionDetail(snapshot, regionId);
  if (!detail) return { nodes: [], edges: [], missing: true };

  const positions = layoutGraph(detail.region.nodes, detail.links);
  const cards = buildNodeCards(detail.region.nodes, detail.links, selectedZid, actions);

  return {
    nodes: cards.map((card) => ({ ...card, position: positions.get(card.id) ?? card.position })),
    edges: buildEdges(detail.links, snapshot.nodes, selectedZid),
    missing: false,
  };
}

/** One card per node, positioned by the caller. */
function buildNodeCards(
  nodes: readonly NodeSummary[],
  links: readonly LinkSummary[],
  selectedZid: string | null,
  actions: GraphActions,
): Node<NodeCardData>[] {
  // Counted from the links we are about to draw, so the number on a card always
  // matches what is visible next to it.
  const degree = new Map<string, number>();
  for (const link of links) {
    degree.set(link.from, (degree.get(link.from) ?? 0) + 1);
    degree.set(link.to, (degree.get(link.to) ?? 0) + 1);
  }
  const busiest = Math.max(1, ...degree.values());

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
        // Link count is a real measure of a node's place in the graph, and the
        // one we can compute honestly today.
        share: linkCount > 0 ? linkCount / busiest : null,
        declarations: `${linkCount} ${linkCount === 1 ? "link" : "links"} · ${node.kind}`,
        firsthand: isFirsthand(node.source),
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

/** What is wrong with a node, in one phrase, or null when nothing is. */
function describeNodeAlert(node: NodeSummary, links: readonly LinkSummary[]): string | null {
  const touching = links.filter((link) => link.from === node.zid || link.to === node.zid);
  if (touching.length === 0 && !node.isLocal) return "no links reported";

  const unconfirmed = touching.filter((link) => !link.bidirectional).length;
  if (unconfirmed > 0) {
    return `${unconfirmed} link${unconfirmed === 1 ? "" : "s"} confirmed by one end only`;
  }
  return null;
}
