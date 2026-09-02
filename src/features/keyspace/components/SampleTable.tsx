import type { ReactNode } from "react";

import { Badge } from "@/components/ui";
import { KeyExpr, Zid } from "@/components/domain";
import { DataTable, type Column } from "@/components/ui";
import type { SampleRecord } from "@/ipc";
import { cn } from "@/lib/cn";
import { bytes, timeOfDay } from "@/lib/format";

/** Where Zenoh stops accepting a timestamp, in milliseconds. */
const DRIFT_LIMIT = 100;

/** Flagged well before the limit, so it is a warning rather than a post-mortem. */
const DRIFT_WARN = 50;

export interface SampleTableProps {
  samples: readonly SampleRecord[];
  selected: number | null;
  onSelect: (sample: SampleRecord) => void;
}

/** Fixed columns, so the layout does not reflow as rows stream in. */
const COLUMNS: readonly Column<SampleRecord>[] = [
  {
    id: "time",
    header: "Time",
    width: 104,
    cell: (row) => <span className="numeric text-ink-faint">{timeOfDay(row.receivedAtMs)}</span>,
  },
  {
    id: "key",
    header: "Key",
    width: 300,
    cell: (row) => <KeyExpr value={row.keyExpr} highlightWildcards={false} className="text-tiny" />,
  },
  {
    id: "kind",
    header: "Kind",
    width: 76,
    cell: (row) => <Badge tone={row.kind === "delete" ? "danger" : "neutral"}>{row.kind}</Badge>,
  },
  {
    id: "encoding",
    header: "Encoding",
    width: 150,
    cell: (row) => <span className="numeric text-ink-muted truncate">{row.encoding}</span>,
  },
  {
    id: "bytes",
    header: "Bytes",
    width: 72,
    align: "right",
    cell: (row) => <span className="numeric text-ink-muted">{bytes(row.payloadLen)}</span>,
  },
  {
    // Zenoh rejects data stamped more than 100ms from local time, so a drift
    // creeping toward that is a warning that samples are about to start
    // disappearing. Blank rather than zero when a sample carries no timestamp:
    // timestamping is off by default, and "0ms" would claim a healthy clock
    // where there is no clock reading at all.
    id: "drift",
    header: "Drift",
    width: 78,
    align: "right",
    cell: (row) =>
      row.driftMs === null ? (
        <span className="text-ink-faint">–</span>
      ) : (
        <span
          className={cn(
            "numeric",
            Math.abs(row.driftMs) >= DRIFT_WARN ? "text-warn" : "text-ink-muted",
          )}
          title={
            Math.abs(row.driftMs) >= DRIFT_WARN
              ? `Stamped by ${row.timestampZid ?? "an unknown clock"}. Zenoh rejects data more than ${DRIFT_LIMIT}ms from local time.`
              : `Stamped by ${row.timestampZid ?? "an unknown clock"}.`
          }
        >
          {row.driftMs > 0 ? "+" : ""}
          {row.driftMs}ms
        </span>
      ),
  },
  {
    id: "payload",
    header: "Payload",
    width: "flex",
    cell: (row) => (
      <span className="numeric text-ink-muted truncate" title={row.preview}>
        {row.previewIsHex ? <span className="text-warn">hex </span> : null}
        {row.preview}
        {row.truncated ? <span className="text-ink-faint"> …</span> : null}
        {/* An attachment is user-authored metadata riding alongside the
            payload. Invisible unless it is said to be there. */}
        {row.attachmentLen === null ? null : (
          <span className="text-accent" title={`Attachment: ${row.attachmentPreview ?? ""}`}>
            {" "}
            +{bytes(row.attachmentLen)} attached
          </span>
        )}
      </span>
    ),
  },
];

/** One labelled fact in the expanded detail. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-tiny text-ink-faint">{label}</dt>
      <dd className="text-small text-ink mt-0.5 truncate">{children}</dd>
    </div>
  );
}

/**
 * Everything about one sample, beneath the row it belongs to.
 *
 * The facts the table has no room for: which clock stamped it and how far that
 * is from local time, who published it, what the publisher asked for, and the
 * payload in full rather than a preview.
 */
function SampleDetail({ sample }: { sample: SampleRecord }) {
  return (
    <div className="space-y-3 px-5 py-3.5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
        <Fact label="Published by">
          {sample.sourceZid ? (
            <Zid zid={sample.sourceZid} copyable />
          ) : (
            <span className="text-ink-faint">not stated</span>
          )}
        </Fact>
        <Fact label="Stamped by">
          {sample.timestampZid ? (
            <Zid zid={sample.timestampZid} copyable />
          ) : (
            // Timestamping is off by default, so this is the common case and
            // not a fault worth colouring.
            <span className="text-ink-faint">unstamped</span>
          )}
        </Fact>
        <Fact label="Clock drift">
          {sample.driftMs === null ? (
            <span className="text-ink-faint">–</span>
          ) : (
            <span className={cn("numeric", Math.abs(sample.driftMs) >= DRIFT_WARN && "text-warn")}>
              {sample.driftMs > 0 ? "+" : ""}
              {sample.driftMs}ms
            </span>
          )}
        </Fact>
        <Fact label="Delivery">
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{sample.priority}</Badge>
            <Badge tone={sample.reliable ? "ok" : "neutral"}>
              {sample.reliable ? "reliable" : "best effort"}
            </Badge>
            {sample.express ? <Badge tone="accent">express</Badge> : null}
          </span>
        </Fact>
      </dl>

      <div>
        <div className="text-tiny text-ink-faint mb-1.5 flex items-center gap-2">
          <span>Payload</span>
          <span className="numeric">{bytes(sample.payloadLen)}</span>
          <span className="numeric truncate">{sample.encoding}</span>
          {sample.previewIsHex ? <Badge tone="warn">hex</Badge> : null}
          {sample.truncated ? <Badge tone="neutral">truncated</Badge> : null}
        </div>
        <pre className="scroll-thin selectable numeric rounded-inner bg-surface-2 text-tiny text-ink-muted max-h-32 overflow-auto p-3 break-all whitespace-pre-wrap">
          {sample.preview}
        </pre>
      </div>

      {sample.attachmentLen === null ? null : (
        <div>
          <div className="text-tiny text-ink-faint mb-1.5 flex items-center gap-2">
            <span>Attachment</span>
            <span className="numeric">{bytes(sample.attachmentLen)}</span>
          </div>
          <pre className="scroll-thin selectable numeric rounded-inner bg-surface-2 text-tiny text-ink-muted max-h-24 overflow-auto p-3 break-all whitespace-pre-wrap">
            {sample.attachmentPreview}
          </pre>
        </div>
      )}
    </div>
  );
}

/** The live sample feed. */
export function SampleTable({ samples, selected, onSelect }: SampleTableProps) {
  return (
    <DataTable
      id="keyspace-samples"
      follow
      columns={COLUMNS}
      rows={samples}
      rowKey={(row) => row.seq}
      selectedKey={selected}
      onSelect={onSelect}
      renderDetail={(row) => <SampleDetail sample={row} />}
      className="flex-1"
    />
  );
}
