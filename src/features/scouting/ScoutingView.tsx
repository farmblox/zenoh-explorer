import { Radar } from "lucide-react";

import { Badge, Button, DataTable, EmptyState, Spinner, type Column } from "@/components/ui";
import { NodeKindIcon, Zid } from "@/components/domain";
import { topology as topologyIpc, type ScoutedNode } from "@/ipc";
import { useAsync } from "@/hooks";
import { relativeTime } from "@/lib/format";
import { ViewHeader } from "@/shell/ViewHeader";

const COLUMNS: readonly Column<ScoutedNode>[] = [
  {
    id: "kind",
    header: "",
    width: 32,
    resizable: false,
    cell: (row) => <NodeKindIcon kind={row.kind} />,
  },
  { id: "zid", header: "Zid", width: 220, cell: (row) => <Zid zid={row.zid} copyable /> },
  {
    id: "seen",
    header: "Seen",
    width: 110,
    align: "right",
    cell: (row) => <span className="text-ink-faint">{relativeTime(row.seenAtMs)}</span>,
  },
  {
    id: "locators",
    header: "Locators",
    width: "flex",
    cell: (row) => (
      <span className="numeric text-ink-muted truncate" title={row.locators.join(", ")}>
        {row.locators.join("  ") || "–"}
      </span>
    ),
  },
];

/**
 * Scouting: nodes that are reachable but not connected.
 *
 * The only view that works with no session open, which is deliberate — it is
 * how you find a network before you can connect to one.
 */
export function ScoutingView() {
  const { data, loading, reload } = useAsync(() => topologyIpc.scout(2_000), "scout");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title="Scouting"
        subtitle="Nodes answering multicast and gossip scouts on this network"
        actions={
          <Button
            icon={loading ? <Spinner /> : <Radar size={13} />}
            onClick={reload}
            disabled={loading}
          >
            {loading ? "Listening…" : "Scout again"}
          </Button>
        }
      />
      <DataTable
        id="scouting"
        columns={COLUMNS}
        rows={data ?? []}
        rowKey={(row) => row.zid}
        className="flex-1"
        empty={
          <EmptyState
            icon={<Radar />}
            title={loading ? "Listening" : "Nothing answered"}
            description={
              loading
                ? "Waiting for scout replies."
                : "No node replied. Multicast scouting is often blocked across subnets — connect directly by endpoint instead."
            }
            action={
              !loading ? <Badge tone="neutral">UDP multicast on 224.0.0.224:7446</Badge> : undefined
            }
          />
        }
      />
    </div>
  );
}
