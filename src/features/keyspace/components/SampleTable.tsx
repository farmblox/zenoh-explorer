import { Badge } from "@/components/ui";
import { KeyExpr } from "@/components/domain";
import { DataTable, type Column } from "@/components/ui";
import type { SampleRecord } from "@/ipc";
import { bytes, timeOfDay } from "@/lib/format";

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
    id: "payload",
    header: "Payload",
    width: "flex",
    cell: (row) => (
      <span className="numeric text-ink-muted truncate" title={row.preview}>
        {row.previewIsHex ? <span className="text-warn">hex </span> : null}
        {row.preview}
        {row.truncated ? <span className="text-ink-faint"> …</span> : null}
      </span>
    ),
  },
];

/** The live sample feed. */
export function SampleTable({ samples, selected, onSelect }: SampleTableProps) {
  return (
    <DataTable
      id="keyspace-samples"
      columns={COLUMNS}
      rows={samples}
      rowKey={(row) => row.seq}
      selectedKey={selected}
      onSelect={onSelect}
      className="flex-1"
    />
  );
}
