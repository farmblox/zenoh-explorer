import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";

import { GroupBox } from "./GroupBox";
import { Legend } from "./Legend";
import { LinkEdge } from "./LinkEdge";
import { NodeCard, type NodeCardData } from "./NodeCard";
import { RegionCard } from "./RegionCard";
import { useTopologyGraph, type GraphActions, type GraphLevel } from "../hooks/useTopologyGraph";
import type { GraphMode } from "../lib/graphMode";
import type { LayoutMode } from "../lib/layout";
import type { TopologySnapshot } from "@/ipc";

/**
 * Registered at module scope, not inline.
 *
 * React Flow warns and remounts every node if these object identities change
 * between renders, which would reset the canvas on every state update.
 */
const NODE_TYPES = { region: RegionCard, zenohNode: NodeCard, group: GroupBox } as const;
const EDGE_TYPES = { link: LinkEdge } as const;

/** Leaves room for the floating controls without cropping the graph. */
const FIT_PADDING = 0.2;

export interface TopologyCanvasProps {
  snapshot: TopologySnapshot;
  mode: GraphMode;
  level: GraphLevel;
  selectedZid: string | null;
  layout: LayoutMode;
  actions: GraphActions;
  onOpenRegion: (regionId: string) => void;
  onSelectNode: (zid: string | null) => void;
}

/**
 * The graph.
 *
 * Nodes are draggable and their positions persist: computed layout is only the
 * STARTING arrangement, and a graph you cannot pull apart is not much use for
 * untangling a real network. Positions reset when the level changes, because
 * that is a different graph rather than a rearrangement of this one.
 */
export function TopologyCanvas({
  snapshot,
  mode,
  level,
  selectedZid,
  layout,
  actions,
  onOpenRegion,
  onSelectNode,
}: TopologyCanvasProps) {
  const graph = useTopologyGraph({ snapshot, mode, level, selectedZid, layout, actions });

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  const { fitView } = useReactFlow();

  /** Which graph the current positions belong to. */
  const levelKey = `${mode}:${level.kind === "regions" ? "regions" : level.regionId}:${layout}`;
  const previousLevel = useRef(levelKey);

  useEffect(() => {
    const changedLevel = previousLevel.current !== levelKey;
    previousLevel.current = levelKey;

    setNodes((current) => {
      // Same graph, fresh data: keep wherever the user dragged each node and
      // update only what it says. Taking the computed position back would yank
      // the graph out from under them on every refresh.
      if (!changedLevel) {
        const placed = new Map(current.map((node) => [node.id, node.position]));
        return graph.nodes.map((node) => ({
          ...node,
          position: placed.get(node.id) ?? node.position,
        }));
      }
      return graph.nodes;
    });

    setEdges(graph.edges);

    if (changedLevel) {
      // A different graph deserves a fresh frame. Deferred so it runs after
      // the new nodes have been measured.
      requestAnimationFrame(() => void fitView({ padding: FIT_PADDING, maxZoom: 1 }));
    }
  }, [graph, levelKey, setNodes, setEdges, fitView]);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      if (node.type === "group") return;
      if (node.type === "region") onOpenRegion(node.id);
      else onSelectNode(node.id === selectedZid ? null : node.id);
    },
    [onOpenRegion, onSelectNode, selectedZid],
  );

  const minimapColor = useCallback((node: Node) => {
    if (node.type === "group") return "transparent";
    if (node.type === "region") return "var(--accent)";
    const data = node.data as NodeCardData;
    if (data.alert) return "var(--warn)";
    if (data.isLocal) return "var(--ok)";
    return data.kind === "router" ? "var(--accent)" : "var(--track)";
  }, []);

  const proOptions = useMemo(() => ({ hideAttribution: false }), []);

  return (
    <div className="relative h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeClick={onNodeClick}
        onPaneClick={() => onSelectNode(null)}
        fitView
        fitViewOptions={{ padding: FIT_PADDING, maxZoom: 1 }}
        minZoom={0.1}
        maxZoom={2}
        // Draggable, but not connectable: the edges describe a real network and
        // drawing a new one would be drawing a fact that is not true.
        nodesDraggable
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable
        selectNodesOnDrag={false}
        proOptions={proOptions}
        className="bg-transparent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="var(--line)"
          bgColor="transparent"
        />
        <Controls
          showInteractive={false}
          className="!rounded-control !border-line !bg-surface-2 [&_button]:!border-line-soft [&_button]:!bg-surface-2 [&_button]:!fill-ink-muted hover:[&_button]:!bg-surface-3 !border !shadow-none [&_button]:!size-[30px]"
        />
        <MiniMap
          pannable
          zoomable
          nodeColor={minimapColor}
          nodeStrokeWidth={0}
          maskColor="var(--scrim)"
          className="!rounded-control !border-line !bg-surface-0 !h-[126px] !w-[186px] !border"
        />
      </ReactFlow>

      {/* Outside the canvas, so panning and zooming never move it. */}
      <Legend className="absolute bottom-4 left-[58px] z-10" />
    </div>
  );
}
