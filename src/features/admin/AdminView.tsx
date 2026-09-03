import { useState } from "react";
import { AtSign, Play } from "lucide-react";

import { Badge, Button, DataTable, EmptyState, type Column } from "@/components/ui";
import { KeyExpr, KeyExprInput } from "@/components/domain";
import { data as dataIpc, type SampleRecord } from "@/ipc";
import { useAsync } from "@/hooks";
import { bytes } from "@/lib/format";
import { useActiveSessionId } from "@/stores";
import { cn } from "@/lib/cn";
import { pressable } from "@/lib/states";
import { ViewHeader } from "@/shell/ViewHeader";

/** Every router's status record, including its live session table. */
const DEFAULT_SELECTOR = "@/*/router";

/**
 * Subtrees worth one click, since the admin space is not self-documenting.
 *
 * One per handler Zenoh's admin space actually registers, so this is the whole
 * surface rather than the parts that happened to get a button.
 */
const PRESETS = [
  { label: "Routers", selector: "@/*/router" },
  { label: "Config", selector: "@/*/router/config" },
  { label: "Link-state", selector: "@/*/router/linkstate/*" },
  { label: "Subscribers", selector: "@/*/*/subscriber/**" },
  { label: "Publishers", selector: "@/*/*/publisher/**" },
  { label: "Queryables", selector: "@/*/*/queryable/**" },
  { label: "Queriers", selector: "@/*/*/querier/**" },
  { label: "Live tokens", selector: "@/*/*/token/**" },
  { label: "Routes", selector: "@/*/router/route/successor/**" },
  { label: "Plugins", selector: "@/*/router/status/plugins/**" },
  { label: "Storages", selector: "@/*/router/status/plugins/storage_manager/**" },
  { label: "Metrics", selector: "@/*/router/metrics" },
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
      <ViewHeader title="Admin space" />

      <div className="border-line shrink-0 space-y-2.5 border-b px-5 py-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(selector);
          }}
        >
          <KeyExprInput
            value={selector}
            onChange={setSelector}
            sessionId={sessionId}
            prefix="selector"
            placeholder="@/*/router/linkstate/*"
            className="flex-1"
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
              className={cn("rounded-inner", pressable)}
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
        id="admin-replies"
        columns={COLUMNS}
        rows={data ?? []}
        rowKey={(row) => `${row.keyExpr}:${row.seq}`}
        className="flex-1"
        empty={
          <EmptyState
            icon={<AtSign />}
            title="No replies"
            description="Zenoh defaults `adminspace.enabled` to false. Routers need it switched on before they expose status and session data."
          />
        }
      />
    </div>
  );
}
