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
  [key: string]: unknown;
};

export type RegionCardNode = Node<RegionCardData, "region">;

/**
 * A whole region, collapsed to one card.
 *
 * This is the top level of the topology view. Drawing two thousand nodes at
 * once is a picture of nothing, so the first thing you see is one card per
 * region with its composition, and you open the one you care about.
 */
export function RegionCard({ data, selected }: NodeProps<RegionCardNode>) {
  // Zenoh's identifier is what gets shown; the explanation is the tooltip.
  const region = describeRegion(data.label);
  const isolated = data.trunks === 0;

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

      <div className="flex-1 p-4">
        <header className="flex items-center gap-2.5">
          <StatusDot status={data.containsLocal ? "live" : "idle"} />
          <span
            className="text-ink numeric min-w-0 flex-1 truncate text-base font-medium"
            title={region.description}
          >
            {region.id}
          </span>
          <span className="numeric text-small text-ink shrink-0 font-medium">
            {groupedNumber(data.total)}
          </span>
        </header>

        <p className="text-tiny text-ink-faint mt-2 line-clamp-2" title={region.description}>
          {region.description}
        </p>

        <Mix
          className="mt-3.5"
          legend
          segments={[
            { key: "routers", label: "routers", value: data.routers, tone: "accent" },
            { key: "peers", label: "peers", value: data.peers, tone: "neutral" },
            { key: "clients", label: "clients", value: data.clients, tone: "ok" },
          ]}
        />
      </div>

      <footer
        className={cn(
          "border-line-soft flex items-center gap-2.5 border-t px-4 py-2.5",
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
            ? "No link to any other region"
            : `${data.trunks} link${data.trunks === 1 ? "" : "s"} to other regions`}
        </span>
        <span className="text-tiny text-accent shrink-0 font-medium">Open →</span>
      </footer>
    </div>
  );
}
