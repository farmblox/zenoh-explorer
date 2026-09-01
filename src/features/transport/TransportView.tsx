import { useMemo, useState } from "react";
import { Cable } from "lucide-react";

import { Zid } from "@/components/domain";
import {
  Badge,
  DataTable,
  EmptyState,
  Panel,
  ResizablePanel,
  ScrollArea,
  Spinner,
  StatCell,
  StatGrid,
  type Column,
} from "@/components/ui";
import { useAsync } from "@/hooks";
import { session as sessionIpc, type LinkLocators, type TransportSummary } from "@/ipc";
import { bytes, groupedNumber } from "@/lib/format";
import { useActiveSessionId, useLiveEpoch } from "@/stores";
import { ViewHeader } from "@/shell/ViewHeader";

/** A link, flattened with the transport it belongs to so it can fill a row. */
interface LinkRow {
  readonly transport: TransportSummary;
  readonly link: LinkLocators;
  readonly key: string;
}

/** The protocol a locator names, which is everything before the first slash. */
function protocolOf(locator: string): string {
  const [protocol] = locator.split("/");
  return protocol ?? "unknown";
}

const COLUMNS: readonly Column<LinkRow>[] = [
  {
    id: "protocol",
    header: "Proto",
    width: 76,
    cell: (row) => <Badge mono>{protocolOf(row.link.dst)}</Badge>,
  },
  {
    id: "remote",
    header: "Remote end",
    width: 220,
    cell: (row) => (
      <span className="numeric text-ink truncate" title={row.link.dst}>
        {row.link.dst}
      </span>
    ),
  },
  {
    id: "local",
    header: "Local end",
    width: 200,
    cell: (row) => (
      <span className="numeric text-ink-muted truncate" title={row.link.src}>
        {row.link.src}
      </span>
    ),
  },
  {
    id: "peer",
    header: "Far node",
    width: 132,
    cell: (row) => <Zid zid={row.transport.zid} />,
  },
  {
    id: "mtu",
    header: "MTU",
    width: 84,
    align: "right",
    cell: (row) => <span className="numeric text-ink">{groupedNumber(row.link.mtu)}</span>,
  },
  {
    id: "features",
    header: "Negotiated",
    width: 150,
    cell: (row) => (
      <div className="flex gap-1.5">
        {row.transport.qos ? <Badge tone="accent">QoS</Badge> : null}
        {row.transport.shm ? <Badge tone="ok">SHM</Badge> : null}
        {row.transport.multicast ? <Badge tone="neutral">multicast</Badge> : null}
      </div>
    ),
  },
  {
    id: "interfaces",
    header: "Interfaces",
    width: "flex",
    cell: (row) => (
      <span className="numeric text-ink-muted truncate">
        {row.link.interfaces.length > 0 ? row.link.interfaces.join(", ") : "—"}
      </span>
    ),
  },
];

/**
 * Every link this session holds open.
 *
 * One row per LINK, not per transport: a transport can carry several links and
 * the MTU, interface and protocol that matter are properties of the link. A
 * table keyed by transport would have to collapse those, which is exactly the
 * detail you came here for.
 */
export function TransportView() {
  const sessionId = useActiveSessionId();
  const [selected, setSelected] = useState<string | null>(null);

  // Transports announce themselves, so the epoch moves the moment one opens or
  // closes and this read re-runs. Nothing polls and nothing needs pressing.
  const epoch = useLiveEpoch(sessionId);

  const {
    data: transports,
    loading,
    error,
  } = useAsync(
    () => (sessionId ? sessionIpc.transports(sessionId) : Promise.resolve([])),
    `${sessionId ?? "none"}:${epoch}`,
    { enabled: sessionId !== null },
  );

  const rows = useMemo<LinkRow[]>(
    () =>
      (transports ?? []).flatMap((transport) =>
        transport.links.map((link, index) => ({
          transport,
          link,
          key: `${transport.zid}:${index}`,
        })),
      ),
    [transports],
  );

  const totals = useMemo(() => {
    const list = transports ?? [];
    return {
      transports: list.length,
      links: rows.length,
      // The smallest MTU on any link is the one that bounds a message crossing
      // this session, so it is the number worth surfacing.
      smallestMtu: rows.length > 0 ? Math.min(...rows.map((row) => row.link.mtu)) : 0,
      protocols: new Set(rows.map((row) => protocolOf(row.link.dst))).size,
    };
  }, [transports, rows]);

  const selectedRow = rows.find((row) => row.key === selected) ?? null;

  if (!sessionId) {
    return (
      <EmptyState
        icon={<Cable />}
        title="No session"
        description="Connect to a Zenoh network to see the links it holds open."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title="Transport"
        subtitle={`${groupedNumber(totals.links)} links across ${groupedNumber(totals.transports)} transports`}
      />

      <div className="border-line shrink-0 border-b">
        <StatGrid columns={4}>
          <StatCell label="Transports" value={groupedNumber(totals.transports)} />
          <StatCell label="Links" value={groupedNumber(totals.links)} />
          <StatCell label="Protocols in use" value={groupedNumber(totals.protocols)} />
          <StatCell
            label="Smallest MTU"
            value={totals.smallestMtu > 0 ? groupedNumber(totals.smallestMtu) : "—"}
            hint="Bounds any message crossing this session"
          />
        </StatGrid>
      </div>

      {error ? (
        <p className="bg-danger-subtle text-tiny text-danger shrink-0 px-5 py-2">{error}</p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <DataTable
          id="transport-links"
          className="flex-1"
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => row.key}
          selectedKey={selected}
          onSelect={(row) => setSelected(row.key === selected ? null : row.key)}
          empty={
            <EmptyState
              icon={loading ? <Spinner /> : <Cable />}
              title={loading ? "Reading transports" : "No links open"}
              description={
                loading
                  ? "Asking the session what it is connected to."
                  : "This session holds no transport. It is connected to nothing, or every peer has gone away."
              }
            />
          }
        />

        {selectedRow ? (
          <ResizablePanel
            id="transport-detail"
            side="right"
            defaultWidth={340}
            minWidth={280}
            maxWidth={560}
            label="Resize the link detail"
            className="border-line border-l"
          >
            <ScrollArea className="flex-1">
              <div className="space-y-4 p-4">
                <Panel title="Link">
                  <dl className="space-y-2.5">
                    <Field label="Protocol">{protocolOf(selectedRow.link.dst)}</Field>
                    <Field label="Remote">{selectedRow.link.dst}</Field>
                    <Field label="Local">{selectedRow.link.src}</Field>
                    <Field label="MTU">{`${groupedNumber(selectedRow.link.mtu)} bytes (${bytes(selectedRow.link.mtu)})`}</Field>
                    <Field label="Interfaces">
                      {selectedRow.link.interfaces.join(", ") || "not reported"}
                    </Field>
                  </dl>
                </Panel>

                <Panel title="Transport carrying it">
                  <dl className="space-y-2.5">
                    <Field label="Far node">{selectedRow.transport.zid}</Field>
                    <Field label="Role">{selectedRow.transport.kind}</Field>
                    <Field label="Links on it">{String(selectedRow.transport.links.length)}</Field>
                    <Field label="QoS">
                      {selectedRow.transport.qos ? "negotiated" : "not negotiated"}
                    </Field>
                    <Field label="Shared memory">
                      {selectedRow.transport.shm ? "negotiated" : "not negotiated"}
                    </Field>
                  </dl>
                </Panel>
              </div>
            </ScrollArea>
          </ResizablePanel>
        ) : null}
      </div>
    </div>
  );
}

/** A label/value pair inside a detail panel. */
function Field({ label, children }: { label: string; children: string }) {
  return (
    <div className="border-line-soft flex items-baseline justify-between gap-4 border-b pb-2.5 last:border-0 last:pb-0">
      <dt className="text-tiny text-ink-muted shrink-0">{label}</dt>
      <dd
        className="numeric selectable text-tiny text-ink min-w-0 truncate text-right"
        title={children}
      >
        {children}
      </dd>
    </div>
  );
}
