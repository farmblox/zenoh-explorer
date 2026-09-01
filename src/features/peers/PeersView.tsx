import { Users } from "lucide-react";

import { Badge, DataTable, EmptyState, type Column } from "@/components/ui";
import { NodeKindIcon, Zid } from "@/components/domain";
import { session as sessionIpc, type TransportSummary } from "@/ipc";
import { useAsync } from "@/hooks";
import { useActiveSessionId } from "@/stores";
import { ViewHeader } from "@/shell/ViewHeader";

const COLUMNS: readonly Column<TransportSummary>[] = [
  {
    id: "kind",
    header: "",
    width: 32,
    resizable: false,
    cell: (row) => <NodeKindIcon kind={row.kind} />,
  },
  { id: "zid", header: "Zid", width: 200, cell: (row) => <Zid zid={row.zid} copyable /> },
  {
    id: "links",
    header: "Links",
    width: 70,
    align: "right",
    cell: (row) => <span className="numeric text-ink-muted">{row.links.length}</span>,
  },
  {
    id: "features",
    header: "Features",
    width: 190,
    cell: (row) => (
      <span className="flex gap-1">
        {row.qos ? <Badge tone="accent">qos</Badge> : null}
        {row.shm ? <Badge tone="ok">shm</Badge> : null}
        {row.multicast ? <Badge tone="neutral">mcast</Badge> : null}
      </span>
    ),
  },
  // Last, because it is the flexible one. A flex column in the middle expands
  // while its content stays short, which opens a hole inside the table instead
  // of leaving slack at the edge where it reads as margin.
  {
    id: "locator",
    header: "Locator",
    width: "flex",
    cell: (row) => (
      <span className="numeric text-ink-muted truncate">{row.links[0]?.dst ?? "–"}</span>
    ),
  },
];

/**
 * Directly connected transports.
 *
 * The one topology source that never fails: this comes from the local session's
 * own view, so it works even against nodes with their admin space switched off.
 */
export function PeersView() {
  const sessionId = useActiveSessionId();
  const { data, loading } = useAsync(
    () => (sessionId ? sessionIpc.transports(sessionId) : Promise.resolve([])),
    `transports:${sessionId ?? ""}`,
    { enabled: sessionId !== null },
  );

  if (!sessionId) {
    return (
      <EmptyState
        icon={<Users />}
        title="No session"
        description="Connect to a Zenoh network to see the transports it holds open."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title="Peers & sessions"
        subtitle={
          loading ? "Reading transports" : `${data?.length ?? 0} directly connected transports`
        }
      />
      <DataTable
        id="peers"
        columns={COLUMNS}
        rows={data ?? []}
        rowKey={(row) => row.zid}
        className="flex-1"
        empty={
          <EmptyState
            icon={<Users />}
            title="No transports"
            description="This session has no open transports. Check the endpoint in the connect dialog."
          />
        }
      />
    </div>
  );
}
