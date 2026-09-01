import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";

import { cn } from "@/lib/cn";
import type { EdgeKind } from "../lib/edgeStyle";

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

/** Stroke, weight and dash per classification. Mirrors `edgeStyle.ts`. */
const KINDS: Record<EdgeKind, { stroke: string; width: number; dash?: string; opacity: number }> = {
  trunk: { stroke: "var(--wire-strong)", width: 2.6, opacity: 1 },
  access: { stroke: "var(--wire)", width: 1.5, opacity: 0.9 },
  mesh: { stroke: "var(--wire)", width: 1.4, dash: "2 5", opacity: 0.55 },
  unconfirmed: { stroke: "var(--warn)", width: 1.6, dash: "4 7", opacity: 0.8 },
};

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
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const highlighted = data?.highlighted ?? false;
  const weight = data?.weight ?? 1;
  const style = KINDS[data?.kind ?? "access"];

  // A region edge stands for many node-level links, so weight reads as
  // thickness — capped, so a busy pair does not become a slab.
  const width = weight > 1 ? Math.min(3.5, 1.5 + Math.log2(weight)) : style.width;
  const label = weight > 1 ? `×${weight}` : (data?.protocol ?? null);

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
          opacity: highlighted ? 1 : style.opacity,
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
