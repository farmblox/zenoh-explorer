import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { NodeKindIcon } from "@/components/domain";
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
  /** What the node has declared, already phrased. */
  readonly declarations: string | null;
  /**
   * `false` when the node was only reported by somebody else — a scout reply or
   * a link-state entry — rather than describing itself or holding a session
   * with us.
   */
  readonly firsthand: boolean;
  /**
   * `true` when the node is outside the narrowed region and is only drawn
   * because something inside it links here.
   */
  readonly context: boolean;
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
        data.context
          ? "Outside the region you narrowed to — drawn because something inside it links here"
          : data.firsthand
            ? undefined
            : "Reported by another node — the explorer has not heard from this one directly"
      }
      className={cn(
        "rounded-panel bg-surface-2 border",
        transitionFast,
        // Held back rather than hidden. A narrowed region needs the routers it
        // hangs off to be legible — they are the answer to "how is this
        // attached" — while still reading as not part of the region.
        data.context && !selected && "opacity-[0.55]",
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
      {/* Invisible. React Flow needs a handle to anchor an edge to, but drawing
          one puts a dot on every side of every card whether an edge lands there
          or not — and a port with nothing attached reads as debris. The edge
          meeting the card's edge already shows where it attaches. */}
      <Handle
        type="target"
        position={targetPosition}
        isConnectable={false}
        className="!size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={sourcePosition}
        isConnectable={false}
        className="!size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent"
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

        <span className="text-small text-ink min-w-0 flex-1 truncate">{data.label}</span>

        {/* Only a RATE goes here, never a bare count. A number in the corner of
            a card has to explain itself, and "4.2k/s" does where "4" does not —
            especially beside a graph that already draws the links it would be
            counting. Empty until the admin space reports throughput. */}
        {data.rate !== null ? (
          <span className="numeric text-tiny text-ink-muted shrink-0">{formatRate(data.rate)}</span>
        ) : null}

        {/* The one thing the graph around it cannot show. */}
        {data.alert && !selected ? (
          <span
            className="bg-warn size-[7px] shrink-0 rounded-full"
            title={data.alert}
            aria-label={data.alert}
          />
        ) : null}
      </div>

      {selected ? (
        <div className="animate-fade-in">
          {/* What it is, and what is wrong with it. No share bar: a ratio of
              this node's links to the busiest node's would read 100% on every
              router and dress an invented number as a measurement. The counts
              that are real live in the inspector. */}
          <div className={cn("flex flex-col gap-1.5", GUTTER)}>
            <p className="text-tiny text-ink-muted truncate">{data.declarations}</p>
            {data.alert ? <p className="text-tiny text-warn truncate">{data.alert}</p> : null}
          </div>

          <div
            className={cn(
              "border-line-soft bg-surface-1 mt-3 flex items-center gap-2.5 border-t py-2.5",
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
