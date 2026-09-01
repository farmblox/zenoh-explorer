import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

import { Mix, StatusDot } from "@/components/ui";
import { cn } from "@/lib/cn";
import { groupedNumber } from "@/lib/format";
import { REGION_SIZE } from "../lib/layout";
import { describeRegion } from "../lib/regionLabel";

/** What a region card needs to render. React Flow requires an index signature. */
export type RegionCardData = {
  readonly label: string;
  readonly total: number;
  readonly routers: number;
  readonly peers: number;
  readonly clients: number;
  readonly containsLocal: boolean;
  /** Links leaving this region for another. */
  readonly trunks: number;
  /** A few member names, so the card says who is in here and not only how many. */
  readonly members: readonly string[];
  [key: string]: unknown;
};

export type RegionCardNode = Node<RegionCardData, "region">;

/**
 * A whole region, collapsed to one card.
 *
 * The top level of the topology view. Drawing two thousand nodes at once is a
 * picture of nothing, so the first thing you see is one card per region.
 *
 * The card names a few of its members rather than only counting them. "Five
 * nodes" tells you the size of a thing you then have to open to identify;
 * "rtr-edge-1, agv-07, agv-11 and two more" often answers the question outright,
 * which is the difference between a summary and a lookup you have to pay for.
 */
export function RegionCard({ data, selected }: NodeProps<RegionCardNode>) {
  // Zenoh's identifier is what gets shown; the explanation is the tooltip.
  const region = describeRegion(data.label);
  const isolated = data.trunks === 0;
  const shown = data.members.slice(0, 3);
  const rest = data.total - shown.length;

  return (
    <div
      style={REGION_SIZE}
      className={cn(
        "rounded-panel bg-surface-2 flex flex-col overflow-hidden border",
        "transition-[border-color,box-shadow] duration-(--duration-fast)",
        selected
          ? "border-accent shadow-[0_0_0_3px_var(--accent-subtle)]"
          : "border-line hover:border-ink-faint",
      )}
    >
      {/* Edges attach here. Hidden, because a region card is not something the
          user connects by hand — the graph is read-only. */}
      <Handle type="target" position={Position.Left} className="!opacity-0" isConnectable={false} />
      <Handle
        type="source"
        position={Position.Right}
        className="!opacity-0"
        isConnectable={false}
      />

      <div className="flex-1 p-5">
        <header className="flex items-baseline gap-2.5">
          <StatusDot status={data.containsLocal ? "live" : "idle"} className="translate-y-[-1px]" />
          <span
            className="text-ink numeric min-w-0 flex-1 truncate text-base font-medium"
            title={region.description}
          >
            {region.id}
          </span>
          <span className="numeric text-metric text-ink tracking-title shrink-0 font-medium">
            {groupedNumber(data.total)}
          </span>
        </header>

        <p className="text-tiny text-ink-faint mt-1" title={region.description}>
          {region.summary}
        </p>

        <Mix
          className="mt-4"
          legend
          segments={[
            { key: "routers", label: "routers", value: data.routers, tone: "accent" },
            { key: "peers", label: "peers", value: data.peers, tone: "accent-soft" },
            { key: "clients", label: "clients", value: data.clients, tone: "accent-faint" },
          ]}
        />

        {shown.length > 0 ? (
          <p className="text-tiny text-ink-muted mt-4 truncate" title={data.members.join(", ")}>
            {shown.join(", ")}
            {rest > 0 ? <span className="text-ink-faint"> +{groupedNumber(rest)} more</span> : null}
          </p>
        ) : null}
      </div>

      <footer
        className={cn(
          "border-line-soft flex items-center gap-2.5 border-t px-5 py-3",
          isolated ? "bg-warn-subtle" : "bg-surface-1",
        )}
      >
        <span
          className={cn(
            "text-tiny min-w-0 flex-1 truncate",
            isolated ? "text-warn" : "text-ink-faint",
          )}
        >
          {isolated
            ? "Reaches no other region"
            : `${data.trunks} link${data.trunks === 1 ? "" : "s"} out`}
        </span>
        <span className="text-tiny text-accent shrink-0 font-medium">Open →</span>
      </footer>
    </div>
  );
}
