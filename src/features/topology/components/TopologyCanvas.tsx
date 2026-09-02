import { useCallback, useEffect, useMemo, useRef } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type NodeMouseHandler,
} from "@xyflow/react";

import { Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { controlBase, overlayStates, pressable } from "@/lib/states";
import type { LinkSummary, TopologySnapshot } from "@/ipc";
import { Legend } from "./Legend";
import { LinkEdge } from "./LinkEdge";
import { NodeCard } from "./NodeCard";
import { useTopologyGraph, type GraphActions } from "../hooks/useTopologyGraph";

/**
 * Registered at module scope, not inline.
 *
 * React Flow warns and remounts every node if these object identities change
 * between renders, which would reset the canvas on every state update.
 */
const NODE_TYPES = { zenohNode: NodeCard } as const;
const EDGE_TYPES = { link: LinkEdge } as const;

/** Padding when framing the whole graph, as a fraction of the viewport. */
const FIT_PADDING = 0.18;

/** Padding when framing one node and its links. Roomier: it is a close-up. */
const FOCUS_PADDING = 0.42;

/**
 * How far a close-up may zoom in.
 *
 * Above 1 the cards render larger than their designed size and the text starts
 * to look soft, so this is a limit rather than a target.
 */
const FOCUS_MAX_ZOOM = 1.15;

/** How long to wait for a panel's own layout to settle before measuring. */
const SETTLE_MS = 70;

export interface TopologyCanvasProps {
  snapshot: TopologySnapshot;
  selectedZid: string | null;
  /** Zids drawn only as context for a narrowed region. */
  anchors: ReadonlySet<string>;
  actions: GraphActions;
  /**
   * Changes whenever the graph is rebuilt or a side panel opens or closes.
   *
   * Those panels take width from the canvas, so the frame that fitted a moment
   * ago now hides nodes behind them. The canvas cannot see that happen — it only
   * knows its own element resized — so the view tells it.
   */
  framingKey: string;
  onSelectNode: (zid: string | null) => void;
}

/**
 * The graph, with the controls and the key to it along the bottom.
 *
 * Nodes are draggable and their positions persist: computed layout is only the
 * STARTING arrangement, and a graph you cannot pull apart is not much use for
 * untangling a real network. Positions reset when the graph itself changes,
 * because that is a different graph rather than a rearrangement of this one.
 */
export function TopologyCanvas({
  snapshot,
  selectedZid,
  anchors,
  actions,
  framingKey,
  onSelectNode,
}: TopologyCanvasProps) {
  const graph = useTopologyGraph({ snapshot, selectedZid, anchors, actions });

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  const { fitView } = useReactFlow();

  const previousGraph = useRef(framingKey);
  /** Set when the graph changed and the new one still needs framing. */
  const needsFit = useRef(false);

  useEffect(() => {
    const rebuilt = previousGraph.current !== framingKey;
    previousGraph.current = framingKey;

    setNodes((current) => {
      // Same graph, fresh data: keep wherever the user dragged each node and
      // update only what it says. Taking the computed position back would yank
      // the graph out from under them on every refresh.
      if (!rebuilt) {
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
    if (rebuilt) needsFit.current = true;
  }, [graph, framingKey, setNodes, setEdges]);

  // Runs after the new nodes are on screen and measured, which is the only
  // point at which their bounding box is real.
  useEffect(() => {
    if (!needsFit.current || nodes.length === 0) return;
    needsFit.current = false;
    const frame = requestAnimationFrame(
      () => void fitView({ padding: FIT_PADDING, maxZoom: 1, duration: 220 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [nodes, fitView]);

  /**
   * Reframing, when the canvas changes size or the subject changes.
   *
   * What "reframe" means depends on whether a node is selected. Selecting one
   * opens a panel that takes width from the canvas, and the honest response to
   * that is to keep the node you just clicked in view — closing up on it and
   * what it links to. Fitting the whole graph instead would zoom OUT from the
   * thing you asked about, which is the opposite of what a click means.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedZid === null) {
        void fitView({ padding: FIT_PADDING, maxZoom: 1, duration: 240 });
        return;
      }
      void fitView({
        nodes: [...neighbourhood(selectedZid, snapshot.links)].map((id) => ({ id })),
        padding: FOCUS_PADDING,
        maxZoom: FOCUS_MAX_ZOOM,
        duration: 300,
      });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [framingKey, selectedZid, snapshot.links, fitView]);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => onSelectNode(node.id === selectedZid ? null : node.id),
    [onSelectNode, selectedZid],
  );

  // React Flow is MIT licensed and its attribution is a request rather than a
  // condition. The credit is in the README instead, where it does not sit on
  // top of the graph.
  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="relative min-h-0 flex-1">
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
          // Draggable, but not connectable: the edges describe a real network
          // and drawing a new one would be drawing a fact that is not true.
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
        </ReactFlow>
      </div>

      {/* Outside the canvas so panning never moves it, and a row of its own so
          it never covers a node. */}
      <div className="border-line bg-surface-0 flex h-11 shrink-0 items-center gap-3 border-t px-3">
        <ZoomControls />
        <span className="bg-line h-3.5 w-px shrink-0" aria-hidden />
        <Legend className="flex-1" />
      </div>
    </div>
  );
}

/** The selected node and everything it links to directly. */
function neighbourhood(zid: string, links: readonly LinkSummary[]): ReadonlySet<string> {
  const ids = new Set([zid]);
  for (const link of links) {
    if (link.from === zid) ids.add(link.to);
    if (link.to === zid) ids.add(link.from);
  }
  return ids;
}

/**
 * Zoom, ours rather than React Flow's.
 *
 * Its `<Controls>` is a floating vertical stack that needed a wall of
 * `!important` to look like anything else in this app, and it covered the
 * bottom-left corner of the graph. These are three buttons in a row on the
 * footer, built from the same vocabulary as every other control here.
 */
function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <ZoomButton label="Zoom out" onClick={() => void zoomOut({ duration: 160 })}>
        <Minus size={15} />
      </ZoomButton>
      <ZoomButton label="Zoom in" onClick={() => void zoomIn({ duration: 160 })}>
        <Plus size={15} />
      </ZoomButton>
      <ZoomButton
        label="Fit the whole graph"
        onClick={() => void fitView({ padding: FIT_PADDING, maxZoom: 1, duration: 240 })}
      >
        <Maximize2 size={13} />
      </ZoomButton>
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          // 32px, the same height every other control in the app is. A footer
          // button that is smaller than a toolbar button reads as secondary, and
          // zoom is not secondary on a graph.
          "rounded-control text-ink-muted hover:text-ink flex size-8 items-center justify-center",
          pressable,
          controlBase,
          overlayStates,
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}
