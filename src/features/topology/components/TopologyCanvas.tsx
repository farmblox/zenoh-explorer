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

import { Legend } from "./Legend";
import { LinkEdge } from "./LinkEdge";
import { NodeCard, type NodeCardData } from "./NodeCard";
import { RegionCard } from "./RegionCard";
import { useTopologyGraph, type GraphActions, type GraphLevel } from "../hooks/useTopologyGraph";
import type { TopologySnapshot } from "@/ipc";

/**
 * Registered at module scope, not inline.
 *
 * React Flow warns and remounts every node if these object identities change
 * between renders, which would reset the canvas on every state update.
 */
const NODE_TYPES = { region: RegionCard, zenohNode: NodeCard } as const;
const EDGE_TYPES = { link: LinkEdge } as const;

/** Leaves room for the floating controls without cropping the graph. */
const FIT_PADDING = 0.2;

/**
 * Graph size at which an overview starts earning its space.
 *
 * Below this the whole graph fits on screen, and a minimap of something you can
 * already see is decoration that costs a corner of the canvas.
 */
const MINIMAP_THRESHOLD = 14;

export interface TopologyCanvasProps {
  snapshot: TopologySnapshot;
  level: GraphLevel;
  selectedZid: string | null;
  actions: GraphActions;
  /**
   * Changes whenever a side panel opens or closes.
   *
   * Those panels take width from the canvas, so the frame that fitted a moment
   * ago now hides nodes behind them. The canvas cannot see that happen — it
   * only knows its own element resized — so the view tells it.
   */
  framingKey: string;
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
  level,
  selectedZid,
  actions,
  framingKey,
  onOpenRegion,
  onSelectNode,
}: TopologyCanvasProps) {
  const graph = useTopologyGraph({ snapshot, level, selectedZid, actions });

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  const { fitView } = useReactFlow();

  /** Which graph the current positions belong to. */
  const levelKey = level.kind === "regions" ? "regions" : level.regionId;
  const previousLevel = useRef(levelKey);
  /** Set when the graph changed and the new one still needs framing. */
  const needsFit = useRef(false);

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

    // A different graph deserves a fresh frame, but not yet: `setNodes` above
    // has not committed, so fitting here would frame the graph being replaced.
    if (changedLevel) needsFit.current = true;
  }, [graph, levelKey, setNodes, setEdges]);

  // Runs after the new nodes are on screen and measured, which is the only
  // point at which their bounding box is real.
  useEffect(() => {
    if (!needsFit.current || nodes.length === 0) return;
    needsFit.current = false;
    const frame = requestAnimationFrame(
      () => void fitView({ padding: FIT_PADDING, maxZoom: 1, duration: 200 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [nodes, fitView]);

  // A side panel opening narrows the canvas. Re-frame so the graph stays in the
  // part of it you can still see, rather than sliding under the panel.
  useEffect(() => {
    // Waits for the panel's own layout to settle before measuring.
    const timer = setTimeout(
      () => void fitView({ padding: FIT_PADDING, maxZoom: 1, duration: 220 }),
      60,
    );
    return () => clearTimeout(timer);
  }, [framingKey, fitView]);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      if (node.type === "region") onOpenRegion(node.id);
      else onSelectNode(node.id === selectedZid ? null : node.id);
    },
    [onOpenRegion, onSelectNode, selectedZid],
  );

  const minimapColor = useCallback((node: Node) => {
    if (node.type === "region") return "var(--accent)";
    const data = node.data as NodeCardData;
    if (data.alert) return "var(--warn)";
    if (data.isLocal) return "var(--ok)";
    return data.kind === "router" ? "var(--accent)" : "var(--track)";
  }, []);

  // Attribution stays — React Flow's licence asks for it — but it moves out
  // from under the minimap and the controls.
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
        className="[&_.react-flow__attribution_a]:!text-ink-disabled bg-transparent [&_.react-flow__attribution]:!right-auto [&_.react-flow__attribution]:!left-1/2 [&_.react-flow__attribution]:!bg-transparent"
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
        {nodes.length > MINIMAP_THRESHOLD ? (
          <MiniMap
            pannable
            zoomable
            nodeColor={minimapColor}
            nodeStrokeWidth={0}
            nodeBorderRadius={2}
            // The mask dims what is OUT of view, so it has to be lighter than
            // the panel or the whole thing reads as one dark block.
            maskColor="rgb(0 0 0 / 0.55)"
            bgColor="var(--surface-1)"
            className="!rounded-control !border-line !right-4 !bottom-4 !m-0 !h-[112px] !w-[168px] !border"
          />
        ) : null}
      </ReactFlow>

      {/* Outside the canvas, so panning and zooming never move it. */}
      <Legend className="absolute bottom-4 left-[58px] z-10" />
    </div>
  );
}
