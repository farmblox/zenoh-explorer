import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { NodeKindIcon } from "@/components/domain";
import { Meter } from "@/components/ui";
import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";
import { rate as formatRate } from "@/lib/format";
import { NODE_SIZE } from "../lib/layout";

/** What a node card needs to render. React Flow requires an index signature. */
export type NodeCardData = {
  readonly zid: string;
  readonly label: string;
  readonly kind: "router" | "peer" | "client";
  readonly isLocal: boolean;
  readonly linkCount: number;
  readonly locator: string | null;
  /** Messages per second, when the node reports it. */
  readonly rate: number | null;
  /** This node's share of the busiest node's traffic, 0 to 1. */
  readonly share: number | null;
  /** What the node has declared, already phrased — "14 subs · 3 queryables". */
  readonly declarations: string | null;
  /**
   * `false` when the node was only reported by somebody else — a scout reply or
   * a link-state entry — rather than describing itself or holding a session
   * with us.
   */
  readonly firsthand: boolean;
  /** Set when something about this node needs attention. */
  readonly alert: string | null;
  /** Opens the full inspector. */
  readonly onInspect?: (zid: string) => void;
  /** Opens the route trace panel from this node. */
  readonly onTrace?: (zid: string) => void;
  [key: string]: unknown;
};

export type NodeCardNode = Node<NodeCardData, "zenohNode">;

/**
 * One Zenoh node.
 *
 * At rest it is a single row — glyph, name, rate — sized by role, so the shape
 * of the graph carries the shape of the network before any label is read.
 * Selecting it expands the card downwards in place to add what it has declared,
 * its share of the region's traffic, and the two things you would do next.
 *
 * Expanding IN PLACE rather than floating a panel over the canvas matters: the
 * detail stays anchored to the node it describes, and nothing it covers was
 * something you were looking at.
 */
export function NodeCard({
  data,
  selected,
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
}: NodeProps<NodeCardNode>) {
  const size = NODE_SIZE[data.kind];

  return (
    <div
      // Width is fixed by role; height is fixed only while collapsed, so the
      // expansion grows downwards and no neighbour shifts sideways.
      style={{ width: size.width, ...(selected ? {} : { height: size.height }) }}
      title={
        data.firsthand
          ? undefined
          : "Reported by another node — the explorer has not heard from this one directly"
      }
      className={cn(
        "rounded-panel bg-surface-2 border",
        // Dashed means hearsay, the same thing it means on a link we could only
        // confirm from one end. One vocabulary for "we are less sure of this",
        // whether it is drawn as a node or an edge.
        data.firsthand ? "border-solid" : "border-dashed",
        "transition-[border-color,box-shadow] duration-(--duration-fast) ease-(--ease-standard)",
        selected
          ? "border-accent shadow-[0_0_0_3px_var(--accent-subtle)]"
          : data.isLocal
            ? "border-ok/50"
            : "border-line hover:border-ink-faint",
      )}
    >
      {/* One of each, unnamed, positioned from the node's own props. React Flow
          attaches an edge's tail to a `source` and its head to a `target`, and
          falls back to the unnamed handle of each type when an edge does not
          name one — so a node carrying only sources silently draws no edges at
          all rather than erroring. */}
      <Handle
        type="target"
        position={targetPosition}
        isConnectable={false}
        className="!border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={sourcePosition}
        isConnectable={false}
        className="!border-0 !bg-transparent"
      />

      <div
        className={cn("flex items-center gap-2.5 px-3", selected ? "pt-2.5" : "h-full")}
        style={selected ? undefined : { height: size.height }}
      >
        <NodeKindIcon kind={data.kind} local={data.isLocal} />

        <span className="text-small text-ink min-w-0 flex-1 truncate" title={data.zid}>
          {data.label}
        </span>

        <span className="numeric text-tiny text-ink-faint shrink-0">
          {data.rate === null ? data.linkCount : formatRate(data.rate)}
        </span>

        {data.alert && !selected ? (
          <span className="bg-warn size-[7px] shrink-0 rounded-full" title={data.alert} />
        ) : null}
      </div>

      {selected ? (
        <div className="animate-fade-in">
          <div className="flex items-baseline gap-2.5 px-3 pt-2.5">
            <span className="text-tiny text-ink-muted min-w-0 flex-1 truncate">
              {data.declarations ?? `${data.linkCount} links`}
            </span>
            {data.share !== null ? (
              <span className="numeric text-tiny text-ink-faint shrink-0">
                {Math.round(data.share * 100)}%
              </span>
            ) : null}
          </div>

          {data.share !== null ? (
            <Meter
              value={data.share}
              size="xs"
              tone="accent"
              label={`${data.label} share of the region's links`}
              className="mx-3 mt-2"
            />
          ) : null}

          {data.alert ? <p className="text-tiny text-warn px-3 pt-2.5">{data.alert}</p> : null}

          <div className="border-line-soft bg-surface-1 mt-3 flex items-center gap-2.5 rounded-b-[calc(var(--radius-panel)-1px)] border-t px-3 py-2">
            <CardAction onClick={() => data.onInspect?.(data.zid)}>Inspect</CardAction>
            <span className="bg-line h-3 w-px" aria-hidden />
            <CardAction onClick={() => data.onTrace?.(data.zid)}>Trace route</CardAction>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A text action in the selected card's footer. */
function CardAction({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      // React Flow treats a pointerdown on a node as the start of a drag, so
      // the action has to claim the event before the canvas sees it.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
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
