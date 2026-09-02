import { Badge } from "@/components/ui";
import { KeyExpr } from "@/components/domain";
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
      className="flex-1"
    />
  );
}
