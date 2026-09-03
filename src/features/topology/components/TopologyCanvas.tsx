import { createNodeBorderProgram } from "@sigma/node-border";
import { fitViewportToNodes } from "@sigma/utils";
import Graph from "graphology";
import FA2LayoutSupervisor from "graphology-layout-forceatlas2/worker";
import { Maximize2, Minus, Plus } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Sigma from "sigma";
import {
  type EdgeLabelDrawingFunction,
  type NodeHoverDrawingFunction,
  type NodeLabelDrawingFunction,
} from "sigma/rendering";

import { NodeKindIcon } from "@/components/domain";
import { Tooltip } from "@/components/ui";
import type { NodeSummary, TopologySnapshot } from "@/ipc";
import { cn } from "@/lib/cn";
import { controlBase, focusRing, overlayStates, pressable, transitionFast } from "@/lib/states";
import { isObservedOnlyLink } from "../lib/edgeStyle";
import { label as nodeLabel } from "../lib/grouping";
import {
  buildSigmaGraph,
  type GraphPosition,
  type SigmaEdgeAttributes,
  type SigmaGraph,
  type SigmaNodeAttributes,
  type SigmaPalette,
} from "../lib/sigmaGraph";
import { isFirsthand } from "../lib/sources";
import { Legend } from "./Legend";

type SigmaRenderer = Sigma<SigmaNodeAttributes, SigmaEdgeAttributes>;
type LayoutSupervisor = FA2LayoutSupervisor<SigmaNodeAttributes, SigmaEdgeAttributes>;

/**
 * Three concentric layers make one compact network beacon.
 *
 * The outer layer is usually transparent. Routers use it to mark the backbone;
 * selected/local/warning nodes use it for state. That gives the map one quiet
 * resting texture and one precise place for colour to speak.
 */
const BeaconNodeProgram = createNodeBorderProgram<SigmaNodeAttributes, SigmaEdgeAttributes>({
  borders: [
    {
      size: { value: 0.18, mode: "relative" },
      color: { attribute: "haloColor", defaultValue: "#00000000" },
    },
    {
      size: { value: 0.14, mode: "relative" },
      color: { attribute: "borderColor", defaultValue: "#7d8590" },
    },
    { size: { fill: true }, color: { attribute: "color", defaultValue: "#242a32" } },
  ],
  drawLabel: drawBeaconLabel,
  drawHover: drawBeaconHover,
});

function drawBeaconHover(
  context: Parameters<NodeHoverDrawingFunction<SigmaNodeAttributes, SigmaEdgeAttributes>>[0],
  data: Parameters<NodeHoverDrawingFunction<SigmaNodeAttributes, SigmaEdgeAttributes>>[1],
  _settings: Parameters<NodeHoverDrawingFunction<SigmaNodeAttributes, SigmaEdgeAttributes>>[2],
): void {
  const beacon = data as typeof data & Pick<SigmaNodeAttributes, "hoverColor">;
  context.save();
  context.globalAlpha = 0.14;
  context.fillStyle = beacon.hoverColor;
  context.beginPath();
  context.arc(data.x, data.y, data.size + 7, 0, Math.PI * 2);
  context.fill();

  context.globalAlpha = 0.7;
  context.strokeStyle = beacon.hoverColor;
  context.lineWidth = 3;
  context.beginPath();
  context.arc(data.x, data.y, data.size + 3.5, 0, Math.PI * 2);
  context.stroke();

  context.restore();
  drawBeaconLabel(context, data, _settings);
}

/** A compact token-driven label with a role badge, readable at fitted zoom. */
function drawBeaconLabel(
  context: Parameters<NodeLabelDrawingFunction<SigmaNodeAttributes, SigmaEdgeAttributes>>[0],
  data: Parameters<NodeLabelDrawingFunction<SigmaNodeAttributes, SigmaEdgeAttributes>>[1],
  _settings: Parameters<NodeLabelDrawingFunction<SigmaNodeAttributes, SigmaEdgeAttributes>>[2],
): void {
  if (!data.label) return;
  const beacon = data as typeof data &
    Pick<SigmaNodeAttributes, "hoverColor" | "labelBackground" | "labelColor" | "roleLetter">;
  const x = data.x + data.size + 7;
  const height = 23;

  context.save();
  context.font = "580 12.5px IBM Plex Sans Variable";
  const textWidth = Math.ceil(context.measureText(data.label).width);
  const baseline = visibleTextBaseline(context, data.label, data.y);
  const width = textWidth + 37;
  const y = data.y - height / 2;

  roundedRectPath(context, x, y, width, height, 7);
  context.globalAlpha = 0.92;
  context.fillStyle = beacon.labelBackground;
  context.fill();
  context.globalAlpha = 0.26;
  context.strokeStyle = beacon.hoverColor;
  context.lineWidth = 1;
  context.stroke();

  context.globalAlpha = 0.8;
  context.fillStyle = beacon.hoverColor;
  context.font = "760 11px Geist Mono Variable";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillText(beacon.roleLetter, x + 11, baseline);

  context.globalAlpha = 1;
  context.fillStyle = beacon.labelColor;
  context.font = "580 12.5px IBM Plex Sans Variable";
  context.textAlign = "left";
  context.fillText(data.label, x + 24, baseline);
  context.restore();
}

/** Selected-link protocol, using the compact chip treatment from the old graph. */
function edgeLabelRenderer(
  palette: SigmaPalette,
): EdgeLabelDrawingFunction<SigmaNodeAttributes, SigmaEdgeAttributes> {
  return (context, edge, source, target) => {
    if (!edge.label) return;

    const text = edge.label;
    const x = source.x + (target.x - source.x) * 0.62;
    const y = source.y + (target.y - source.y) * 0.62;
    context.save();
    context.font = "580 11px Geist Mono Variable";
    const width = Math.ceil(context.measureText(text).width) + 12;
    const height = 20;

    roundedRectPath(context, x - width / 2, y - height / 2, width, height, 6);
    context.fillStyle = palette.surface1;
    context.fill();
    context.strokeStyle = palette.accent;
    context.lineWidth = 1;
    context.stroke();

    context.fillStyle = palette.accentStrong;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.fillText(text, x, visibleTextBaseline(context, text, y));
    context.restore();
  };
}

/** Baseline that centres the glyphs people see, rather than the font's em box. */
function visibleTextBaseline(
  context: CanvasRenderingContext2D,
  text: string,
  centreY: number,
): number {
  const metrics = context.measureText(text);
  return centreY + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

/** Callbacks offered by the selected graph node. */
export interface GraphActions {
  readonly onInspect: (zid: string) => void;
  readonly onTrace: (zid: string) => void;
}

export interface TopologyCanvasProps {
  snapshot: TopologySnapshot;
  selectedZid: string | null;
  /** Ordered node ids in the route Zenoh selected. */
  routeZids: readonly string[];
  /** Zids drawn only as context for a narrowed region. */
  anchors: ReadonlySet<string>;
  actions: GraphActions;
  /** Changes when filtering or a side panel changes the available viewport. */
  framingKey: string;
  onSelectNode: (zid: string | null) => void;
}

/** How long ForceAtlas2 may refine a graph before the map becomes still. */
function layoutDuration(nodes: number): number {
  if (nodes < 200) return 650;
  if (nodes < 2_000) return 1_200;
  return 2_200;
}

/**
 * A WebGL topology map, with one rich HTML card for the selected node.
 *
 * Sigma owns only the high-cardinality layer: nodes, links, labels, camera and
 * hit testing. React still owns every control and every piece of prose. That is
 * the split that lets ten thousand nodes coexist without making a selected node
 * look like an anonymous dot.
 */
export function TopologyCanvas({
  snapshot,
  selectedZid,
  routeZids,
  anchors,
  actions,
  framingKey,
  onSelectNode,
}: TopologyCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const selectedCard = useRef<HTMLDivElement>(null);
  const renderer = useRef<SigmaRenderer | null>(null);
  const graph = useRef<SigmaGraph | null>(null);
  const layout = useRef<LayoutSupervisor | null>(null);
  const layoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reframeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positions = useRef(new Map<string, GraphPosition>());
  const structureKey = useRef<string | null>(null);
  const selected = useRef(selectedZid);
  const activeRoute = useRef(routeZids);
  const selectRef = useRef(onSelectNode);
  const dragging = useRef<string | null>(null);
  const palette = useSigmaPalette();

  useEffect(() => {
    selected.current = selectedZid;
  }, [selectedZid]);
  useEffect(() => {
    activeRoute.current = routeZids;
  }, [routeZids]);
  useEffect(() => {
    selectRef.current = onSelectNode;
  }, [onSelectNode]);

  const selectedNode = useMemo(
    () => snapshot.nodes.find((node) => node.zid === selectedZid) ?? null,
    [snapshot.nodes, selectedZid],
  );
  const selectedDetails = useMemo(
    () => (selectedNode ? describeSelection(selectedNode, snapshot) : null),
    [selectedNode, snapshot],
  );

  const stopLayout = useCallback(() => {
    if (layoutTimer.current !== null) clearTimeout(layoutTimer.current);
    layoutTimer.current = null;
    layout.current?.kill();
    layout.current = null;
  }, []);

  const positionSelectedCard = useCallback(() => {
    const sigma = renderer.current;
    const currentGraph = graph.current;
    const card = selectedCard.current;
    const zid = selected.current;
    if (!sigma || !currentGraph || !card || !zid || !currentGraph.hasNode(zid)) return;

    const point = sigma.graphToViewport({
      x: currentGraph.getNodeAttribute(zid, "x"),
      y: currentGraph.getNodeAttribute(zid, "y"),
    });
    const { width, height } = sigma.getDimensions();
    const x = Math.max(142, Math.min(width - 142, point.x));
    const below = point.y < 128;
    const y = below ? Math.min(height - 24, point.y + 18) : Math.max(24, point.y - 18);

    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.style.transform = below ? "translate(-50%, 0)" : "translate(-50%, -100%)";
  }, []);

  const reframe = useCallback(() => {
    if (reframeTimer.current !== null) clearTimeout(reframeTimer.current);
    reframeTimer.current = setTimeout(() => {
      reframeTimer.current = null;
      const sigma = renderer.current;
      const currentGraph = graph.current;
      if (!sigma || !currentGraph) return;

      sigma.resize();
      const route = activeRoute.current.filter((candidate) => currentGraph.hasNode(candidate));
      if (route.length > 1) {
        sigma.setCustomBBox(null);
        void fitViewportToNodes(sigma as unknown as Sigma, route, { animate: true }).then(
          positionSelectedCard,
        );
        return;
      }
      const zid = selected.current;
      if (zid && currentGraph.hasNode(zid)) {
        sigma.setCustomBBox(null);
        const ids = [...graphNeighbourhood(currentGraph, zid)];
        void fitViewportToNodes(sigma as unknown as Sigma, ids, { animate: true }).then(
          positionSelectedCard,
        );
      } else {
        sigma.setCustomBBox(null);
        void sigma.getCamera().animatedReset({ duration: 220 });
      }
    }, 70);
  }, [positionSelectedCard]);

  // Create one renderer for this canvas. Snapshot changes swap its Graphology
  // graph below; they do not remount WebGL contexts or event handlers.
  useEffect(() => {
    const host = container.current;
    if (!host) return;

    const empty: SigmaGraph = new Graph({ multi: true, type: "undirected" });
    const sigma: SigmaRenderer = new Sigma<SigmaNodeAttributes, SigmaEdgeAttributes>(empty, host, {
      nodeProgramClasses: {
        beacon: BeaconNodeProgram,
      },
      defaultNodeType: "beacon",
      defaultEdgeType: "line",
      renderEdgeLabels: true,
      labelFont: "IBM Plex Sans Variable",
      labelSize: 13,
      labelWeight: "580",
      labelColor: { color: palette.inkMuted },
      edgeLabelFont: "Geist Mono Variable",
      edgeLabelSize: 11,
      edgeLabelWeight: "580",
      edgeLabelColor: { color: palette.inkFaint },
      defaultDrawEdgeLabel: edgeLabelRenderer(palette),
      labelDensity: 1.35,
      labelGridCellSize: 124,
      labelRenderedSizeThreshold: 0,
      stagePadding: 54,
      hideLabelsOnMove: false,
      minEdgeThickness: 1.2,
      antiAliasingFeather: 1.35,
      minCameraRatio: 0.015,
      maxCameraRatio: 12,
      zIndex: true,
    });
    renderer.current = sigma;
    graph.current = empty;
    structureKey.current = null;

    void document.fonts.ready.then(() => {
      if (renderer.current === sigma) sigma.refresh();
    });

    sigma.on("clickStage", () => selectRef.current(null));
    let hovered: string | null = null;
    sigma.on("enterNode", ({ node }) => {
      hovered = node;
      host.style.cursor = "grab";
    });
    sigma.on("leaveNode", ({ node }) => {
      if (hovered === node) hovered = null;
      if (dragging.current === null) host.style.cursor = "default";
    });
    sigma.on("downNode", ({ node, event }) => {
      event.preventSigmaDefault();
      stopLayout();
      if (node !== selected.current) selectRef.current(node);
      dragging.current = node;
      if (!sigma.getCustomBBox()) sigma.setCustomBBox(sigma.getBBox());
      sigma.getCamera().disable();
      host.style.cursor = "grabbing";
    });

    const mouse = sigma.getMouseCaptor();
    mouse.on("mousemovebody", (event) => {
      const node = dragging.current;
      const currentGraph = graph.current;
      if (!node || !currentGraph?.hasNode(node)) return;
      event.preventSigmaDefault();
      const point = sigma.viewportToGraph(event);
      currentGraph.mergeNodeAttributes(node, point);
      positions.current.set(node, point);
      positionSelectedCard();
    });
    mouse.on("mouseup", () => {
      dragging.current = null;
      sigma.getCamera().enable();
      host.style.cursor = hovered ? "grab" : "default";
    });

    sigma.getCamera().on("updated", positionSelectedCard);
    sigma.on("afterRender", positionSelectedCard);

    const resize = new ResizeObserver(() => {
      sigma.resize();
      sigma.scheduleRender();
      positionSelectedCard();
    });
    resize.observe(host);

    const savedPositions = positions.current;
    return () => {
      resize.disconnect();
      rememberPositions(graph.current, savedPositions);
      stopLayout();
      if (reframeTimer.current !== null) clearTimeout(reframeTimer.current);
      reframeTimer.current = null;
      sigma.kill();
      renderer.current = null;
      graph.current = null;
    };
  }, [palette, positionSelectedCard, stopLayout]);

  // Replace the graph in one operation. The worker starts only when nodes or
  // links changed; metadata-only snapshots retain the stable layout.
  useEffect(() => {
    const sigma = renderer.current;
    if (!sigma) return;

    rememberPositions(graph.current, positions.current);
    const built = buildSigmaGraph(snapshot, anchors, positions.current, palette);
    const changed = built.structureKey !== structureKey.current;
    structureKey.current = built.structureKey;
    graph.current = built.graph;
    sigma.setGraph(built.graph);
    sigma.setSetting("hideEdgesOnMove", snapshot.links.length > 15_000);
    sigma.setSetting("hideLabelsOnMove", snapshot.nodes.length > 2_000);
    applySelection(sigma, built.graph, selected.current, activeRoute.current, palette);
    requestAnimationFrame(() => {
      if (renderer.current !== sigma) return;
      sigma.resize(true);
      sigma.refresh();
      positionSelectedCard();
    });

    if (!changed) {
      positionSelectedCard();
      return;
    }

    stopLayout();
    sigma.setCustomBBox(null);
    sigma.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });

    if (built.graph.order > 1 && built.graph.size > 0) {
      const supervisor: LayoutSupervisor = new FA2LayoutSupervisor(built.graph, {
        getEdgeWeight: "weight",
        settings: {
          barnesHutOptimize: built.graph.order >= 500,
          barnesHutTheta: 0.55,
          adjustSizes: true,
          gravity: 1.15,
          scalingRatio: built.graph.order > 2_000 ? 12 : 7,
          slowDown: built.graph.order > 2_000 ? 8 : 4,
          edgeWeightInfluence: 1,
          linLogMode: true,
        },
      });
      layout.current = supervisor;
      supervisor.start();
      layoutTimer.current = setTimeout(() => {
        rememberPositions(built.graph, positions.current);
        supervisor.kill();
        if (layout.current === supervisor) layout.current = null;
        layoutTimer.current = null;
        sigma.refresh();
        void sigma.getCamera().animatedReset({ duration: 240 });
      }, layoutDuration(built.graph.order));
    }

    return stopLayout;
  }, [snapshot, anchors, palette, positionSelectedCard, stopLayout]);

  // Selection is a renderer reduction, not a graph rebuild. Only the picked
  // node and its incident links lift; Graphology positions stay untouched.
  useEffect(() => {
    const sigma = renderer.current;
    const currentGraph = graph.current;
    if (!sigma || !currentGraph) return;
    applySelection(sigma, currentGraph, selectedZid, routeZids, palette);
    if (selectedZid !== null) stopLayout();
    positionSelectedCard();
    reframe();
  }, [selectedZid, routeZids, palette, positionSelectedCard, reframe, stopLayout]);

  // Side panels and source/region changes alter available canvas width without
  // necessarily producing a browser resize event.
  useEffect(reframe, [framingKey, reframe]);

  const zoomOut = useCallback(
    () => void renderer.current?.getCamera().animatedUnzoom({ duration: 160 }),
    [],
  );
  const zoomIn = useCallback(
    () => void renderer.current?.getCamera().animatedZoom({ duration: 160 }),
    [],
  );
  const fit = useCallback(() => {
    const sigma = renderer.current;
    if (!sigma) return;
    sigma.setCustomBBox(null);
    void sigma.getCamera().animatedReset({ duration: 240 });
  }, []);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="canvas-grid relative min-h-0 flex-1 overflow-hidden">
        <div ref={container} className="absolute inset-0" aria-label="Zenoh network topology map" />

        {selectedNode && selectedDetails ? (
          <SelectedNodeCard
            ref={selectedCard}
            node={selectedNode}
            linkCount={selectedDetails.linkCount}
            alert={selectedDetails.alert}
            firsthand={selectedDetails.firsthand}
            onInspect={() => actions.onInspect(selectedNode.zid)}
            onTrace={() => actions.onTrace(selectedNode.zid)}
          />
        ) : null}
      </div>

      <div className="border-line bg-surface-0 flex h-11 shrink-0 items-center gap-3 border-t px-3">
        <ZoomControls onZoomOut={zoomOut} onZoomIn={zoomIn} onFit={fit} />
        <span className="bg-line h-3.5 w-px shrink-0" aria-hidden />
        <Legend className="flex-1" />
        <span className="numeric text-micro text-ink-disabled shrink-0">WebGL</span>
      </div>
    </div>
  );
}

function applySelection(
  sigma: SigmaRenderer,
  graph: SigmaGraph,
  selectedZid: string | null,
  routeZids: readonly string[],
  palette: SigmaPalette,
): void {
  const near = selectedZid ? graphNeighbourhood(graph, selectedZid) : new Set<string>();
  const routeNodes = new Set(routeZids);
  const routeEdges = new Set(
    routeZids.slice(1).map((zid, index) => edgePairKey(routeZids[index] ?? "", zid)),
  );
  const tracingRoute = routeZids.length > 0;

  sigma.setSettings({
    nodeReducer: (node, data) => {
      if (node === selectedZid) {
        return {
          ...data,
          color: palette.surface2,
          borderColor: data.alert ? palette.warn : palette.accentStrong,
          haloColor: palette.accent,
          highlighted: false,
          forceLabel: true,
          size: data.size + 2.5,
          zIndex: 20,
        };
      }
      if (tracingRoute && routeNodes.has(node)) {
        return {
          ...data,
          color: data.baseColor,
          borderColor: palette.accentStrong,
          haloColor: palette.accent,
          forceLabel: true,
          size: data.size + 1.5,
          zIndex: 16,
        };
      }
      if (tracingRoute) {
        return {
          ...data,
          color: palette.surface0,
          borderColor: palette.inkDisabled,
          haloColor: "#00000000",
          forceLabel: false,
          zIndex: 0,
        };
      }
      if (selectedZid && !near.has(node)) {
        return {
          ...data,
          color: palette.surface0,
          borderColor: palette.inkDisabled,
          haloColor: "#00000000",
          forceLabel: false,
          zIndex: 0,
        };
      }
      return {
        ...data,
        color: data.baseColor,
        borderColor: data.baseBorderColor,
        haloColor: data.baseHaloColor,
        zIndex: data.kind === "router" ? 4 : 2,
      };
    },
    edgeReducer: (_edge, data) => {
      const onRoute = routeEdges.has(edgePairKey(data.sourceZid, data.targetZid));
      if (onRoute) {
        return {
          ...data,
          color: palette.accentStrong,
          size: Math.max(5.6, data.size + 1.8),
          label: data.detailLabel,
          forceLabel: true,
          zIndex: 30,
        };
      }
      if (tracingRoute) {
        return {
          ...data,
          color: palette.line,
          size: Math.min(0.9, data.size),
          label: "",
          forceLabel: false,
          zIndex: 0,
        };
      }
      const highlighted =
        selectedZid !== null && (data.sourceZid === selectedZid || data.targetZid === selectedZid);
      if (highlighted) {
        return {
          ...data,
          color: palette.accent,
          size: Math.max(4.2, data.size + 0.8),
          label: data.detailLabel,
          forceLabel: true,
          zIndex: 10,
        };
      }
      if (selectedZid)
        return {
          ...data,
          color: palette.line,
          size: Math.min(1, data.size),
          label: "",
          forceLabel: false,
        };
      return { ...data, label: "", forceLabel: false };
    },
  });
}

function edgePairKey(left: string, right: string): string {
  return left <= right ? `${left}:${right}` : `${right}:${left}`;
}

interface SelectedNodeCardProps {
  node: NodeSummary;
  linkCount: number;
  alert: string | null;
  firsthand: boolean;
  onInspect: () => void;
  onTrace: () => void;
}

/** Selected node rendered once in HTML, not once per graph vertex. */
const SelectedNodeCard = forwardRef<HTMLDivElement, SelectedNodeCardProps>(
  function SelectedNodeCard({ node, linkCount, alert, firsthand, onInspect, onTrace }, ref) {
    return (
      <div
        ref={ref}
        role="status"
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          "rounded-panel border-accent bg-surface-2 shadow-popover absolute z-20 w-[268px] border",
          "animate-fade-in pointer-events-auto",
        )}
      >
        <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5">
          <NodeKindIcon kind={node.kind} local={node.isLocal} alert={alert !== null} selected />
          <span className="text-small text-ink min-w-0 flex-1 truncate">{nodeLabel(node)}</span>
          <span className="numeric text-tiny text-ink-faint shrink-0">
            {linkCount} {linkCount === 1 ? "link" : "links"}
          </span>
        </div>

        <div className="flex flex-col gap-1.5 px-3.5">
          <p className="text-tiny text-ink-muted truncate">
            {node.kind} · {firsthand ? "first-hand" : "reported"}
          </p>
          {alert ? <p className="text-tiny text-warn truncate">{alert}</p> : null}
        </div>

        <div className="border-line-soft bg-surface-1 mt-3 flex items-center gap-2.5 rounded-b-[calc(var(--radius-panel)-1px)] border-t px-3.5 py-2.5">
          <CardAction onClick={onInspect}>Inspect</CardAction>
          <span className="bg-line h-3 w-px" aria-hidden />
          <CardAction onClick={onTrace}>Trace route</CardAction>
        </div>
      </div>
    );
  },
);

function CardAction({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-inner text-tiny text-accent hover:text-accent-strong font-medium",
        focusRing,
        transitionFast,
      )}
    >
      {children}
    </button>
  );
}

function ZoomControls({
  onZoomOut,
  onZoomIn,
  onFit,
}: {
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <ZoomButton label="Zoom out" onClick={onZoomOut}>
        <Minus size={15} />
      </ZoomButton>
      <ZoomButton label="Zoom in" onClick={onZoomIn}>
        <Plus size={15} />
      </ZoomButton>
      <ZoomButton label="Fit the whole graph" onClick={onFit}>
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
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
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

function graphNeighbourhood(graph: SigmaGraph, zid: string): Set<string> {
  const ids = new Set([zid]);
  if (graph.hasNode(zid)) graph.forEachNeighbor(zid, (other) => ids.add(other));
  return ids;
}

function rememberPositions(source: SigmaGraph | null, target: Map<string, GraphPosition>): void {
  source?.forEachNode((zid, attributes) => {
    target.set(zid, { x: attributes.x, y: attributes.y });
  });
}

function describeSelection(
  node: NodeSummary,
  snapshot: TopologySnapshot,
): { linkCount: number; alert: string | null; firsthand: boolean } {
  let linkCount = 0;
  let observedOnly = 0;
  const byZid = new Map(snapshot.nodes.map((entry) => [entry.zid, entry]));
  for (const link of snapshot.links) {
    if (link.from !== node.zid && link.to !== node.zid) continue;
    linkCount += 1;
    if (isObservedOnlyLink(link, byZid)) observedOnly += 1;
  }
  return {
    linkCount,
    alert:
      linkCount === 0 && !node.isLocal
        ? "no links"
        : observedOnly > 0
          ? `${observedOnly} router transport${observedOnly === 1 ? "" : "s"} outside routing map`
          : null,
    firsthand: isFirsthand(node.source),
  };
}

/** Re-resolves WebGL colours whenever the document theme changes. */
function useSigmaPalette(): SigmaPalette {
  const [theme, setTheme] = useState(document.documentElement.dataset["theme"] ?? "dark");
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.dataset["theme"] ?? "dark");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return useMemo(() => readPalette(theme), [theme]);
}

function readPalette(_theme: string): SigmaPalette {
  const style = getComputedStyle(document.documentElement);
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const token = (name: string, fallback: string) =>
    sigmaColour(style.getPropertyValue(name).trim() || fallback, fallback, context);
  return {
    accent: token("--accent", "#5b9cf6"),
    accentStrong: token("--accent-strong", "#7db8ff"),
    ink: token("--ink", "#eef1f5"),
    inkMuted: token("--ink-muted", "#aab2bd"),
    inkFaint: token("--ink-faint", "#7b8490"),
    inkDisabled: token("--ink-disabled", "#505760"),
    surface0: token("--surface-0", "#0a0c0f"),
    surface1: token("--surface-1", "#111419"),
    surface2: token("--surface-2", "#181c22"),
    surface3: token("--surface-3", "#353d47"),
    line: token("--line", "#2a3038"),
    ok: token("--ok", "#68b889"),
    warn: token("--warn", "#d8a657"),
    wire: token("--wire", "#596674"),
    wireSoft: token("--wire-soft", "#46515d"),
    wireStrong: token("--wire-strong", "#8492a1"),
  };
}

/** Converts any browser-valid CSS colour into the hex-alpha syntax Sigma parses. */
function sigmaColour(
  value: string,
  fallback: string,
  context: CanvasRenderingContext2D | null,
): string {
  if (!context) return fallback;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = fallback;
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0, alpha = 255] = context.getImageData(0, 0, 1, 1).data;
  return `#${hex(red)}${hex(green)}${hex(blue)}${hex(alpha)}`;
}

function hex(value: number): string {
  return value.toString(16).padStart(2, "0");
}
