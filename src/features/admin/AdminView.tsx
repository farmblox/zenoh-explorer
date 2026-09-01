import { useState } from "react";
import { AtSign, Play } from "lucide-react";

import { Badge, Button, DataTable, EmptyState, Input, type Column } from "@/components/ui";
import { KeyExpr } from "@/components/domain";
import { data as dataIpc, type SampleRecord } from "@/ipc";
import { useAsync } from "@/hooks";
import { bytes } from "@/lib/format";
import { useActiveSessionId } from "@/stores";
import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";
import { ViewHeader } from "@/shell/ViewHeader";

/** Everything every node publishes about itself. */
const DEFAULT_SELECTOR = "@/*/*";

/** Subtrees worth one click, since the admin space is not self-documenting. */
const PRESETS = [
  { label: "Nodes", selector: "@/*/*" },
  { label: "Link-state", selector: "@/*/*/linkstate/*" },
  { label: "Subscribers", selector: "@/*/*/subscriber/**" },
  { label: "Publishers", selector: "@/*/*/publisher/**" },
  { label: "Queryables", selector: "@/*/*/queryable/**" },
  { label: "Metrics", selector: "@/*/*/metrics" },
] as const;

const COLUMNS: readonly Column<SampleRecord>[] = [
  {
    id: "key",
    header: "Key",
    width: 380,
    cell: (row) => <KeyExpr value={row.keyExpr} highlightWildcards={false} className="text-tiny" />,
  },
  {
    id: "encoding",
    header: "Encoding",
    width: 140,
    cell: (row) => <span className="numeric text-ink-muted truncate">{row.encoding}</span>,
  },
  {
    id: "bytes",
    header: "Bytes",
    width: 80,
    align: "right",
    cell: (row) => <span className="numeric text-ink-muted">{bytes(row.payloadLen)}</span>,
  },
  {
    id: "value",
    header: "Value",
    width: "flex",
    cell: (row) => (
      <span className="numeric text-ink-muted truncate" title={row.preview}>
        {row.preview}
      </span>
    ),
  },
];

/**
 * The admin space browser.
 *
 * Zenoh's admin space is just keys under `@`, so this is a query view with
 * presets rather than a bespoke protocol client — which means anything Zenoh
 * adds to the admin space is browsable here on day one.
 */
export function AdminView() {
  const sessionId = useActiveSessionId();
  const [selector, setSelector] = useState<string>(DEFAULT_SELECTOR);
  const [submitted, setSubmitted] = useState<string>(DEFAULT_SELECTOR);

  const { data, loading, error } = useAsync(
    () => (sessionId ? dataIpc.query(sessionId, submitted, 3_000) : Promise.resolve([])),
    `admin:${sessionId ?? ""}:${submitted}`,
    { enabled: sessionId !== null },
  );

  if (!sessionId) {
    return (
      <EmptyState
        icon={<AtSign />}
        title="No session"
        description="Connect to a Zenoh network to browse its admin space."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title="Admin space"
        subtitle={loading ? "Querying" : `${data?.length ?? 0} replies`}
      />

      <div className="border-line shrink-0 space-y-2.5 border-b px-5 py-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(selector);
          }}
        >
          <Input
            value={selector}
            onChange={(event) => setSelector(event.target.value)}
            prefix="selector"
            mono
            spellCheck={false}
            autoComplete="off"
            containerClassName="flex-1"
          />
          <Button type="submit" variant="primary" icon={<Play size={13} />} disabled={loading}>
            Query
          </Button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.selector}
              type="button"
              onClick={() => {
                setSelector(preset.selector);
                setSubmitted(preset.selector);
              }}
              className={cn("rounded-inner", focusRing, transitionFast)}
            >
              <Badge tone={submitted === preset.selector ? "accent" : "neutral"}>
                {preset.label}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="bg-danger-subtle text-tiny text-danger shrink-0 px-5 py-2">{error}</p>
      ) : null}

      <DataTable
        columns={COLUMNS}
        rows={data ?? []}
        rowKey={(row) => `${row.keyExpr}:${row.seq}`}
        className="flex-1"
        empty={
          <EmptyState
            icon={<AtSign />}
            title="No replies"
            description="Zenoh defaults `adminspace.enabled` to false. Nodes need it switched on before they answer these queries."
          />
        }
      />
    </div>
  );
}
