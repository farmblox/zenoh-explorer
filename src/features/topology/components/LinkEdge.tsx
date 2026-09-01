import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";

import { cn } from "@/lib/cn";
import { edgeStyle, type EdgeKind } from "../lib/edgeStyle";

/** What an edge needs to render. React Flow requires an index signature. */
export type LinkEdgeData = {
  /** Transport protocol, when we could determine it. */
  readonly protocol: string | null;
  /** How this link is classified — decides stroke, weight and dash. */
  readonly kind: EdgeKind;
  /** Node-level links this edge stands for, at the region level. */
  readonly weight: number;
  /** `true` when this edge touches the selected node. */
  readonly highlighted: boolean;
  /** Draws travelling dashes. Reserved for links carrying live traffic. */
  readonly flowing: boolean;
  [key: string]: unknown;
};

export type LinkEdgeType = Edge<LinkEdgeData, "link">;

/**
 * A link between two nodes, or between two regions.
 *
 * Everything about how it is drawn is a fact about the link. Thickness is its
 * place in the hierarchy — a router-to-router trunk carries everyone's traffic
 * and looks like it. A dash means the link is either incidental (peer to peer,
 * bypassing the routers) or unconfirmed, and the colour separates those two.
 * Selecting a node lifts its own links out of the mesh in the accent colour.
 */
export function LinkEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<LinkEdgeType>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  // Two thirds of the way to the target rather than the midpoint the path
  // helper returns: edges fanning out of one node share a source, so their
  // midpoints coincide and every chip lands in the same place.
  const labelX = sourceX + (targetX - sourceX) * 0.66;
  const labelY = sourceY + (targetY - sourceY) * 0.66;

  const highlighted = data?.highlighted ?? false;
  const weight = data?.weight ?? 1;
  const style = edgeStyle(data?.kind ?? "access");

  // A region edge stands for many node-level links, so weight reads as
  // thickness — capped, so a busy pair does not become a slab.
  const width = weight > 1 ? Math.min(3.5, 1.5 + Math.log2(weight)) : style.width;

  // Labelling every edge buries the graph in chips that collide wherever edges
  // fan out from one node, and repeats "quic" four times to say nothing. A
  // chip appears when the edge is one you asked about by selecting its node,
  // when it stands for several links, or when something about it is wrong.
  const label =
    weight > 1
      ? `×${weight}`
      : highlighted || data?.kind === "unconfirmed"
        ? (data?.protocol ?? null)
        : null;

  return (
    <>
      <BaseEdge
        path={path}
        // Spread rather than passed directly: React Flow types `markerEnd` as a
        // plain `string?`, and under `exactOptionalPropertyTypes` an explicit
        // `undefined` is not the same as omitting it.
        {...(markerEnd ? { markerEnd } : {})}
        style={{
          stroke: highlighted ? "var(--accent)" : style.stroke,
          strokeWidth: highlighted ? Math.max(2, width) : width,
          ...(style.dash ? { strokeDasharray: style.dash } : {}),
          transition: "stroke var(--duration-fast) var(--ease-standard)",
        }}
      />

      {/* A second stroke on top, carrying the motion. Separate from the edge
          itself so a link never has to choose between showing its own
          classification and showing that traffic is moving along it. */}
      {data?.flowing ? (
        <path
          d={path}
          fill="none"
          stroke="var(--accent-strong)"
          strokeWidth={Math.max(2, width)}
          strokeLinecap="round"
          strokeDasharray="6 20"
          className="pointer-events-none motion-safe:animate-[wire-flow_1.9s_linear_infinite]"
        />
      ) : null}

      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={cn(
              "numeric rounded-inner absolute border px-1.5 py-0.5",
              "text-tiny pointer-events-none font-medium",
              "transition-colors duration-(--duration-fast)",
              highlighted
                ? "border-accent/40 bg-surface-1 text-accent-strong"
                : data?.kind === "unconfirmed"
                  ? "border-warn/40 bg-surface-1 text-warn"
                  : "border-line bg-surface-1 text-ink-faint",
            )}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
