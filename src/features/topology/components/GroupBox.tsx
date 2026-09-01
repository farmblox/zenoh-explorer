import type { Node, NodeProps } from "@xyflow/react";

import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

/** What a group box needs to render. React Flow requires an index signature. */
export type GroupBoxData = {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  /** Node count and anything else worth putting in the chip, already formatted. */
  readonly stats: string;
  /** Set when something inside the box needs attention. */
  readonly alert: string | null;
  [key: string]: unknown;
};

export type GroupBoxNode = Node<GroupBoxData, "group">;

/**
 * The dashed container behind a set of nodes.
 *
 * Dashed rather than solid because the boundary is the explorer's reading of
 * the network, not a thing the network has: a region is a metadata convention
 * and a router's catchment is inferred from links. A solid border would claim
 * more than we know.
 *
 * The label rides on the top edge so the box costs no vertical room, and the
 * box itself never takes a pointer event — clicking inside it selects the node
 * you clicked, not the box.
 */
export function GroupBox({ data }: NodeProps<GroupBoxNode>) {
  return (
    <div
      style={{ width: data.width, height: data.height }}
      className="border-line bg-fill rounded-dialog pointer-events-none border border-dashed"
    >
      <div
        className={cn(
          "rounded-control border-line bg-surface-1 absolute -top-[13px] left-3",
          "flex h-[26px] max-w-[calc(100%-24px)] items-center gap-2.5 border px-2.5",
        )}
      >
        <span className="text-tiny text-ink truncate font-medium">{data.label}</span>
        <span className="bg-line h-3 w-px shrink-0" aria-hidden />
        <span className="numeric text-tiny text-ink-faint shrink-0">{data.stats}</span>
        {data.alert ? (
          <Badge tone="warn" dot className="shrink-0">
            {data.alert}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
