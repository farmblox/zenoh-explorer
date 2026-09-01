import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { NodeKindIcon } from "@/components/domain";
import { Meter } from "@/components/ui";
import { cn } from "@/lib/cn";
import { rate as formatRate } from "@/lib/format";
import { focusRing, transitionFast } from "@/lib/states";
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
  /** This node's share of the busiest node's links, 0 to 1. */
  readonly share: number | null;
  /** What the node has declared, already phrased. */
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
 * The card's inner gutter.
 *
 * One value, not one per role: the roles differ in how much room they get, not
 * in how far their contents sit from the edge, and three gutters made the
 * glyphs fail to line up between a router and the client beneath it.
 */
const GUTTER = "px-3.5";

/**
 * One Zenoh node.
 *
 * At rest it is a single row — glyph, name, value — sized by role, so the shape
 * of the graph carries the shape of the network before any label is read. The
 * glyph stays quiet until the node is selected: a graph where everything is
 * accent-coloured has nothing left to say when one node matters.
 *
 * Selecting it expands the card downwards IN PLACE rather than floating a panel
 * over the canvas, so the detail stays attached to the node it describes and
 * nothing it covers was something you were looking at.
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
      // Width is fixed by role; height only while collapsed, so the expansion
      // grows downwards and no neighbour shifts sideways.
      style={{ width: size.width, ...(selected ? {} : { height: size.height }) }}
      title={
        data.firsthand
          ? undefined
          : "Reported by another node — the explorer has not heard from this one directly"
      }
      className={cn(
        "rounded-panel bg-surface-2 border",
        transitionFast,
        // Dashed means hearsay, the same thing it means on a link only one end
        // confirmed. One vocabulary for "we are less sure of this".
        data.firsthand ? "border-solid" : "border-dashed",
        selected
          ? "border-accent shadow-[0_0_0_3px_var(--accent-subtle)]"
          : data.isLocal
            ? "border-ok/50"
            : "border-line hover:border-ink-faint",
      )}
    >
      {/* Visible, unlike most React Flow handles: on a read-only graph they are
          not connection points but a legible statement of where an edge meets
          the card, which keeps a fan of edges from appearing to touch the text. */}
      <Handle
        type="target"
        position={targetPosition}
        isConnectable={false}
        className="!border-line !bg-surface-3 !size-2 !rounded-full !border"
      />
      <Handle
        type="source"
        position={sourcePosition}
        isConnectable={false}
        className="!border-line !bg-surface-3 !size-2 !rounded-full !border"
      />

      <div
        className={cn(
          "flex items-center gap-2.5",
          GUTTER,
          // Collapsed, the card sets the height and the row fills it. Setting
          // the height here as well left the padding fighting it, which is what
          // made the single row look loose in a box that was already snug.
          selected ? "pt-3 pb-2.5" : "h-full",
        )}
      >
        <NodeKindIcon
          kind={data.kind}
          local={data.isLocal}
          alert={data.alert !== null}
          selected={selected}
        />

        <span className="text-small text-ink min-w-0 flex-1 truncate font-normal">
          {data.label}
        </span>

        <span
          className={cn("numeric text-tiny shrink-0", data.alert ? "text-warn" : "text-ink-muted")}
        >
          {data.rate === null ? data.linkCount : formatRate(data.rate)}
        </span>

        {data.alert && !selected ? (
          <span className="bg-warn size-[7px] shrink-0 rounded-full" title={data.alert} />
        ) : null}
      </div>

      {selected ? (
        <div className="animate-fade-in">
          <div className={cn("flex items-baseline gap-2.5", GUTTER)}>
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
              className="mx-3.5 mt-2"
            />
          ) : null}

          {data.alert ? (
            <p className={cn("text-tiny text-warn pt-2.5", GUTTER)}>{data.alert}</p>
          ) : null}

          <div
            className={cn(
              "border-line-soft bg-surface-1 mt-3 flex items-center gap-2.5 border-t py-2",
              "rounded-b-[calc(var(--radius-panel)-1px)]",
              GUTTER,
            )}
          >
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
